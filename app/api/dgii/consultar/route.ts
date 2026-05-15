import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { consultarEstado }           from "@/lib/dgii/dgii-client";

async function verificarSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie);
    return decoded.uid;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { facturaId } = await req.json();
    if (!facturaId) return NextResponse.json({ error: "facturaId requerido" }, { status: 400 });

    const snap = await adminDb.collection("facturas").doc(facturaId).get();
    if (!snap.exists) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

    const data    = snap.data()!;
    const trackId = data.trackIdDGII as string | undefined;
    if (!trackId) return NextResponse.json({ error: "Factura sin TrackId — no ha sido enviada a DGII" }, { status: 400 });

    // Consultar estado en DGII
    const resultado = await consultarEstado(trackId);

    // Actualizar estado en Firestore
    await adminDb.collection("facturas").doc(facturaId).update({
      estadoDGII:             resultado.estado,
      mensajesDGII:           resultado.mensajes,
      fechaConsultaDGII:      new Date().toISOString(),
    });

    return NextResponse.json({
      success:  true,
      trackId,
      estado:   resultado.estado,
      mensajes: resultado.mensajes,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[DGII/consultar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}