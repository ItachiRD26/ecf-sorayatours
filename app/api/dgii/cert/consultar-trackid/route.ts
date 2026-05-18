import { NextRequest, NextResponse } from "next/server";
import { consultarEstado } from "@/lib/dgii/dgii-client";

export async function GET(req: NextRequest) {
  const trackId = req.nextUrl.searchParams.get("trackId");
  if (!trackId) return NextResponse.json({ error: "trackId requerido" }, { status: 400 });
  try {
    const resultado = await consultarEstado(trackId);
    return NextResponse.json(resultado);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}