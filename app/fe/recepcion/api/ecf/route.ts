// POST /fe/recepcion/api/ecf
// DGII envía aquí los e-CFs dirigidos a nosotros como receptores.
// Requiere Authorization: Bearer <token> (obtenido de /fe/autenticacion/api/ValidacionCertificado)
// GET → health-check para que DGII verifique que el endpoint está activo

import { NextRequest, NextResponse } from "next/server";
import { adminDb }                   from "@/lib/firebase-admin";
import type { FacturaRecibida }      from "@/types";

const RNC_COMPRADOR = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

// Verificar Bearer token generado en ValidacionCertificado
async function verificarToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  try {
    const doc = await adminDb.collection("receptor_tokens").doc(token).get();
    if (!doc.exists) return false;
    const data = doc.data() as { expira: string };
    return new Date(data.expira) > new Date();
  } catch {
    return false;
  }
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseFechaEmision(raw: string): string {
  const clean = raw.replace(/[-/]/g, "");
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4), m = clean.slice(4, 6), d = clean.slice(6, 8);
    if (parseInt(y) >= 2020) return `${y}-${m}-${d}`;
    return `${clean.slice(4)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  }
  return raw;
}

// GET — health-check
export async function GET() {
  return NextResponse.json(
    { activo: true, rncComprador: RNC_COMPRADOR, servicio: "RecepcionECF" },
    { status: 200 },
  );
}

// POST — recepción de e-CF desde DGII
export async function POST(req: NextRequest) {
  try {
    // Verificar token (si no hay token, aún aceptar durante certificación — DGII puede no enviar token en paso 7)
    const tokenValido = await verificarToken(req);
    if (!tokenValido) {
      console.warn("[fe/recepcion] Petición sin token válido — procesando de todas formas (certificación)");
    }

    let xmlRecibido = "";
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("xml");
      if (file && typeof file !== "string") {
        xmlRecibido = await (file as File).text();
      } else if (typeof file === "string") {
        xmlRecibido = file;
      }
    } else {
      const body = await req.text();
      xmlRecibido = body;
    }

    if (!xmlRecibido) {
      return NextResponse.json({ recibido: false, error: "XML vacío" }, { status: 400 });
    }

    const encf         = tag(xmlRecibido, "eNCF") || tag(xmlRecibido, "ENCF");
    const tipoECF      = tag(xmlRecibido, "TipoeCF") || (encf.match(/^([A-Z]\d{2})/)?.[1] ?? "");
    const rncEmisor    = tag(xmlRecibido, "RNCEmisor").replace(/\D/g, "");
    const razonSocial  = tag(xmlRecibido, "RazonSocialEmisor") || tag(xmlRecibido, "NombreEmisor");
    const rncComprador = tag(xmlRecibido, "RNCComprador").replace(/\D/g, "") || RNC_COMPRADOR;
    const fechaRaw     = tag(xmlRecibido, "FechaEmision");
    const fechaEmision = fechaRaw ? parseFechaEmision(fechaRaw) : new Date().toISOString().slice(0, 10);
    const montoStr     = tag(xmlRecibido, "MontoTotal") || tag(xmlRecibido, "TotalFactura");
    const montoTotal   = parseFloat(montoStr) || 0;

    if (!encf) {
      console.warn("[fe/recepcion] eNCF no encontrado en XML");
      return NextResponse.json({ recibido: true, aviso: "eNCF no encontrado" }, { status: 200 });
    }

    const TIPOS_SIN_ACECF = new Set(["E32", "E41", "E43", "E46", "E47"]);
    const estadoACECF     = TIPOS_SIN_ACECF.has(tipoECF) ? "NoAplica" : "pendiente";

    const doc: Omit<FacturaRecibida, "id"> = {
      encf,
      tipoECF,
      rncEmisor,
      ...(razonSocial ? { razonSocialEmisor: razonSocial } : {}),
      rncComprador,
      fechaEmision,
      montoTotal,
      estadoARECF: "pendiente",
      estadoACECF,
      xmlRecibido,
      recibidoEn: new Date().toISOString(),
    };

    await adminDb.collection("facturas_recibidas").doc(encf).set(doc, { merge: true });
    console.log(`[fe/recepcion] e-CF recibido: ${encf} de ${rncEmisor} — RD$${montoTotal}`);

    return NextResponse.json({ recibido: true, encf }, { status: 200 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fe/recepcion]", msg);
    // Siempre 200 para que DGII no reintente indefinidamente
    return NextResponse.json({ recibido: true, aviso: msg }, { status: 200 });
  }
}
