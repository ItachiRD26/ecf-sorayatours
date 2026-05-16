import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const BASE = "https://ecf.dgii.gov.do/certecf";

// GET → devuelve la semilla actual como archivo descargable
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const res = await fetch(`${BASE}/autenticacion/api/autenticacion/semilla`);
  if (!res.ok) return NextResponse.json({ error: `DGII: ${res.status}` }, { status: 500 });
  const xml = await res.text();

  // Devolver como archivo XML descargable
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="semilla_${Date.now()}.xml"`,
    },
  });
}

// POST → recibe semilla firmada, devuelve token JWT
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

  if (!xmlFirmado) return NextResponse.json({ error: "XML firmado vacío" }, { status: 400 });

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");

  const res  = await fetch(`${BASE}/autenticacion/api/autenticacion/validarsemilla`, {
    method: "POST", body: form,
  });
  const text = await res.text();

  if (!res.ok) return NextResponse.json({ error: `DGII rechazó: ${text}` }, { status: 400 });

  let token = "";
  let expira = "";
  try {
    const data = JSON.parse(text);
    token  = data.token  ?? "";
    expira = data.expira ?? "";
  } catch { token = text; }

  return NextResponse.json({ success: true, token, expira });
}