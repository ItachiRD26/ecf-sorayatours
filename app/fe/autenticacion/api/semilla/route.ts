// GET /fe/autenticacion/api/semilla
// DGII llama este endpoint para obtener un seed (semilla) antes de autenticarse con nosotros.
// Flujo inverso al que nosotros usamos para autenticarnos con DGII.
// Respuesta: XML con <SemillaModel><semilla>RANDOM_HEX</semilla></SemillaModel>

import { NextResponse }  from "next/server";
import { adminDb }       from "@/lib/firebase-admin";
import { randomBytes }   from "crypto";

// Semillas expiran en 10 minutos
const TTL_MS = 10 * 60 * 1000;

export async function GET() {
  try {
    // Generar semilla aleatoria de 8 chars hex
    const semilla = randomBytes(4).toString("hex").toUpperCase();
    const expira  = new Date(Date.now() + TTL_MS).toISOString();

    // Guardar en Firestore para validar luego
    await adminDb.collection("receptor_seeds").doc(semilla).set({
      semilla,
      expira,
      usada: false,
      creadoEn: new Date().toISOString(),
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<SemillaModel>\n  <semilla>${semilla}</semilla>\n</SemillaModel>`;

    return new Response(xml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fe/semilla]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
