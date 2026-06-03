// POST /fe/aprobacioncomercial/api/ecf
// DGII llama aquí para entregar una Aprobación Comercial (ACECF).
// La respuesta DEBE ser un ACECF firmado con nuestro certificado.
// Según XSD ACECF_v_1_0__1_.xsd — mismo formato que usamos en /api/dgii/acecf
// GET → health-check

import { NextRequest, NextResponse } from "next/server";
import { adminDb }                   from "@/lib/firebase-admin";
import { firmarXML }                 from "@/lib/dgii/xml-signer";

const RNC = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function nowFmt(): string {
  const d   = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildACECF(params: {
  rncEmisor:    string;
  encf:         string;
  fechaEmision: string;
  montoTotal:   string;
  rncComprador: string;
  estado:       1 | 2;
  motivo?:      string;
  fechaHora:    string;
}): string {
  const motivoTag = params.estado === 2 && params.motivo
    ? `<DetalleMotivoRechazo>${params.motivo.substring(0, 250)}</DetalleMotivoRechazo>`
    : "";
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<ACECF>`,
    `<DetalleAprobacionComercial>`,
    `<Version>1.0</Version>`,
    `<RNCEmisor>${params.rncEmisor}</RNCEmisor>`,
    `<eNCF>${params.encf}</eNCF>`,
    `<FechaEmision>${params.fechaEmision}</FechaEmision>`,
    `<MontoTotal>${params.montoTotal}</MontoTotal>`,
    `<RNCComprador>${params.rncComprador}</RNCComprador>`,
    `<Estado>${params.estado}</Estado>`,
    motivoTag,
    `<FechaHoraAprobacionComercial>${params.fechaHora}</FechaHoraAprobacionComercial>`,
    `</DetalleAprobacionComercial>`,
    `</ACECF>`,
  ].filter(Boolean).join("");
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

// GET — health-check
export async function GET() {
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><ACECF><estado>OK</estado></ACECF>`);
}

// POST — DGII envía una ACECF, respondemos con nuestra ACECF firmada
export async function POST(req: NextRequest) {
  try {
    const tokenValido = await verificarToken(req);
    if (!tokenValido) {
      console.warn("[fe/aprobacioncomercial] Sin token — procesando (certificación)");
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

    const fechaHora = nowFmt();

    // Parsear ACECF recibida de DGII
    const encf         = tag(xmlRecibido, "eNCF") || tag(xmlRecibido, "ENCF") || "0";
    const rncEmisor    = tag(xmlRecibido, "RNCEmisor").replace(/\D/g, "") || "0";
    const rncComprador = tag(xmlRecibido, "RNCComprador").replace(/\D/g, "") || RNC;
    const estadoStr    = tag(xmlRecibido, "Estado");
    const estadoNum    = estadoStr === "2" ? 2 : 1;
    const estado       = estadoNum === 1 ? "Aceptado" : "Rechazado";
    const motivo       = tag(xmlRecibido, "DetalleMotivoRechazo");
    const fechaEmision = tag(xmlRecibido, "FechaEmision") || nowFmt().split(" ")[0];
    const montoStr     = tag(xmlRecibido, "MontoTotal") || "0.00";

    console.log(`[fe/aprobacioncomercial] ACECF recibida: ${encf} — ${estado}`);

    // Guardar en Firestore
    if (xmlRecibido) {
      await adminDb.collection("acecf_recibidas").doc(encf).set({
        encf, rncEmisor, rncComprador, estado,
        ...(motivo ? { motivoRechazo: motivo } : {}),
        fechaHoraAC: fechaHora,
        montoTotal:  parseFloat(montoStr) || 0,
        xmlRecibido,
        recibidoEn: new Date().toISOString(),
      }, { merge: true });

      // Actualizar estado de factura emitida si existe
      if (encf !== "0") {
        const factSnap = await adminDb.collection("facturas")
          .where("eCF", "==", encf).limit(1).get();
        if (!factSnap.empty) {
          await factSnap.docs[0].ref.update({
            estadoDGII: estado === "Aceptado" ? "Aceptado" : "Rechazado",
            ...(motivo ? { mensajesDGII: [motivo] } : {}),
          });
        }
      }
    }

    // Construir y firmar nuestra ACECF de respuesta
    const acecfXml = buildACECF({
      rncEmisor,
      encf,
      fechaEmision,
      montoTotal:   montoStr,
      rncComprador: RNC,
      estado:       1,   // siempre Aceptado en nuestra respuesta
      fechaHora,
    });

    const acecfFirmado = await firmarXML(acecfXml);

    // Guardar ACECF enviada
    if (encf !== "0") {
      await adminDb.collection("acecf_recibidas").doc(encf).update({
        xmlACECFEnviada: acecfFirmado,
        fechaRespuesta:  new Date().toISOString(),
      });
    }

    return xmlResponse(acecfFirmado);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fe/aprobacioncomercial]", msg);
    // Fallback sin firma para no bloquear a DGII
    const fallback = buildACECF({
      rncEmisor: "0", encf: "0", fechaEmision: nowFmt().split(" ")[0],
      montoTotal: "0.00", rncComprador: RNC, estado: 1, fechaHora: nowFmt(),
    });
    return xmlResponse(fallback);
  }
}

async function verificarToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  try {
    const doc = await adminDb.collection("receptor_tokens").doc(token).get();
    if (!doc.exists) return false;
    const data = doc.data() as { expira: string };
    return new Date(data.expira) > new Date();
  } catch { return false; }
}
