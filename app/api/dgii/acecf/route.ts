// Aprobación Comercial e-CF (ACECF) — Producción
// Aplica a: E31, E33, E34, E44, E45 (NO aplica a E32, E41, E43, E46, E47)
// XSD: ACECF_v_1_0__1_.xsd
// CerteCF: POST /CerteCF/AprobacionComercial/api/AprobacionComercial
// testecf:  POST /testecf/emisorreceptor/fe/aprobacioncomercial/api/ecf
// ecf prod: POST /ecf/emisorreceptor/fe/aprobacioncomercial/api/ecf

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { firmarXML }                 from "@/lib/dgii/xml-signer";
import { getToken }                  from "@/lib/dgii/dgii-client";

const ECF_HOST      = "https://ecf.dgii.gov.do";
const RNC_COMPRADOR = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

const TIPOS_SIN_AC = new Set(["E32", "E41", "E43", "E46", "E47"]);

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

function acecfUrl(): string {
  if (process.env.DGII_AC_URL) return process.env.DGII_AC_URL;
  const amb = (process.env.DGII_AMBIENTE ?? "ecf").toLowerCase();
  if (amb === "certecf") return `${ECF_HOST}/CerteCF/AprobacionComercial/api/AprobacionComercial`;
  if (amb === "ecf")     return `${ECF_HOST}/ecf/emisorreceptor/fe/aprobacioncomercial/api/ecf`;
  return `${ECF_HOST}/${amb}/emisorreceptor/fe/aprobacioncomercial/api/ecf`;
}

function buildACECFXml(p: {
  rncEmisor:     string;
  encf:          string;
  fechaEmision:  string;   // dd-MM-YYYY
  montoTotal:    number;
  rncComprador:  string;
  estado:        1 | 2;    // 1=Aceptado, 2=Rechazado
  motivoRechazo?: string;
  fechaHoraAC:   string;  // dd-MM-YYYY HH:mm:ss
}): string {
  const motivoTag = p.estado === 2 && p.motivoRechazo
    ? `<DetalleMotivoRechazo>${p.motivoRechazo.substring(0, 250)}</DetalleMotivoRechazo>`
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<ACECF>`,
    `<DetalleAprobacionComercial>`,
    `<Version>1.0</Version>`,
    `<RNCEmisor>${p.rncEmisor}</RNCEmisor>`,
    `<eNCF>${p.encf}</eNCF>`,
    `<FechaEmision>${p.fechaEmision}</FechaEmision>`,
    `<MontoTotal>${p.montoTotal.toFixed(2)}</MontoTotal>`,
    `<RNCComprador>${p.rncComprador}</RNCComprador>`,
    `<Estado>${p.estado}</Estado>`,
    motivoTag,
    `<FechaHoraAprobacionComercial>${p.fechaHoraAC}</FechaHoraAprobacionComercial>`,
    `</DetalleAprobacionComercial>`,
    `</ACECF>`,
  ].filter(Boolean).join("");
}

async function enviarACECF(
  xmlFirmado: string,
  encf:       string,
  token:      string,
): Promise<{ mensaje: string; estado: string; codigo: string }> {
  const url      = acecfUrl();
  const filename = `${RNC_COMPRADOR}${encf}.xml`;

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), filename);

  const res  = await fetch(url, {
    method:  "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body:    form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DGII ACECF ${res.status}: ${text.substring(0, 400)}`);

  try {
    const data = JSON.parse(text);
    return {
      mensaje: Array.isArray(data.mensaje) ? data.mensaje.join("; ") : (data.mensaje ?? "OK"),
      estado:  data.estado  ?? "OK",
      codigo:  data.codigo  ?? "200",
    };
  } catch {
    return {
      mensaje: text.match(/<mensaje>(.*?)<\/mensaje>/i)?.[1] ?? text.substring(0, 200),
      estado:  text.match(/<estado>(.*?)<\/estado>/i)?.[1]   ?? "OK",
      codigo:  text.match(/<codigo>(.*?)<\/codigo>/i)?.[1]   ?? "200",
    };
  }
}

