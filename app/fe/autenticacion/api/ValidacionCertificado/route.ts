// POST /fe/autenticacion/api/ValidacionCertificado
// DGII firma nuestra semilla con su certificado y nos la envía aquí.
// Nosotros verificamos que la semilla existe y no está vencida, y devolvemos un token de sesión.
// Formato entrada: multipart/form-data con campo "xml" (XML firmado por DGII)
// Formato salida:  JSON { token, expira }

import { NextRequest, NextResponse } from "next/server";
import { adminDb }                   from "@/lib/firebase-admin";
import { randomBytes }               from "crypto";

// Tokens de sesión expiran en 4 horas
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function extraerSemilla(xml: string): string {
  const m = xml.match(/<semilla[^>]*>([\s\S]*?)<\/semilla>/i);
  return m?.[1]?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  try {
    let xmlFirmado = "";
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("xml");
      if (file && typeof file !== "string") {
        xmlFirmado = await (file as File).text();
      } else if (typeof file === "string") {
        xmlFirmado = file;
      }
    } else if (ct.includes("application/xml") || ct.includes("text/xml")) {
      xmlFirmado = await req.text();
    } else {
      xmlFirmado = await req.text();
    }

    if (!xmlFirmado) {
      return NextResponse.json({ error: "XML requerido" }, { status: 400 });
    }

    // Extraer semilla del XML firmado
    const semilla = extraerSemilla(xmlFirmado);
    if (!semilla) {
      return NextResponse.json({ error: "Semilla no encontrada en XML" }, { status: 400 });
    }

    // Verificar semilla en Firestore
    const seedDoc = await adminDb.collection("receptor_seeds").doc(semilla).get();
    if (!seedDoc.exists) {
      return NextResponse.json({ error: "Semilla inválida" }, { status: 401 });
    }

    const seedData = seedDoc.data() as { expira: string; usada: boolean };

    // Verificar que no esté vencida ni usada
    if (new Date(seedData.expira) < new Date()) {
      return NextResponse.json({ error: "Semilla vencida" }, { status: 401 });
    }
    if (seedData.usada) {
      return NextResponse.json({ error: "Semilla ya utilizada" }, { status: 401 });
    }

    // Marcar como usada
    await adminDb.collection("receptor_seeds").doc(semilla).update({ usada: true });

    // Generar token de sesión
    const token  = randomBytes(32).toString("hex");
    const expira = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    await adminDb.collection("receptor_tokens").doc(token).set({
      token,
      expira,
      semilla,
      creadoEn: new Date().toISOString(),
    });

    console.log("[fe/ValidacionCertificado] Token generado para semilla:", semilla);

    return NextResponse.json({ token, expira });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fe/ValidacionCertificado]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
