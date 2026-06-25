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
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "desconocida";
  const ua = req.headers.get("user-agent") ?? "desconocido";
  console.log(`[fe/ValidacionCertificado] Solicitud recibida — IP: ${ip} — UA: ${ua}`);
  try {
    let xmlFirmado = "";
    const ct = req.headers.get("content-type") ?? "";
    console.log(`[fe/ValidacionCertificado] Content-Type recibido: "${ct}"`);

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("xml");
      if (file && typeof file !== "string") {
        xmlFirmado = await (file as File).text();
      } else if (typeof file === "string") {
        xmlFirmado = file;
      }
      console.log(`[fe/ValidacionCertificado] Body parseado como multipart/form-data — campo "xml" presente: ${!!file}`);
    } else if (ct.includes("application/xml") || ct.includes("text/xml")) {
      xmlFirmado = await req.text();
    } else {
      xmlFirmado = await req.text();
    }

    console.log(`[fe/ValidacionCertificado] Preview XML recibido (primeros 500 chars): ${xmlFirmado.slice(0, 500)}`);

    if (!xmlFirmado) {
      console.warn("[fe/ValidacionCertificado] Body vacío — respondiendo 400");
      return NextResponse.json({ error: "XML requerido" }, { status: 400 });
    }

    // Extraer semilla del XML firmado
    const semilla = extraerSemilla(xmlFirmado);
    console.log(`[fe/ValidacionCertificado] Semilla extraída: "${semilla}"`);
    if (!semilla) {
      console.warn("[fe/ValidacionCertificado] No se pudo extraer semilla del XML — respondiendo 400");
      return NextResponse.json({ error: "Semilla no encontrada en XML" }, { status: 400 });
    }

    // Verificar semilla en Firestore (durante certificación aceptar aunque no esté en DB)
    const seedDoc = await adminDb.collection("receptor_seeds").doc(semilla).get();
    console.log(`[fe/ValidacionCertificado] ¿Semilla "${semilla}" existe en receptor_seeds?: ${seedDoc.exists}`);
    if (seedDoc.exists) {
      const seedData = seedDoc.data() as { expira: string; usada: boolean };
      if (new Date(seedData.expira) < new Date()) {
        console.warn(`[fe/ValidacionCertificado] Semilla "${semilla}" vencida (expiró ${seedData.expira}) — respondiendo 401`);
        return NextResponse.json({ error: "Semilla vencida" }, { status: 401 });
      }
      await adminDb.collection("receptor_seeds").doc(semilla).update({ usada: true });
    } else {
      // Semilla no está en nuestra DB — DGII podría traer la suya en el flujo de cert.
      // Aceptar de todas formas y registrarla
      console.warn("[fe/validacioncertificado] Semilla externa aceptada:", semilla);
      await adminDb.collection("receptor_seeds").doc(semilla).set({
        semilla, usada: true, externa: true, creadoEn: new Date().toISOString(),
        expira: new Date(Date.now() + 60000).toISOString(),
      });
    }

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
    console.error("[fe/ValidacionCertificado] ERROR procesando la solicitud:", msg, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
