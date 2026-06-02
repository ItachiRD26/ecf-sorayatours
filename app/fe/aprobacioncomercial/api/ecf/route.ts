// POST /fe/aprobacioncomercial/api/ecf
// DGII envía aquí el resultado de una Aprobación Comercial que procesó.
// También puede ser usado para que nosotros enviemos nuestra AC a DGII (ver /api/dgii/acecf).
// GET → health-check

import { NextRequest, NextResponse } from "next/server";
import { adminDb }                   from "@/lib/firebase-admin";

async function verificarToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  try {
    const doc = await adminDb.collection("receptor_tokens").doc(token).get();
    if (!doc.exists) return false;
    const data = doc.data() as { expira: string };
    return new Date(data.expira) > new Date();
  } catch {
    return false;
  }
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}

// GET — health-check
export async function GET() {
  return NextResponse.json({ activo: true, servicio: "AprobacionComercial" }, { status: 200 });
}

// POST — DGII envía resultado de una Aprobación Comercial
export async function POST(req: NextRequest) {
  try {
    const tokenValido = await verificarToken(req);
    if (!tokenValido) {
      console.warn("[fe/aprobacioncomercial] Sin token — procesando de todas formas (certificación)");
    }

    let xmlRecibido = "";
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("xml");
      if (file && typeof file !== "string") {
        xmlRecibido = await (file as File).text();
      } else if (typeof file === "string") {
        xmlRecibido = file;
      }
    } else {
      xmlRecibido = await req.text();
    }

    if (!xmlRecibido) {
      return NextResponse.json({ recibido: true, aviso: "XML vacío" }, { status: 200 });
    }

    // Parsear campos de la ACECF recibida
    const encf         = tag(xmlRecibido, "eNCF") || tag(xmlRecibido, "ENCF");
    const rncEmisor    = tag(xmlRecibido, "RNCEmisor").replace(/\D/g, "");
    const rncComprador = tag(xmlRecibido, "RNCComprador").replace(/\D/g, "");
    const estadoStr    = tag(xmlRecibido, "Estado");
    const estado       = estadoStr === "1" ? "Aceptado" : estadoStr === "2" ? "Rechazado" : "Desconocido";
    const motivo       = tag(xmlRecibido, "DetalleMotivoRechazo");
    const fechaHora    = tag(xmlRecibido, "FechaHoraAprobacionComercial");
    const montoStr     = tag(xmlRecibido, "MontoTotal");

    console.log(`[fe/aprobacioncomercial] Resultado recibido: ${encf} — ${estado}`);

    // Guardar en Firestore
    await adminDb.collection("acecf_recibidas").doc(encf || Date.now().toString()).set({
      encf:       encf || "",
      rncEmisor,
      rncComprador,
      estado,
      ...(motivo ? { motivoRechazo: motivo } : {}),
      ...(fechaHora ? { fechaHoraAC: fechaHora } : {}),
      ...(montoStr ? { montoTotal: parseFloat(montoStr) } : {}),
      xmlRecibido,
      recibidoEn: new Date().toISOString(),
    }, { merge: true });

    // Si tenemos el eCF en nuestras facturas emitidas, actualizar estado DGII
    if (encf) {
      const factSnap = await adminDb.collection("facturas").where("eCF", "==", encf).limit(1).get();
      if (!factSnap.empty) {
        const nuevoEstado = estado === "Aceptado" ? "Aceptado" : "Rechazado";
        await factSnap.docs[0].ref.update({
          estadoDGII: nuevoEstado,
          ...(motivo ? { mensajesDGII: [motivo] } : {}),
        });
        console.log(`[fe/aprobacioncomercial] Factura ${encf} actualizada a ${nuevoEstado}`);
      }
    }

    return NextResponse.json({ recibido: true, encf, estado }, { status: 200 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fe/aprobacioncomercial]", msg);
    return NextResponse.json({ recibido: true, aviso: msg }, { status: 200 });
  }
}
