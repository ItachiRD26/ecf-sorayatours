// Prueba si el token puede llegar al endpoint de recepción de DGII
// Envía un POST vacío solo para ver qué responde DGII (400=llegó, 404=bloqueado)
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });

  const url = "https://ecf.dgii.gov.do/certecf/recepcion/api/ecf";

  // POST vacío solo para ver si el endpoint responde con algo diferente a 404
  const res  = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    new FormData(), // form vacío
  });

  const dgiiStatus    = res.status;
  const dgiiRespuesta = await res.text();

  return NextResponse.json({
    dgii_status:    dgiiStatus,
    dgii_respuesta: dgiiRespuesta,
    interpretacion:
      dgiiStatus === 400 ? "✅ DGII recibió la petición — el VPS en DR no es necesario O el endpoint acepta IPs externas" :
      dgiiStatus === 401 ? "✅ DGII alcanzable — token inválido o expirado" :
      dgiiStatus === 403 ? "❌ Host not in allowlist — IP de Vercel bloqueada, necesitas VPS en DR" :
      dgiiStatus === 404 ? "⚠️ 404 — puede ser token expirado o IP bloqueada" :
      `HTTP ${dgiiStatus}`,
  });
}