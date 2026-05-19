// Paso 3 Certificación DGII — Aprobaciones / Rechazos Comerciales (ACECF)
// XSD: ACECF_v_1_0__1_.xsd
// Endpoint CerteCF: POST /certecf/emisorreceptor/fe/aprobacioncomercial/api/ecf
// Tipos sin AC: E32, E41, E43, E46, E47

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { firmarXML }                 from "@/lib/dgii/xml-signer";

const ECF_HOST   = "https://ecf.dgii.gov.do";
const RNC_EMISOR = process.env.DGII_RNC ?? "131217656";
const TIPOS_SIN_AC = new Set(["E32", "E41", "E43", "E46", "E47"]);

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

function tipoDeENCF(encf: string): string {
  const m = encf.match(/^([A-Z]\d{2})/);
  return m ? m[1] : "";
}

// Construir XML ACECF según XSD exacto
function buildACECFXml(p: {
  rncEmisor:    string;
  encf:         string;
  fechaEmision: string;   // dd-MM-YYYY
  montoTotal:   number;
  rncComprador: string;
  estado:       1 | 2;
  motivoRechazo?: string;
  fechaHoraAC:  string;  // dd-MM-YYYY HH:mm:ss
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

// Enviar XML firmado a DGII
async function enviarACECF(
  xmlFirmado: string,
  encf: string,
  token: string,
): Promise<{ mensaje: string; estado: string; codigo: string }> {
  // URL corregida según Swagger oficial certecf — mismo patrón que Recepcion y Consulta
  // testecf: /testecf/emisorreceptor/fe/aprobacioncomercial/api/ecf
  // certecf: /CerteCF/emisorreceptor/fe/aprobacioncomercial/api/ecf
  const amb = process.env.DGII_AMBIENTE ?? "certecf";
  const url = amb.toLowerCase() === "certecf"
    ? `${ECF_HOST}/CerteCF/emisorreceptor/fe/aprobacioncomercial/api/ecf`
    : `${ECF_HOST}/${amb}/emisorreceptor/fe/aprobacioncomercial/api/ecf`;
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

  try {
    const data = JSON.parse(text);
    return {
      mensaje: Array.isArray(data.mensaje) ? data.mensaje.join("; ") : (data.mensaje ?? "OK"),
      estado:  data.estado  ?? "OK",
      codigo:  data.codigo  ?? "200",
    };
  } catch {
    return {
      mensaje: text.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? text.substring(0, 200),
      estado:  text.match(/<estado>(.*?)<\/estado>/)?.[1]   ?? "OK",
      codigo:  text.match(/<codigo>(.*?)<\/codigo>/)?.[1]   ?? "200",
    };
  }
}

// ─── POST /api/dgii/cert/acecf ───────────────────────────────────────────────
// Body: { encf, rncComprador, fechaEmision, montoTotal, fechaHoraAC,
//         estado?, motivoRechazo?, token? }
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json() as {
      encf:           string;
      rncComprador:   string;
      fechaEmision:   string;
      montoTotal:     number | string;
      fechaHoraAC?:  string;   // viene del Excel DGII; si falta se genera ahora
      estado?:        number;
      motivoRechazo?: string;
      token?:         string;
    };

    const { encf, rncComprador, fechaEmision, motivoRechazo } = body;
    const token = body.token ?? "";

    if (!encf || !rncComprador || !fechaEmision || body.montoTotal === undefined)
      return NextResponse.json(
        { error: "Faltan campos requeridos: encf, rncComprador, fechaEmision, montoTotal" },
        { status: 400 },
      );

    const tipo = tipoDeENCF(encf);
    if (TIPOS_SIN_AC.has(tipo))
      return NextResponse.json(
        { error: `Aprobación Comercial no aplica para tipo ${tipo} (E32, E41, E43, E46, E47)` },
        { status: 400 },
      );

    const montoTotal = typeof body.montoTotal === "string"
      ? parseFloat(body.montoTotal)
      : body.montoTotal;
    const estado     = (body.estado === 2 ? 2 : 1) as 1 | 2;

    // FechaHoraAprobacionComercial: usar la del Excel si viene, si no generar
    const fechaHoraAC = body.fechaHoraAC?.trim() || (() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    })();

    // 1. Construir XML
    const xmlSinFirma = buildACECFXml({
      rncEmisor:    RNC_EMISOR,
      encf,
      fechaEmision,
      montoTotal,
      rncComprador: rncComprador.replace(/\D/g, ""),
      estado,
      motivoRechazo,
      fechaHoraAC,
    });

    // 2. Firmar (mismo signer que los eCF)
    const xmlFirmado = await firmarXML(xmlSinFirma);

    // 3. Enviar a DGII
    const resultado = await enviarACECF(xmlFirmado, encf, token);

    // 4. Guardar en Firestore
    const firestoreDoc: Record<string, unknown> = {
      encf, tipo, rncComprador: rncComprador.replace(/\D/g, ""),
      fechaEmision, montoTotal, estado, fechaHoraAC,
      resultado, enviadoEn: new Date().toISOString(),
    };
    if (estado === 2 && motivoRechazo) firestoreDoc.motivoRechazo = motivoRechazo;

    await adminDb.collection("acecf_estados").doc(encf).set(firestoreDoc);

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

// ─── GET /api/dgii/cert/acecf ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("acecf_estados").get();
  const data = snap.docs.map(d => {
    const doc = d.data() as Record<string, unknown>;
    const { xmlFirmado: _, ...rest } = doc;
    return rest;
  });
  return NextResponse.json({ items: data });
}