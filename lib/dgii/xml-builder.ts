// Construye el XML del e-CF según los XSD de la DGII
// Soporta: E31, E32, E33, E34

import type { Factura, Cliente, LineaServicio } from "@/types";
import { calcLinea, calcTotales } from "@/types";

const RNC_EMISOR    = "131217656";  // Soraya y Leonardo Tours SRL (sin guiones)
const RAZON_SOCIAL  = "SORAYA Y LEONARDO TOURS SRL";
const DIRECCION     = "Playa Juan de Bolanos Bugalow #3, Montecristi";
const TELEFONO      = "809-961-6343";
const VERSION       = "1.0";

// TipoPago según términos
function getTipoPago(terminos: string): string {
  if (terminos === "Contado") return "1"; // Contado
  return "2"; // Crédito
}

// TipoBienoServicio: 2 = Servicio
const TIPO_BIEN_SERVICIO = "2";

// IndicadorFacturacion: 1 = Normal
const INDICADOR_FACTURACION = "1";

function escapeXml(str: string): string {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}

function formatFecha(dateStr: string): string {
  return dateStr; // ya está en formato YYYY-MM-DD
}

function formatMonto(n: number): string {
  return n.toFixed(2);
}

interface EmpresaConfig {
  nombre:    string;
  rnc:       string;
  direccion: string;
  telefono:  string;
}

// ── Encabezado del emisor (común a todos) ─────────────────────────
function buildEmisor(empresa: EmpresaConfig): string {
  const rnc = empresa.rnc.replace(/\D/g, "");
  return `<Emisor>
    <RNCEmisor>${rnc}</RNCEmisor>
    <RazonSocialEmisor>${escapeXml(empresa.nombre)}</RazonSocialEmisor>
    <DireccionEmisor>${escapeXml(empresa.direccion)}</DireccionEmisor>
    ${empresa.telefono ? `<TablaTelefonoEmisor><TelefonoEmisor>${empresa.telefono}</TelefonoEmisor></TablaTelefonoEmisor>` : ""}
    <ActividadEconomica>Servicios de Turismo y Excursiones</ActividadEconomica>
  </Emisor>`;
}

// ── Comprador E31 (con RNC) ───────────────────────────────────────
function buildCompradorE31(cliente: Cliente): string {
  const rnc = cliente.rnc?.replace(/\D/g, "") ?? "";
  return `<Comprador>
    <RNCComprador>${rnc}</RNCComprador>
    <RazonSocialComprador>${escapeXml(cliente.nombre)}</RazonSocialComprador>
    ${cliente.direccion ? `<DireccionComprador>${escapeXml(cliente.direccion)}</DireccionComprador>` : ""}
  </Comprador>`;
}

// ── Comprador E32 (consumidor final) ─────────────────────────────
function buildCompradorE32(factura: Factura): string {
  const nombre = factura.nombreConsumidor ?? "CONSUMIDOR FINAL";
  return `<Comprador>
    <RazonSocialComprador>${escapeXml(nombre)}</RazonSocialComprador>
  </Comprador>`;
}

// ── Items / Detalle de servicios ──────────────────────────────────
function buildItems(items: LineaServicio[]): string {
  return items.map((item, i) => {
    const c          = calcLinea(item);
    const paxDesc    = item.pax > 0 ? ` | PAX: ${item.pax}` : "";
    const precioUnit = item.modo === "por_grupo"
      ? (c.bruto / Math.max(item.pax, 1))  // precio unitario implícito
      : item.precio;
    return `<Item>
      <NumeroLinea>${i + 1}</NumeroLinea>
      <IndicadorFacturacion>${INDICADOR_FACTURACION}</IndicadorFacturacion>
      <NombreItem>${escapeXml(item.descripcion.substring(0, 80))}</NombreItem>
      <IndicadorBienoServicio>${TIPO_BIEN_SERVICIO}</IndicadorBienoServicio>
      ${item.descripcion.length > 80 || paxDesc
        ? `<DescripcionItem>${escapeXml((item.descripcion + paxDesc).substring(0, 1000))}</DescripcionItem>`
        : ""}
      <CantidadItem>${formatMonto(Math.max(item.pax, 1))}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${formatMonto(precioUnit)}</PrecioUnitarioItem>
      ${item.descuentoMonto > 0
        ? `<DescuentoMonto>${formatMonto(item.descuentoMonto)}</DescuentoMonto>`
        : ""}
      <TablaSubDescuento>
        <SubDescuento>
          <TasaSubDescuento>${formatMonto(0)}</TasaSubDescuento>
          <MontoSubDescuento>${formatMonto(0)}</MontoSubDescuento>
        </SubDescuento>
      </TablaSubDescuento>
      <MontoItem>${formatMonto(c.sub)}</MontoItem>
      ${item.itbis === 0
        ? `<BienOServExentoITBIS>E</BienOServExentoITBIS>`
        : `<ITBIS>${formatMonto(c.itbisAmt)}</ITBIS>`}
    </Item>`;
  }).join("\n");
}

// ── Totales ───────────────────────────────────────────────────────
function buildTotales(factura: Factura): string {
  const t        = calcTotales(factura.items);
  const exentos  = factura.items.filter((i) => i.itbis === 0).reduce((s, i) => s + calcLinea(i).sub, 0);
  const gravados = t.sub - exentos;

  return `<Totales>
    <MontoGravadoTotal>${formatMonto(gravados)}</MontoGravadoTotal>
    <MontoGravadoI1>${formatMonto(gravados)}</MontoGravadoI1>
    <MontoExento>${formatMonto(exentos)}</MontoExento>
    <ITBIS1>${formatMonto(t.itbis)}</ITBIS1>
    <TotalITBIS>${formatMonto(t.itbis)}</TotalITBIS>
    <MontoTotal>${formatMonto(t.total)}</MontoTotal>
  </Totales>`;
}

