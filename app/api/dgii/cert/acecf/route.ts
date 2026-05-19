// Paso 3 Certificación DGII — Aprobaciones / Rechazos Comerciales (ACECF)
// Documentación: Formato_Aprobación_Comercial_v1_0.pdf + ACECF_v_1_0__1_.xsd
//
// Endpoint DGII CerteCF:
//   POST https://ecf.dgii.gov.do/certecf/emisorreceptor/fe/aprobacioncomercial/api/ecf
//   Content-Type: multipart/form-data  |  field: xml
//   Authorization: Bearer <token>
//
// Tipos que NO requieren AC: E32, E41, E43, E46, E47
// Tipos que SÍ requieren AC: E31, E33, E34, E44, E45 (y sus variantes)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { firmarXML }                 from "@/lib/dgii/xml-signer";

// ── Constantes ──────────────────────────────────────────────────────────────
const ECF_HOST = "https://ecf.dgii.gov.do";
const RNC_EMISOR = process.env.DGII_RNC ?? "131217656";

// Tipos que NO aceptan AC según DGII
const TIPOS_SIN_AC = new Set(["E32", "E41", "E43", "E46", "E47"]);

// ── Auth helper ──────────────────────────────────────────────────────────────
async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// ── Formato de fecha → dd-MM-YYYY ──────────────────────────────────────────
function formatFechaAC(fechaIso: string): string {
  // Acepta: "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY"
  if (/^\d{2}-\d{2}-\d{4}$/.test(fechaIso)) return fechaIso; // ya está en formato DGII
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaIso)) {
    const [d, m, y] = fechaIso.split("/");
    return `${d}-${m}-${y}`;
  }
  // ISO: YYYY-MM-DD
  const [y, m, d] = fechaIso.substring(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

// ── Formato datetime → dd-MM-YYYY HH:mm:ss ──────────────────────────────────
function formatFechaHoraAC(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(" ");
}

// ── Detectar tipo de eNCF a partir del número ─────────────────────────────
function tipoDeENCF(encf: string): string {
  // eNCF format: E31XXXXXXXXXX, E320000000001, etc.
  const match = encf.match(/^([A-Z]\d{2})/);
  return match ? match[1] : "";
}

// ── Construir XML ACECF ───────────────────────────────────────────────────
function buildACECFXml(params: {
  rncEmisor:      string;
  encf:           string;
  fechaEmision:   string;   // dd-MM-YYYY
  montoTotal:     number;
  rncComprador:   string;
  estado:         1 | 2;    // 1=Aceptado, 2=Rechazado
  motivoRechazo?: string;
  fechaHoraAC:    string;   // dd-MM-YYYY HH:mm:ss
}): string {
  const {
    rncEmisor, encf, fechaEmision, montoTotal,
    rncComprador, estado, motivoRechazo, fechaHoraAC,
  } = params;

  const montoStr = montoTotal.toFixed(2);

  // DetalleMotivoRechazo solo si Estado=2
  const motivoTag = (estado === 2 && motivoRechazo)
    ? `<DetalleMotivoRechazo>${motivoRechazo.substring(0, 250)}</DetalleMotivoRechazo>`
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<ACECF>`,
    `<DetalleAprobacionComercial>`,
    `<Version>1.0</Version>`,
    `<RNCEmisor>${rncEmisor}</RNCEmisor>`,
    `<eNCF>${encf}</eNCF>`,
    `<FechaEmision>${fechaEmision}</FechaEmision>`,
    `<MontoTotal>${montoStr}</MontoTotal>`,
    `<RNCComprador>${rncComprador}</RNCComprador>`,
    `<Estado>${estado}</Estado>`,
    motivoTag,
    `<FechaHoraAprobacionComercial>${fechaHoraAC}</FechaHoraAprobacionComercial>`,
    `</DetalleAprobacionComercial>`,
    `</ACECF>`,
  ].filter(Boolean).join("");
}

// ── Enviar ACECF a DGII ────────────────────────────────────────────────────
async function enviarACECF(
  xmlFirmado: string,
  encf: string,
  token: string,
): Promise<{ mensaje: string; estado: string; codigo: string }> {
  const amb      = process.env.DGII_AMBIENTE ?? "certecf";
  const url      = `${ECF_HOST}/${amb}/emisorreceptor/fe/aprobacioncomercial/api/ecf`;
  const filename = `${RNC_EMISOR}${encf}.xml`;

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), filename);

  const res  = await fetch(url, {
    method:  "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body:    form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`DGII AC ${res.status}: ${text.substring(0, 400)}`);

  // Respuesta JSON: { mensaje: [...], estado: string, codigo: string }
  // o XML: <RespuestaAprobacionComercial>...
  try {
    const data = JSON.parse(text);
    return {
      mensaje: Array.isArray(data.mensaje) ? data.mensaje.join("; ") : (data.mensaje ?? ""),
      estado:  data.estado  ?? "OK",
      codigo:  data.codigo  ?? "200",
    };
  } catch {
    // Respuesta en XML
    const msg   = text.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? text.substring(0, 200);
    const est   = text.match(/<estado>(.*?)<\/estado>/)?.[1]   ?? "OK";
    const cod   = text.match(/<codigo>(.*?)<\/codigo>/)?.[1]   ?? "200";
    return { mensaje: msg, estado: est, codigo: cod };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dgii/cert/acecf
// Body: { encf, rncComprador, fechaEmision, montoTotal, estado?, motivoRechazo?, token }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json() as {
      encf:           string;
      rncComprador:   string;
      fechaEmision:   string;
      montoTotal:     number | string;
      estado?:        number;       // 1=Aceptado, 2=Rechazado (default 1)
      motivoRechazo?: string;
      token?:         string;
    };

    const { encf, rncComprador, fechaEmision, motivoRechazo } = body;
    const token = body.token ?? "";

    if (!encf || !rncComprador || !fechaEmision || body.montoTotal === undefined) {
      return NextResponse.json(
        { error: "Faltan campos: encf, rncComprador, fechaEmision, montoTotal" },
        { status: 400 },
      );
    }

    // Validar tipo — no aplica para E32, E41, E43, E46, E47
    const tipo = tipoDeENCF(encf);
    if (TIPOS_SIN_AC.has(tipo)) {
      return NextResponse.json(
        { error: `Aprobación Comercial no aplica para tipo ${tipo}` },
        { status: 400 },
      );
    }

    const montoTotal  = typeof body.montoTotal === "string"
      ? parseFloat(body.montoTotal)
      : body.montoTotal;
    const estado      = (body.estado === 2 ? 2 : 1) as 1 | 2;
    const fechaFmt    = formatFechaAC(fechaEmision);
    const fechaHoraAC = formatFechaHoraAC();
    const rncEmisor   = RNC_EMISOR;

    // 1. Construir XML
    const xmlSinFirma = buildACECFXml({
      rncEmisor,
      encf,
      fechaEmision: fechaFmt,
      montoTotal,
      rncComprador: rncComprador.replace(/\D/g, ""),
      estado,
      motivoRechazo,
      fechaHoraAC,
    });

    // 2. Firmar
    const xmlFirmado = await firmarXML(xmlSinFirma);

    // 3. Enviar a DGII
    const resultado = await enviarACECF(xmlFirmado, encf, token);

    // 4. Guardar resultado en Firestore
    await adminDb.collection("acecf_estados").doc(encf).set({
      encf,
      tipo,
      rncComprador: rncComprador.replace(/\D/g, ""),
      fechaEmision: fechaFmt,
      montoTotal,
      estado,
      motivoRechazo: motivoRechazo ?? null,
      resultado,
      enviadoEn: new Date().toISOString(),
      xmlFirmado,
    });

    return NextResponse.json({
      success:  true,
      encf,
      estado:   resultado.estado,
      mensaje:  resultado.mensaje,
      codigo:   resultado.codigo,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DGII/acecf]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dgii/cert/acecf
// Retorna todos los estados guardados en Firestore
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("acecf_estados").get();
  const data = snap.docs.map(d => {
    const { xmlFirmado, ...rest } = d.data() as Record<string, unknown> & { xmlFirmado?: string };
    return rest; // omitir xmlFirmado del listado (es muy grande)
  });
  return NextResponse.json({ items: data });
}