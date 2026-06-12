// Acuse de Recibo e-CF (ARECF) — Paso 9 de Certificación
// Lo enviamos nosotros a DGII para confirmar que recibimos un e-CF de un proveedor.
// XSD: ARECF_v_1_0.xsd
// CerteCF: POST /CerteCF/AcuseRecibo/api/AcuseRecibo
// testecf:  POST /testecf/emisorreceptor/fe/acuserecibo/api/ecf
// ecf prod: POST /ecf/emisorreceptor/fe/acuserecibo/api/ecf

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { firmarXML }                 from "@/lib/dgii/xml-signer";
import { getToken }                  from "@/lib/dgii/dgii-client";

const ECF_HOST      = "https://ecf.dgii.gov.do";
const RNC_COMPRADOR = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

function arecfUrl(): string {
  if (process.env.DGII_ARECF_URL) return process.env.DGII_ARECF_URL;
  const amb = (process.env.DGII_AMBIENTE ?? "ecf").toLowerCase();
  if (amb === "certecf") return `${ECF_HOST}/CerteCF/AcuseRecibo/api/AcuseRecibo`;
  if (amb === "ecf")     return `${ECF_HOST}/ecf/emisorreceptor/fe/acuserecibo/api/ecf`;
  return `${ECF_HOST}/${amb}/emisorreceptor/fe/acuserecibo/api/ecf`;
}

// Estado: 0 = Recibido, 1 = No Recibido
// CodigoMotivoNoRecibido (solo si Estado=1):
//   1 = Error de Especificación, 2 = Error en Firma Digital,
//   3 = Envío Duplicado,         4 = RNC Comprador no Corresponde
function buildARECFXml(p: {
  rncEmisor:    string;
  rncComprador: string;
  encf:         string;
  estado:       0 | 1;
  codigoMotivo?: number;
  fechaHora:    string;   // dd-MM-YYYY HH:mm:ss
}): string {
  const motivoTag = p.estado === 1 && p.codigoMotivo
    ? `<CodigoMotivoNoRecibido>${p.codigoMotivo}</CodigoMotivoNoRecibido>`
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<ARECF>`,
    `<DetalleAcusedeRecibo>`,
    `<Version>1.0</Version>`,
    `<RNCEmisor>${p.rncEmisor}</RNCEmisor>`,
    `<RNCComprador>${p.rncComprador}</RNCComprador>`,
    `<eNCF>${p.encf}</eNCF>`,
    `<Estado>${p.estado}</Estado>`,
    motivoTag,
    `<FechaHoraAcuseRecibo>${p.fechaHora}</FechaHoraAcuseRecibo>`,
    `</DetalleAcusedeRecibo>`,
    `</ARECF>`,
  ].filter(Boolean).join("");
}

async function enviarARECF(
  xmlFirmado: string,
  encf:       string,
  token:      string,
): Promise<{ mensaje: string; estado: string; codigo: string }> {
  const url      = arecfUrl();
  const rnc      = RNC_COMPRADOR;
  const filename = `${rnc}${encf}.xml`;

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), filename);

  const res  = await fetch(url, {
    method:  "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body:    form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DGII ARECF ${res.status}: ${text.substring(0, 400)}`);

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

// ─── POST /api/dgii/arecf ────────────────────────────────────────────────────
// Body: { encf, rncEmisor, estado?, codigoMotivo?, fechaHora?, token? }
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let parsedEncf = "";
  try {
    const body = await req.json() as {
      encf:          string;
      rncEmisor?:    string;
      estado?:       number;
      codigoMotivo?: number;
      fechaHora?:    string;
      token?:        string;
    };

    const { encf } = body;
    parsedEncf = encf ?? "";
    if (!encf)
      return NextResponse.json({ error: "encf requerido" }, { status: 400 });

    // Si no viene rncEmisor, intentar leerlo de la factura recibida
    let rncEmisor = (body.rncEmisor ?? "").replace(/\D/g, "");
    if (!rncEmisor) {
      const snap = await adminDb.collection("facturas_recibidas").doc(encf).get();
      if (!snap.exists)
        return NextResponse.json({ error: "Factura recibida no encontrada" }, { status: 404 });
      rncEmisor = (snap.data() as { rncEmisor?: string }).rncEmisor?.replace(/\D/g, "") ?? "";
    }
    if (!rncEmisor)
      return NextResponse.json({ error: "rncEmisor requerido" }, { status: 400 });

    const estado = (body.estado === 1 ? 1 : 0) as 0 | 1;
    const codigoMotivo = estado === 1 ? (body.codigoMotivo ?? 1) : undefined;

    const now = new Date();
    const p   = (n: number) => String(n).padStart(2, "0");
    const fechaHora = body.fechaHora?.trim() ||
      `${p(now.getDate())}-${p(now.getMonth()+1)}-${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

    const token = body.token || await getToken();

    // 1. Construir XML
    const xmlSinFirma = buildARECFXml({
      rncEmisor,
      rncComprador: RNC_COMPRADOR,
      encf,
      estado,
      codigoMotivo,
      fechaHora,
    });

    // 2. Firmar
    const xmlFirmado = await firmarXML(xmlSinFirma);

    // 3. Enviar a DGII
    const resultado = await enviarARECF(xmlFirmado, encf, token);

    // 4. Actualizar Firestore
    await adminDb.collection("facturas_recibidas").doc(encf).update({
      estadoARECF: "Enviado",
      fechaARECF:  new Date().toISOString(),
      xmlARECF:    xmlFirmado,
    });

    return NextResponse.json({
      success: true,
      encf,
      estado:  resultado.estado,
      mensaje: resultado.mensaje,
      codigo:  resultado.codigo,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DGII/arecf]", msg);

    if (parsedEncf) {
      try {
        await adminDb.collection("facturas_recibidas").doc(parsedEncf).update({
          estadoARECF: "Error",
        });
      } catch { /* ignorar */ }
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/dgii/arecf — lista acuses enviados ─────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("facturas_recibidas")
    .where("estadoARECF", "==", "Enviado")
    .orderBy("fechaARECF", "desc")
    .limit(100)
    .get();

  const items = snap.docs.map(d => {
    const { xmlRecibido: _, xmlARECF: __, xmlACECF: ___, ...rest } = d.data() as Record<string, unknown>;
    return { id: d.id, ...rest };
  });

  return NextResponse.json({ items });
}
