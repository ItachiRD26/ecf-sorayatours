// GET /api/dgii/recibidas
// Lee facturas_recibidas usando admin SDK (sin depender de reglas Firestore del cliente)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const snap = await adminDb.collection("facturas_recibidas")
      .orderBy("recibidoEn", "desc")
      .limit(200)
      .get();

    const items = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      // No devolver XMLs completos al cliente (demasiado pesados)
      const { xmlRecibido: _, xmlARECF: __, xmlACECF: ___, ...rest } = data;
      return { id: d.id, ...rest };
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/dgii/recibidas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
