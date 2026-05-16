import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const BASE_CERTECF = "https://ecf.dgii.gov.do/certecf";

// GET → devuelve la semilla actual como archivo descargable
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const res = await fetch(`${BASE_CERTECF}/autenticacion/api/autenticacion/semilla`);
  if (!res.ok) return NextResponse.json({ error: `DGII: ${res.status}` }, { status: 500 });
  const xml = await res.text();

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="semilla_${Date.now()}.xml"`,
    },
  });
}

// POST → recibe semilla firmada, devuelve token JWT completo
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let xmlFirmado = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("semilla_firmada") as File | null;
    if (!file) return NextResponse.json({ error: "semilla_firmada requerido" }, { status: 400 });
    xmlFirmado = await file.text();
  } else {
    const body = await req.json();
    xmlFirmado = body.xml_firmado ?? "";
  }

  if (!xmlFirmado)
    return NextResponse.json({ error: "XML firmado vacío" }, { status: 400 });

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");

  const res  = await fetch(
    `${BASE_CERTECF}/autenticacion/api/autenticacion/validarsemilla`,
    { method: "POST", body: form }
  );

  // Guardar respuesta RAW para debug
  const rawText    = await res.text();
  const statusCode = res.status;
  const headers    = Object.fromEntries(res.headers.entries());

  if (!res.ok) {
    return NextResponse.json({
      error:      `DGII rechazó (${statusCode})`,
      dgii_raw:   rawText,
      dgii_headers: headers,
    }, { status: 400 });
  }

  // Intentar parsear — DGII puede devolver JSON o texto plano
  let token  = "";
  let expira = "";
  let dgiiData: unknown = null;

  try {
    dgiiData = JSON.parse(rawText);
    const d = dgiiData as Record<string, string>;
    // Probar todos los campos posibles donde puede venir el token
    token  = d.token  ?? d.Token  ?? d.access_token ?? d.accessToken ?? "";
    expira = d.expira ?? d.Expira ?? d.expires_in   ?? d.expiresIn   ?? "";
  } catch {
    // No es JSON — el texto completo podría ser el token
    token = rawText.trim();
  }

  // Guardar token en Firestore para uso automático
  try {
    await adminDb.collection("config").doc("dgii_token").set({
      token,
      expira,
      creadoEn: new Date().toISOString(),
    });
  } catch { /* no bloquear si falla */ }

  return NextResponse.json({
    success:      true,
    token,
    expira,
    dgii_raw:     rawText,      // ← respuesta completa de DGII para debug
    dgii_status:  statusCode,
    token_length: token.length,
    token_es_jwt: token.includes(".") && token.split(".").length === 3,
  });
}