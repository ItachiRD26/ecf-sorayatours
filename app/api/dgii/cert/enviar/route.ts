// API Route — Envía un caso de prueba del set DGII (Paso 2 Certificación)
// Construye y firma el XML directamente desde los datos del caso

import { NextRequest, NextResponse } from "next/server";
import { adminAuth }             from "@/lib/firebase-admin";
import { firmarXML }             from "@/lib/dgii/xml-signer";
import { enviarECF, enviarRFCE } from "@/lib/dgii/dgii-client";
import type { CasoPrueba }       from "@/lib/dgii/xml-builder";

async function verificarSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie);
    return decoded.uid;
  } catch { return null; }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const fmt = (n: number) => n.toFixed(2);

const RNC_EMISOR   = "131217656";
const RAZON_EMISOR = "SORAYA Y LEONARDO TOURS SRL";
const DIR_EMISOR   = "Playa Juan de Bolanos Bugalow #3, Montecristi";
const TEL_EMISOR   = "8099616343";

function buildXMLDesdeCaso(caso: CasoPrueba): string {
  const tipo = caso.tipoECF;

  const emisor = `<Emisor>
    <RNCEmisor>${RNC_EMISOR}</RNCEmisor>
    <RazonSocialEmisor>${esc(RAZON_EMISOR)}</RazonSocialEmisor>
    <DireccionEmisor>${esc(DIR_EMISOR)}</DireccionEmisor>
    <TablaTelefonoEmisor><TelefonoEmisor>${TEL_EMISOR}</TelefonoEmisor></TablaTelefonoEmisor>
    <ActividadEconomica>Servicios de Turismo y Excursiones</ActividadEconomica>
    <FechaEmision>${caso.fecha}</FechaEmision>
  </Emisor>`;

  // Comprador
  let comprador = "";
  if (["31","33","34","41","44","45"].includes(tipo) && caso.rncComprador) {
    comprador = `<Comprador>
    <RNCComprador>${caso.rncComprador}</RNCComprador>
    <RazonSocialComprador>${esc(caso.razonComprador ?? "COMPRADOR")}</RazonSocialComprador>
  </Comprador>`;
  } else if (tipo === "32") {
    comprador = `<Comprador><RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador></Comprador>`;
  } else if ((tipo === "46" || tipo === "47") && caso.idExtranjero) {
    comprador = `<Comprador>
    <IdentificadorExtranjero>${esc(caso.idExtranjero)}</IdentificadorExtranjero>
    <RazonSocialComprador>${esc(caso.razonComprador ?? "BENEFICIARIO EXTERIOR")}</RazonSocialComprador>
  </Comprador>`;
  } else if (tipo === "46" && caso.rncComprador) {
    comprador = `<Comprador>
    <RNCComprador>${caso.rncComprador}</RNCComprador>
    <RazonSocialComprador>${esc(caso.razonComprador ?? "COMPRADOR")}</RazonSocialComprador>
  </Comprador>`;
  }

  // Totales
  const totales = tipo === "43"
    ? `<Totales><MontoExento>0.00</MontoExento><MontoTotal>${fmt(caso.montoTotal)}</MontoTotal></Totales>`
    : `<Totales>
    <MontoGravadoTotal>${fmt(caso.montoGravado)}</MontoGravadoTotal>
    <MontoGravadoI1>${fmt(caso.montoGravado)}</MontoGravadoI1>
    <MontoExento>0.00</MontoExento>
    <ITBIS1>${fmt(caso.itbis)}</ITBIS1>
    <TotalITBIS>${fmt(caso.itbis)}</TotalITBIS>
    <MontoTotal>${fmt(caso.montoTotal)}</MontoTotal>
  </Totales>`;

  // IdDoc — E43 sin TipoPago
  const idDocInner = tipo === "43"
    ? `<TipoeCF>43</TipoeCF><eNCF>${caso.eNCF}</eNCF><FechaVencimientoSecuencia>${caso.vencimiento || "2099-12-31"}</FechaVencimientoSecuencia><FechaEmision>${caso.fecha}</FechaEmision>`
    : `<TipoeCF>${tipo}</TipoeCF><eNCF>${caso.eNCF}</eNCF><FechaVencimientoSecuencia>${caso.vencimiento || "2099-12-31"}</FechaVencimientoSecuencia><TipoPago>1</TipoPago><FechaEmision>${caso.fecha}</FechaEmision>`;

  // Item
  const montoItem = caso.montoGravado > 0 ? caso.montoGravado : caso.montoTotal;
  const item = `<Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>${esc(caso.nombreItem.substring(0, 80))}</NombreItem>
      <IndicadorBienoServicio>${caso.indicadorBS}</IndicadorBienoServicio>
      <CantidadItem>${fmt(caso.cantItem)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(caso.precioUnit)}</PrecioUnitarioItem>
      <TablaSubDescuento><SubDescuento><TasaSubDescuento>0.00</TasaSubDescuento><MontoSubDescuento>0.00</MontoSubDescuento></SubDescuento></TablaSubDescuento>
      <MontoItem>${fmt(montoItem)}</MontoItem>
      ${caso.itbis > 0 ? `<ITBIS>${fmt(caso.itbis)}</ITBIS>` : `<BienOServExentoITBIS>E</BienOServExentoITBIS>`}
      ${tipo === "47" ? `<Retencion><MontoISRRetenido>${fmt(caso.montoTotal * 0.27)}</MontoISRRetenido></Retencion>` : ""}
    </Item>`;

  // InformacionReferencia (E33/E34)
  const infoRef = ((tipo === "33" || tipo === "34") && caso.eCFRef)
    ? `<InformacionReferencia>
    <NCFModificado>${caso.eCFRef}</NCFModificado>
    <FechaNCFModificado>${caso.fechaNCFMod ?? caso.fecha}</FechaNCFModificado>
    <CodigoModificacion>${caso.codMod ?? "2"}</CodigoModificacion>
    ${caso.razonMod ? `<RazonModificacion>${esc(caso.razonMod)}</RazonModificacion>` : ""}
  </InformacionReferencia>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>${idDocInner}</IdDoc>
    ${emisor}
    ${comprador}
    ${totales}
  </Encabezado>
  <DetallesItems>
    ${item}
  </DetallesItems>
  ${infoRef}
</ECF>`;
}

