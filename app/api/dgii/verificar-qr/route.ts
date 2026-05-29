// Verifica que el CodigoSeguridad almacenado coincide con el calculado del XML
// GET /api/dgii/verificar-qr?ecf=E310000000054
// GET /api/dgii/verificar-qr?id=<facturaId>

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { calcularCodigoSeguridad }   from "@/lib/dgii/qr-builder";
import type { Factura }              from "@/types";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ecf = searchParams.get("ecf");
  const id  = searchParams.get("id");

  try {
    let snap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (id) {
      snap = await adminDb.collection("facturas").doc(id).get();
    } else if (ecf) {
      const q = await adminDb.collection("facturas").where("eCF", "==", ecf).limit(1).get();
      snap = q.docs[0] ?? null;
    }

    if (!snap?.exists) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    const factura = { id: snap.id, ...snap.data() } as Factura;

    if (!factura.xmlFirmado) {
      return NextResponse.json({ error: "xmlFirmado no almacenado para esta factura" }, { status: 400 });
    }

    // Extraer SignatureValue del XML
    const sigMatch = factura.xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    const signatureValue = sigMatch?.[1]?.replace(/\s/g, "") ?? "";

    if (!signatureValue) {
      return NextResponse.json({ error: "SignatureValue no encontrado en el XML" }, { status: 400 });
    }

    // Calcular CodigoSeguridad desde el SignatureValue
    const codigoCalculado = calcularCodigoSeguridad(signatureValue);

    const coincide = codigoCalculado === factura.codigoSeguridad;

    return NextResponse.json({
      facturaId:          snap.id,
      eCF:                factura.eCF,
      tipoECF:            factura.tipoECF,
      // Verificación del código
      codigoAlmacenado:   factura.codigoSeguridad ?? "(no guardado)",
      codigoCalculado,
      coincide,
      // SignatureValue (primeros y últimos 20 chars para no exponer todo)
      signatureValueHead: signatureValue.substring(0, 20) + "...",
      signatureValueTail: "..." + signatureValue.substring(signatureValue.length - 20),
      signatureValueLen:  signatureValue.length,
      // URL almacenada
      urlQR:              factura.urlQR ?? "(sin urlQR)",
      // Fechas
      fechaEnvioDGII:     factura.fechaEnvioDGII ?? "(no enviada)",
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
