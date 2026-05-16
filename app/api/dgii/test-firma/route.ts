// Endpoint temporal de diagnóstico — prueba los dos formatos de envío
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { firmarXML } from "@/lib/dgii/xml-signer";

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
  const base = `https://ecf.dgii.gov.do/${amb}`;
  const url  = `${base}/autenticacion/api/autenticacion/validarsemilla`;

  // 1. Obtener semilla
  const semRes    = await fetch(`${base}/autenticacion/api/autenticacion/semilla`);
  const semillaXml = await semRes.text();

  // 2. Firmar
  let xmlFirmado = "";
  let errorFirma = "";
  try { xmlFirmado = await firmarXML(semillaXml); }
  catch (e: unknown) { errorFirma = e instanceof Error ? e.message : String(e); }

  if (!xmlFirmado) return NextResponse.json({ error_firma: errorFirma });

  // 3. Intento A — multipart/form-data (actual)
  let statusA = 0, respuestaA = "";
  try {
    const form = new FormData();
    form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");
    const r = await fetch(url, { method: "POST", body: form });
    statusA    = r.status;
    respuestaA = await r.text();
  } catch (e: unknown) { respuestaA = String(e); }

  // 4. Intento B — raw XML body (application/xml)
  let statusB = 0, respuestaB = "";
  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/xml" },
      body:    xmlFirmado,
    });
    statusB    = r.status;
    respuestaB = await r.text();
  } catch (e: unknown) { respuestaB = String(e); }

  // 5. Intento C — raw XML body (text/xml)
  let statusC = 0, respuestaC = "";
  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body:    xmlFirmado,
    });
    statusC    = r.status;
    respuestaC = await r.text();
  } catch (e: unknown) { respuestaC = String(e); }

  return NextResponse.json({
    ambiente: amb,
    semilla_ok: semRes.ok,
    firma_ok:   !errorFirma,
    "A_multipart/form-data": { status: statusA, respuesta: respuestaA },
    "B_application/xml":     { status: statusB, respuesta: respuestaB },
    "C_text/xml":            { status: statusC, respuesta: respuestaC },
    xml_preview: xmlFirmado.substring(0, 500),
  });
}