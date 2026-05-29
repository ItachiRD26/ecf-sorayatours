// Regenera la urlQR de facturas existentes con el formato correcto (ddMMyyyy)
// Necesario porque el formato anterior usaba dd-MM-yyyy que DGII rechaza.
// POST { facturaId } → regenera esa factura
// POST { todos: true } → regenera todas las que tienen urlQR con formato incorrecto

import { NextRequest, NextResponse }                    from "next/server";
import { adminAuth, adminDb }                           from "@/lib/firebase-admin";
import { generarURLQR, formatFechaQR, calcularCodigoSeguridad } from "@/lib/dgii/qr-builder";
import { fmtRNC }                                                from "@/lib/dgii/xml-builder";
import { calcTotales }                                  from "@/types";
import type { Factura }                                 from "@/types";
import { LIMITE_RFCE }                                  from "@/lib/dgii/xml-builder";

const RNC_EMISOR = (process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// Detecta si una URL ya tiene el formato nuevo (ddMMyyyy sin guiones)
function tieneFormatoNuevo(urlQR: string): boolean {
  // Buscar FechaFirma= seguido de un número sin guiones (ddMMyyyy = 8 dígitos seguidos)
  return /[?&]FechaFirma=\d{8}/.test(urlQR) || /[?&]FechaEmision=\d{8}/.test(urlQR);
}

// Extrae SignatureValue del XML firmado
function extraerSignature(xmlFirmado: string): string {
  const m = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
  return m?.[1]?.replace(/\s/g, "") ?? "";
}

// Extrae FechaHoraFirma del XML (dd-MM-YYYY HH:mm:ss)
function extraerFechaFirma(xmlFirmado: string): string {
  const m = xmlFirmado.match(/<FechaHoraFirma>([\s\S]*?)<\/FechaHoraFirma>/);
  if (!m) return "";
  const raw = m[1].trim(); // "27-05-2026 01:06:40"
  // Convertir dd-MM-YYYY → YYYY-MM-DD para new Date()
  const parts = raw.split(" ");
  if (parts.length < 2) return "";
  const [dmy, time] = parts;
  const [d, mo, y]  = dmy.split("-");
  if (!d || !mo || !y) return "";
  // formatFechaHoraQR espera formato ddMMyyyy HH:mm:ss (nuevo)
  return `${d}${mo}${y} ${time}`;
}

async function regenerarUna(facturaId: string): Promise<{ ok: boolean; urlQR?: string; error?: string }> {
  const snap = await adminDb.collection("facturas").doc(facturaId).get();
  if (!snap.exists) return { ok: false, error: "Factura no encontrada" };

  const factura = { id: facturaId, ...snap.data() } as Factura;
  if (!factura.xmlFirmado) return { ok: false, error: "Sin xmlFirmado almacenado" };

  const signatureValue = extraerSignature(factura.xmlFirmado);
  if (!signatureValue) return { ok: false, error: "SignatureValue no encontrado en XML" };

  // Leer empresa
  const empresaSnap = await adminDb.collection("config").doc("empresa").get();
  const empresa = (empresaSnap.exists && empresaSnap.data()?.rnc)
    ? empresaSnap.data() as { rnc: string }
    : { rnc: RNC_EMISOR };
  const rncEmisor = fmtRNC(empresa.rnc);

  const totales = calcTotales(factura.items);
  const esRFCE  = factura.tipoECF === "E32" && totales.total < LIMITE_RFCE;

  // Extraer FechaFirma del XML (ya en formato ddMMyyyy HH:mm:ss)
  const fechaFirmaFromXml = extraerFechaFirma(factura.xmlFirmado);
  // Si no está en el XML, usar fechaEnvioDGII como fallback
  const fechaFirmaFinal = fechaFirmaFromXml || (() => {
    if (!factura.fechaEnvioDGII) return "";
    const d   = new Date(factura.fechaEnvioDGII);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}${pad(d.getMonth()+1)}${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  })();

  // Cargar cliente para RncComprador
  let rncComprador: string | undefined;
  if (factura.clienteId && factura.clienteId !== "walk-in") {
    const cSnap = await adminDb.collection("clientes").doc(factura.clienteId).get();
    if (cSnap.exists) rncComprador = fmtRNC((cSnap.data() as { rnc?: string }).rnc ?? "");
  }
  // Fallback: E32 ≥ 250k walk-in con cédula/RNC ocasional
  if (!rncComprador && factura.rncCompradorOcasional) {
    rncComprador = factura.rncCompradorOcasional.replace(/\D/g, "");
  }

  // Recalcular codigoSeguridad (SHA-256 de SignatureValue)
  const codigoSeguridad = calcularCodigoSeguridad(signatureValue);

  const urlQR = generarURLQR({
    tipoECF:      factura.tipoECF,
    rncEmisor,
    rncComprador,
    eNCF:         factura.eCF,
    fechaEmision: formatFechaQR(factura.fecha),
    montoTotal:   totales.total,
    fechaFirma:   fechaFirmaFinal,
    signatureValue,
    esRFCE,
  });

  await adminDb.collection("facturas").doc(facturaId).update({ urlQR, codigoSeguridad });

  return { ok: true, urlQR };
}

// ─── POST /api/dgii/regenerar-qr ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json() as { facturaId?: string; todos?: boolean };

    if (body.facturaId) {
      const result = await regenerarUna(body.facturaId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, facturaId: body.facturaId, urlQR: result.urlQR });
    }

    if (body.todos) {
      const snap = await adminDb.collection("facturas")
        .where("estadoDGII", "in", ["Enviado", "Aceptado", "AceptadoCondicional"])
        .get();

      const candidatos = snap.docs.filter(d => {
        const url = (d.data() as Factura).urlQR ?? "";
        return url && !tieneFormatoNuevo(url);
      });

      const resultados: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const d of candidatos) {
        const r = await regenerarUna(d.id);
        resultados.push({ id: d.id, ok: r.ok, error: r.error });
      }

      const ok  = resultados.filter(r => r.ok).length;
      const err = resultados.filter(r => !r.ok).length;
      return NextResponse.json({ success: true, total: candidatos.length, ok, err, resultados });
    }

    return NextResponse.json({ error: "Enviar facturaId o todos: true" }, { status: 400 });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[regenerar-qr]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
