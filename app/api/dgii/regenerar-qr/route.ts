// Regenera la urlQR de facturas existentes con el formato correcto (ddMMyyyy)
// Necesario porque el formato anterior usaba dd-MM-yyyy que DGII rechaza.
// POST { facturaId } → regenera esa factura
// POST { todos: true } → regenera todas las que tienen urlQR con formato incorrecto

import { NextRequest, NextResponse }                    from "next/server";
import { adminAuth, adminDb }                           from "@/lib/firebase-admin";
import { generarURLQR, formatFechaQR, formatFechaHoraQR, calcularCodigoSeguridad } from "@/lib/dgii/qr-builder";
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

// Con tantos cambios (codigoSeguridad, formato fechas, URL path, orden params)
// prácticamente todas las URLs existentes necesitan regeneración.
// Usamos force:true para regenerar todas. Esta función ya no es confiable.
function tieneFormatoNuevo(_urlQR: string): boolean { return false; }

// Extrae SignatureValue del XML firmado
function extraerSignature(xmlFirmado: string): string {
  const m = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
  return m?.[1]?.replace(/\s/g, "") ?? "";
}

// Extrae FechaHoraFirma del XML y la devuelve como ISO para pasarla a formatFechaHoraQR
function extraerFechaFirmaISO(xmlFirmado: string): string {
  const m = xmlFirmado.match(/<FechaHoraFirma>([\s\S]*?)<\/FechaHoraFirma>/);
  if (!m) return "";
  const raw = m[1].trim(); // "dd-MM-yyyy HH:mm:ss"
  const [dmy, time] = raw.split(" ");
  if (!dmy || !time) return "";
  const [d, mo, y] = dmy.split("-");
  if (!d || !mo || !y) return "";
  return `${y}-${mo}-${d}T${time}`; // ISO-like para formatFechaHoraQR
}

async function regenerarUna(facturaId: string): Promise<{ ok: boolean; urlQR?: string; error?: string }> {
  const snap = await adminDb.collection("facturas").doc(facturaId).get();
  if (!snap.exists) return { ok: false, error: "Factura no encontrada" };

  const factura = { id: facturaId, ...snap.data() } as Factura;

  // Usar signatureValue guardado en DB (más rápido); fallback al XML si no existe
  let signatureValue = factura.signatureValue ?? "";
  if (!signatureValue) {
    if (!factura.xmlFirmado) return { ok: false, error: "Sin signatureValue ni xmlFirmado" };
    signatureValue = extraerSignature(factura.xmlFirmado);
    if (!signatureValue) return { ok: false, error: "SignatureValue no encontrado en XML" };
  }

  // Leer empresa
  const empresaSnap = await adminDb.collection("config").doc("empresa").get();
  const empresa = (empresaSnap.exists && empresaSnap.data()?.rnc)
    ? empresaSnap.data() as { rnc: string }
    : { rnc: RNC_EMISOR };
  const rncEmisor = fmtRNC(empresa.rnc);

  const totales = calcTotales(factura.items);
  const esRFCE  = factura.tipoECF === "E32" && totales.total < LIMITE_RFCE;

  // FechaFirma: del XML → fallback a fechaEnvioDGII
  // formatFechaHoraQR aplica el formato correcto según DGII_AMBIENTE (certecf/ecf)
  const fechaISO = (factura.xmlFirmado ? extraerFechaFirmaISO(factura.xmlFirmado) : "") || factura.fechaEnvioDGII || "";
  const fechaFirmaFinal = fechaISO ? formatFechaHoraQR(fechaISO) : "";

  // Cargar cliente para RncComprador
  // Validar que clienteId sea un ID simple sin "/" (algunos cert tienen "N/A" u otros placeholders)
  let rncComprador: string | undefined;
  const clienteIdValido = factura.clienteId &&
    factura.clienteId !== "walk-in" &&
    !factura.clienteId.includes("/");
  if (clienteIdValido) {
    try {
      const cSnap = await adminDb.collection("clientes").doc(factura.clienteId).get();
      if (cSnap.exists) rncComprador = fmtRNC((cSnap.data() as { rnc?: string }).rnc ?? "");
    } catch { /* clienteId inválido — continuar sin rncComprador */ }
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
    const body = await req.json() as { facturaId?: string; todos?: boolean; force?: boolean };

    if (body.facturaId) {
      const result = await regenerarUna(body.facturaId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, facturaId: body.facturaId, urlQR: result.urlQR });
    }

    if (body.todos || body.force) {
      const snap = await adminDb.collection("facturas")
        .where("estadoDGII", "in", ["Enviado", "Aceptado", "AceptadoCondicional"])
        .get();

      // force=true → regenerar todas sin filtrar por formato
      // todos=true → solo las que tienen URL con formato/orden incorrecto
      const candidatos = body.force
        ? snap.docs.filter(d => !!(d.data() as Factura).xmlFirmado)
        : snap.docs.filter(d => {
            const url = (d.data() as Factura).urlQR ?? "";
            if (!url) return true;
            if (!tieneFormatoNuevo(url)) return true;
            // También regenerar si RncComprador está después de ENCF (orden incorrecto)
            const rncIdx  = url.indexOf("RncComprador=");
            const encfIdx = url.indexOf("ENCF=");
            if (rncIdx !== -1 && encfIdx !== -1 && rncIdx > encfIdx) return true;
            return false;
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