// ─── POST /api/dgii/acecf ────────────────────────────────────────────────────
// Body: { encf, rncEmisor?, fechaEmision, montoTotal, estado?, motivoRechazo?, token? }
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json() as {
      encf:           string;
      rncEmisor?:     string;
      fechaEmision?:  string;   // dd-MM-YYYY — si falta se lee de Firestore
      montoTotal?:    number | string;
      estado?:        number;
      motivoRechazo?: string;
      fechaHoraAC?:   string;
      token?:         string;
    };

    const { encf, motivoRechazo } = body;
    if (!encf)
      return NextResponse.json({ error: "encf requerido" }, { status: 400 });

    // Verificar tipo — algunos tipos no tienen ACECF
    const tipo = encf.match(/^([A-Z]\d{2})/)?.[1] ?? "";
    if (TIPOS_SIN_AC.has(tipo))
      return NextResponse.json(
        { error: `Aprobación Comercial no aplica para ${tipo}` },
        { status: 400 },
      );

    // Leer datos de Firestore si no vienen en el body
    let rncEmisor    = (body.rncEmisor ?? "").replace(/\D/g, "");
    let fechaEmision = body.fechaEmision ?? "";
    let montoTotal   = typeof body.montoTotal === "string"
      ? parseFloat(body.montoTotal)
      : (body.montoTotal ?? 0);

    if (!rncEmisor || !fechaEmision || !montoTotal) {
      const snap = await adminDb.collection("facturas_recibidas").doc(encf).get();
      if (snap.exists) {
        const d = snap.data() as { rncEmisor?: string; fechaEmision?: string; montoTotal?: number };
        if (!rncEmisor)    rncEmisor    = d.rncEmisor?.replace(/\D/g, "") ?? "";
        if (!fechaEmision) fechaEmision = d.fechaEmision ?? "";
        if (!montoTotal)   montoTotal   = d.montoTotal   ?? 0;
      }
    }

    if (!rncEmisor || !fechaEmision)
      return NextResponse.json(
        { error: "rncEmisor y fechaEmision requeridos" },
        { status: 400 },
      );

    // Normalizar fechaEmision a dd-MM-YYYY
    let fechaFmt = fechaEmision;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) {
      const [y, m, d2] = fechaEmision.split("-");
      fechaFmt = `${d2}-${m}-${y}`;
    }

    const estado = (body.estado === 2 ? 2 : 1) as 1 | 2;

    const now = new Date();
    const p   = (n: number) => String(n).padStart(2, "0");
    const fechaHoraAC = body.fechaHoraAC?.trim() ||
      `${p(now.getDate())}-${p(now.getMonth()+1)}-${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

    const token = body.token || await getToken();

    // 1. Construir XML
    const xmlSinFirma = buildACECFXml({
      rncEmisor,
      encf,
      fechaEmision: fechaFmt,
      montoTotal,
      rncComprador: RNC_COMPRADOR,
      estado,
      motivoRechazo,
      fechaHoraAC,
    });

    // 2. Firmar
    const xmlFirmado = await firmarXML(xmlSinFirma);

    // 3. Enviar a DGII
    const resultado = await enviarACECF(xmlFirmado, encf, token);

    // 4. Actualizar Firestore
    const estadoTexto: "Aceptado" | "Rechazado" = estado === 1 ? "Aceptado" : "Rechazado";
    const update: Record<string, unknown> = {
      estadoACECF: estadoTexto,
      fechaACECF:  new Date().toISOString(),
      xmlACECF:    xmlFirmado,
    };
    if (estado === 2 && motivoRechazo) update.motivoRechazoACECF = motivoRechazo;

    await adminDb.collection("facturas_recibidas").doc(encf).update(update);

    return NextResponse.json({
      success: true,
      encf,
      estado:  resultado.estado,
      mensaje: resultado.mensaje,
      codigo:  resultado.codigo,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DGII/acecf]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/dgii/acecf — lista aprobaciones enviadas ───────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("facturas_recibidas")
    .where("estadoACECF", "in", ["Aceptado", "Rechazado"])
    .orderBy("fechaACECF", "desc")
    .limit(100)
    .get();

  const items = snap.docs.map(d => {
    const { xmlRecibido: _, xmlARECF: __, xmlACECF: ___, ...rest } = d.data() as Record<string, unknown>;
    return { id: d.id, ...rest };
  });

  return NextResponse.json({ items });
}
