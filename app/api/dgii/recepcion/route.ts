// Webhook de Recepción DGII — Pasos 7-11 de Certificación
// DGII registra esta URL y la llama cuando emite un e-CF dirigido a nosotros.
// GET  → health-check (DGII verifica que el endpoint está activo)
// POST → DGII envía el XML firmado del e-CF recibido (multipart: campo "xml")

import { NextRequest, NextResponse } from "next/server";
import { adminDb }                   from "@/lib/firebase-admin";
import type { FacturaRecibida }      from "@/types";

const RNC_COMPRADOR = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

// Extrae el contenido de la primera etiqueta XML que coincida (sin namespaces)
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseFechaEmision(raw: string): string {
  // Formatos posibles: YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
  const clean = raw.replace(/[-/]/g, "");
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4), m = clean.slice(4, 6), d = clean.slice(6, 8);
    // Si año parece válido (2020-2099) → YYYY MM DD
    if (parseInt(y) >= 2020) return `${y}-${m}-${d}`;
    // Podría ser DD MM YYYY
    return `${clean.slice(4)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  }
  return raw;
}

// ─── GET — health-check para que DGII verifique el endpoint ──────────────────
export async function GET() {
  return NextResponse.json(
    { activo: true, rncComprador: RNC_COMPRADOR, servicio: "RecepcionECF" },
    { status: 200 },
  );
}

// ─── POST — DGII envía un e-CF firmado como multipart ────────────────────────
export async function POST(req: NextRequest) {
  try {
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
    } else if (ct.includes("application/xml") || ct.includes("text/xml")) {
      xmlRecibido = await req.text();
    } else {
      // Intentar como texto plano
      const body = await req.text();
      if (body.trimStart().startsWith("<")) {
        xmlRecibido = body;
      } else {
        // Podría ser JSON con campo xml
        try {
          const j = JSON.parse(body);
          xmlRecibido = j.xml ?? j.xmlFirmado ?? "";
        } catch { /* ignorar */ }
      }
    }

    if (!xmlRecibido) {
      console.warn("[DGII/recepcion] POST sin XML — body vacío o formato inesperado");
      return NextResponse.json({ error: "XML no recibido" }, { status: 400 });
    }

    // Extraer campos clave del XML del e-CF
    const encf            = tag(xmlRecibido, "eNCF") || tag(xmlRecibido, "ENCF");
    const tipoECF         = tag(xmlRecibido, "TipoeCF") || (encf.match(/^([A-Z]\d{2})/)?.[1] ?? "");
    const rncEmisor       = tag(xmlRecibido, "RNCEmisor").replace(/\D/g, "");
    const razonSocial     = tag(xmlRecibido, "RazonSocialEmisor") || tag(xmlRecibido, "NombreEmisor");
    const rncComprador    = tag(xmlRecibido, "RNCComprador").replace(/\D/g, "") || RNC_COMPRADOR;
    const fechaRaw        = tag(xmlRecibido, "FechaEmision");
    const fechaEmision    = fechaRaw ? parseFechaEmision(fechaRaw) : new Date().toISOString().slice(0, 10);
    const montoStr        = tag(xmlRecibido, "MontoTotal") || tag(xmlRecibido, "TotalFactura");
    const montoTotal      = parseFloat(montoStr) || 0;

    if (!encf) {
      console.warn("[DGII/recepcion] No se pudo extraer eNCF del XML recibido");
      return NextResponse.json({ error: "eNCF no encontrado en XML" }, { status: 422 });
    }

    // E32, E41, E43, E46, E47 no requieren ACECF
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

    console.log(`[DGII/recepcion] e-CF recibido: ${encf} de RNC ${rncEmisor} — monto: ${montoTotal}`);

    // DGII espera un 200 simple para confirmar recepción
    return NextResponse.json({ recibido: true, encf }, { status: 200 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DGII/recepcion]", msg);
    // Devolver 200 de todas formas para que DGII no reintente indefinidamente
    return NextResponse.json({ error: msg }, { status: 200 });
  }
}
