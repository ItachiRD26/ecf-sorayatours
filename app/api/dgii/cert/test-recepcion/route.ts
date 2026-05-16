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

  // Decodificar JWT para ver si está expirado
  let tokenInfo = { expirado: false, expira: "", segundosRestantes: 0 };
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const ahora   = Math.floor(Date.now() / 1000);
    const expira  = new Date(payload.exp * 1000).toISOString();
    const restantes = payload.exp - ahora;
    tokenInfo = {
      expirado:         restantes <= 0,
      expira,
      segundosRestantes: Math.max(0, restantes),
    };
  } catch { /* ignore */ }

  const url = "https://ecf.dgii.gov.do/CerteCF/Recepcion/api/FacturasElectronicas";

  const res  = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    new FormData(),
  });

  const dgiiStatus    = res.status;
  const dgiiRespuesta = await res.text();

  const interpretacion =
    tokenInfo.expirado                     ? "⏰ TOKEN EXPIRADO — obtén uno nuevo en el Paso 3" :
    dgiiStatus === 400                     ? "✅ DGII recibió la petición — Vercel SÍ llega a DGII" :
    dgiiStatus === 401                     ? "✅ DGII alcanzable — token rechazado pero endpoint existe" :
    dgiiStatus === 403                     ? "❌ Host not in allowlist — IP de Vercel bloqueada, necesitas VPS" :
    dgiiStatus === 404 && !tokenInfo.expirado ? "❓ 404 con token vigente — investigando" :
    `HTTP ${dgiiStatus}`;

  return NextResponse.json({
    token_expirado:       tokenInfo.expirado,
    token_expira:         tokenInfo.expira,
    token_minutos_restantes: Math.floor(tokenInfo.segundosRestantes / 60),
    dgii_status:          dgiiStatus,
    dgii_respuesta:       dgiiRespuesta.substring(0, 300),
    interpretacion,
  });
}