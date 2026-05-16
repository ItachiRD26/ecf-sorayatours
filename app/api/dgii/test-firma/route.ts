// Endpoint temporal — muestra el XML firmado SIN enviarlo a DGII
// Para comparar estructura con la firma correcta de la postulación
import { NextRequest, NextResponse } from "next/server";
import { adminAuth }  from "@/lib/firebase-admin";
import { firmarXML }  from "@/lib/dgii/xml-signer";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const amb  = process.env.DGII_AMBIENTE ?? "testecf";
  const base = amb === "certecf"
    ? "https://ecf.dgii.gov.do/certecf"
    : "https://ecf.dgii.gov.do/testecf";

  // 1. Obtener semilla
  const semRes = await fetch(`${base}/autenticacion/api/autenticacion/semilla`, {
    headers: { accept: "*/*" },
  });
  const semillaXml = await semRes.text();

  // 2. Firmar (sin enviar)
  let xmlFirmado = "";
  let errorFirma = "";
  try {
    xmlFirmado = await firmarXML(semillaXml);
  } catch (e: unknown) {
    errorFirma = e instanceof Error ? e.message : String(e);
  }

  // 3. Intentar enviar y capturar respuesta RAW de DGII
  let dgiiStatus = 0;
  let dgiiRespuesta = "";
  if (xmlFirmado) {
    try {
      const form = new FormData();
      form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");
      const r = await fetch(`${base}/autenticacion/api/autenticacion/validarsemilla`, {
        method: "POST", body: form,
      });
      dgiiStatus = r.status;
      dgiiRespuesta = await r.text();
    } catch (e: unknown) {
      dgiiRespuesta = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    semilla_original:    semillaXml,
    error_firma:         errorFirma || null,
    xml_firmado_preview: xmlFirmado.substring(0, 2000),
    dgii_status:         dgiiStatus,
    dgii_respuesta_raw:  dgiiRespuesta,
  });
}