// ── XML E31 — Crédito Fiscal ──────────────────────────────────────
function buildE31(factura: Factura, cliente: Cliente, empresa: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>${factura.eCF}</eNCF>
      <FechaVencimientoSecuencia>${factura.vencimientoECF}</FechaVencimientoSecuencia>
      <TipoPago>${getTipoPago(factura.terminos)}</TipoPago>
      <FechaEmision>${formatFecha(factura.fecha)}</FechaEmision>
    </IdDoc>
    ${buildEmisor(empresa)}
    ${buildCompradorE31(cliente)}
    <Totales>
      ${buildTotales(factura).replace("<Totales>", "").replace("</Totales>", "")}
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${buildItems(factura.items)}
  </DetallesItems>
</ECF>`;
}

// ── XML E32 — Consumo ─────────────────────────────────────────────
function buildE32(factura: Factura, empresa: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${factura.eCF}</eNCF>
      <FechaVencimientoSecuencia>${factura.vencimientoECF}</FechaVencimientoSecuencia>
      <TipoPago>${getTipoPago(factura.terminos)}</TipoPago>
      <FechaEmision>${formatFecha(factura.fecha)}</FechaEmision>
    </IdDoc>
    ${buildEmisor(empresa)}
    ${buildCompradorE32(factura)}
    <Totales>
      ${buildTotales(factura).replace("<Totales>", "").replace("</Totales>", "")}
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${buildItems(factura.items)}
  </DetallesItems>
</ECF>`;
}

// ── XML E33 — Nota de Débito ──────────────────────────────────────
function buildE33(factura: Factura, cliente: Cliente | undefined, empresa: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>33</TipoeCF>
      <eNCF>${factura.eCF}</eNCF>
      <FechaVencimientoSecuencia>${factura.vencimientoECF}</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
      <FechaEmision>${formatFecha(factura.fecha)}</FechaEmision>
    </IdDoc>
    ${buildEmisor(empresa)}
    ${cliente ? buildCompradorE31(cliente) : buildCompradorE32(factura)}
    <Totales>
      ${buildTotales(factura).replace("<Totales>", "").replace("</Totales>", "")}
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${buildItems(factura.items)}
  </DetallesItems>
  <InformacionReferencia>
    <NCFModificado>${factura.eCFRef ?? ""}</NCFModificado>
    <FechaNCFModificado>${formatFecha(factura.fecha)}</FechaNCFModificado>
    ${factura.motivoNota ? `<CodigoModificacion>1</CodigoModificacion>` : ""}
  </InformacionReferencia>
</ECF>`;
}

// ── XML E34 — Nota de Crédito ─────────────────────────────────────
function buildE34(factura: Factura, cliente: Cliente | undefined, empresa: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>34</TipoeCF>
      <eNCF>${factura.eCF}</eNCF>
      <FechaVencimientoSecuencia>${factura.vencimientoECF}</FechaVencimientoSecuencia>
      <TipoPago>1</TipoPago>
      <FechaEmision>${formatFecha(factura.fecha)}</FechaEmision>
    </IdDoc>
    ${buildEmisor(empresa)}
    ${cliente ? buildCompradorE31(cliente) : buildCompradorE32(factura)}
    <Totales>
      ${buildTotales(factura).replace("<Totales>", "").replace("</Totales>", "")}
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${buildItems(factura.items)}
  </DetallesItems>
  <InformacionReferencia>
    <NCFModificado>${factura.eCFRef ?? ""}</NCFModificado>
    <FechaNCFModificado>${formatFecha(factura.fecha)}</FechaNCFModificado>
    <CodigoModificacion>1</CodigoModificacion>
  </InformacionReferencia>
</ECF>`;
}

// ── RFCE — Resumen E32 < RD$250,000 ──────────────────────────────
function buildRFCE(factura: Factura, empresa: EmpresaConfig): string {
  const t = calcTotales(factura.items);
  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${factura.eCF}</eNCF>
      <FechaVencimientoSecuencia>${factura.vencimientoECF}</FechaVencimientoSecuencia>
      <FechaEmision>${formatFecha(factura.fecha)}</FechaEmision>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${empresa.rnc.replace(/\D/g, "")}</RNCEmisor>
      <RazonSocialEmisor>${escapeXml(empresa.nombre)}</RazonSocialEmisor>
    </Emisor>
    <Resumen>
      <MontoGravadoTotal>${formatMonto(t.sub)}</MontoGravadoTotal>
      <MontoExento>${formatMonto(0)}</MontoExento>
      <ITBIS1>${formatMonto(t.itbis)}</ITBIS1>
      <TotalITBIS>${formatMonto(t.itbis)}</TotalITBIS>
      <MontoTotal>${formatMonto(t.total)}</MontoTotal>
    </Resumen>
  </Encabezado>
</RFCE>`;
}

// ── Exportación principal ─────────────────────────────────────────
export function buildXML(
  factura:  Factura,
  cliente:  Cliente | undefined,
  empresa:  EmpresaConfig,
): string {
  switch (factura.tipoECF) {
    case "E31": return buildE31(factura, cliente!, empresa);
    case "E32": return buildE32(factura, empresa);
    case "E33": return buildE33(factura, cliente, empresa);
    case "E34": return buildE34(factura, cliente, empresa);
    default:    return buildE31(factura, cliente!, empresa);
  }
}

export function buildRFCEXml(factura: Factura, empresa: EmpresaConfig): string {
  return buildRFCE(factura, empresa);
}

export const LIMITE_RFCE = 250_000;