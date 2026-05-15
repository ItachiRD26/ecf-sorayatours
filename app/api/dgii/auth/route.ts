import { NextRequest, NextResponse } from "next/server";
import { adminAuth }   from "@/lib/firebase-admin";
import { getToken }    from "@/lib/dgii/dgii-client";

async function verificarSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie);
    return decoded.uid;
  } catch { return null; }
}

// GET → probar autenticación con DGII y retornar estado del token
export async function GET(req: NextRequest) {
  try {
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const token = await getToken();
    return NextResponse.json({
      success:  true,
      ambiente: process.env.DGII_AMBIENTE ?? "testecf",
      token:    token.substring(0, 20) + "...", // Solo mostrar el inicio por seguridad
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}