function buildRFCEDesdeCaso(caso: CasoPrueba): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${caso.eNCF}</eNCF>
      <FechaVencimientoSecuencia>${caso.vencimiento || "2099-12-31"}</FechaVencimientoSecuencia>
      <FechaEmision>${caso.fecha}</FechaEmision>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${RNC_EMISOR}</RNCEmisor>
      <RazonSocialEmisor>${esc(RAZON_EMISOR)}</RazonSocialEmisor>
    </Emisor>
    <Resumen>
      <MontoGravadoTotal>${fmt(caso.montoGravado)}</MontoGravadoTotal>
      <MontoExento>0.00</MontoExento>
      <ITBIS1>${fmt(caso.itbis)}</ITBIS1>
      <TotalITBIS>${fmt(caso.itbis)}</TotalITBIS>
      <MontoTotal>${fmt(caso.montoTotal)}</MontoTotal>
    </Resumen>
  </Encabezado>
</RFCE>`;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const caso: CasoPrueba = body.caso;
    if (!caso?.eNCF) return NextResponse.json({ error: "caso.eNCF requerido" }, { status: 400 });

    if (caso.esMenor250k) {
      // Enviar RFCE (resumen) primero
      const rfceXml     = buildRFCEDesdeCaso(caso);
      const rfceFirmado = await firmarXML(rfceXml);
      const resultado   = await enviarRFCE(rfceFirmado);
      return NextResponse.json({
        success:    true,
        trackId:    resultado.trackId,
        estadoDGII: resultado.estado || "Enviado",
        esMenor250k: true,
      });
    }

    // Enviar e-CF completo
    const xml     = buildXMLDesdeCaso(caso);
    const firmado = await firmarXML(xml);
    const trackId = await enviarECF(firmado);

    return NextResponse.json({
      success:    true,
      trackId,
      estadoDGII: "Enviado",
      esMenor250k: false,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/enviar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}