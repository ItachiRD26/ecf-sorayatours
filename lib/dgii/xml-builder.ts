// Construye el XML del e-CF según los XSD oficiales de la DGII
// Revisado contra cada XSD: e-CF_31 a e-CF_47 + RFCE
// Soporta: E31, E32, E33, E34, E41, E43, E44, E45, E46, E47

import type { Factura, Cliente, LineaServicio } from "@/types";
import { calcLinea, calcTotales } from "@/types";

const VERSION = "1.0";

// ── Helpers ───────────────────────────────────────────────────────

function getTipoPago(terminos: string): string {
  return terminos === "Contado" ? "1" : "2";
}

// Normaliza RNC/Cédula → solo dígitos, 9 u 11 chars
// "1-31217656-6" → "131217656" (9 dígitos, sin dígito verificador)
function fmtRNC(rnc: string): string {
  const d = rnc.replace(/\D/g, "");
  if (d.length === 9 || d.length === 11) return d;
  if (d.length === 10) return d.substring(0, 9); // quitar dígito verificador
  return d;
}

// Convierte YYYY-MM-DD → DD-MM-YYYY (formato DGII)
function fmtFecha(fecha: string): string {
  if (!fecha) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(fecha)) return fecha;
  const [y, m, d] = fecha.split("-");
  if (y && m && d) return `${d.padStart(2,"0")}-${m.padStart(2,"0")}-${y}`;
  return fecha;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string { return n.toFixed(2); }

interface EmpresaConfig {
  nombre: string; rnc: string; direccion: string; telefono: string;
}

// ── Emisor ────────────────────────────────────────────────────────
// FechaEmision va en <Emisor> como último elemento requerido (XSD)
function buildEmisor(e: EmpresaConfig, fecha: string): string {
  return `<Emisor>
    <RNCEmisor>${fmtRNC(e.rnc)}</RNCEmisor>
    <RazonSocialEmisor>${escapeXml(e.nombre)}</RazonSocialEmisor>
    <DireccionEmisor>${escapeXml(e.direccion)}</DireccionEmisor>
    ${e.telefono ? `<TablaTelefonoEmisor><TelefonoEmisor>${e.telefono}</TelefonoEmisor></TablaTelefonoEmisor>` : ""}
    <ActividadEconomica>Servicios de Turismo y Excursiones</ActividadEconomica>
    <FechaEmision>${fmtFecha(fecha)}</FechaEmision>
  </Emisor>`;
}

// Emisor simplificado para RFCE (solo RNC y RazonSocial)
function buildEmisorRFCE(e: EmpresaConfig, fecha: string): string {
  return `<Emisor>
    <RNCEmisor>${fmtRNC(e.rnc)}</RNCEmisor>
    <RazonSocialEmisor>${escapeXml(e.nombre)}</RazonSocialEmisor>
    <FechaEmision>${fmtFecha(fecha)}</FechaEmision>
  </Emisor>`;
}

// ── IdDoc por tipo ────────────────────────────────────────────────
// E31, E32, E44, E45, E46 → TipoIngresos REQUERIDO
function idDocConIngresos(f: Factura, tipo: string): string {
  return `<IdDoc>
    <TipoeCF>${tipo}</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
    <TipoIngresos>01</TipoIngresos>
    <TipoPago>${getTipoPago(f.terminos)}</TipoPago>
  </IdDoc>`;
}

// E41 → sin TipoIngresos, TipoPago opcional
function idDocE41(f: Factura): string {
  return `<IdDoc>
    <TipoeCF>41</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
  </IdDoc>`;
}

// E33 → TipoIngresos opcional
function idDocE33(f: Factura): string {
  return `<IdDoc>
    <TipoeCF>33</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
    <TipoIngresos>01</TipoIngresos>
    <TipoPago>1</TipoPago>
  </IdDoc>`;
}

// E34 → sin TipoIngresos
function idDocE34(f: Factura): string {
  return `<IdDoc>
    <TipoeCF>34</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
    <TipoPago>1</TipoPago>
  </IdDoc>`;
}

// E43 → sin TipoIngresos, sin TipoPago requerido
function idDocE43(f: Factura): string {
  return `<IdDoc>
    <TipoeCF>43</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
  </IdDoc>`;
}

// E47 → sin TipoIngresos
function idDocE47(f: Factura): string {
  return `<IdDoc>
    <TipoeCF>47</TipoeCF>
    <eNCF>${f.eCF}</eNCF>
    <FechaVencimientoSecuencia>${fmtFecha(f.vencimientoECF)}</FechaVencimientoSecuencia>
  </IdDoc>`;
}

// ── Compradores ───────────────────────────────────────────────────
function compradorB2B(c: Cliente): string {
  return `<Comprador>
    <RNCComprador>${fmtRNC(c.rnc ?? "")}</RNCComprador>
    <RazonSocialComprador>${escapeXml(c.nombre)}</RazonSocialComprador>
    ${c.direccion ? `<DireccionComprador>${escapeXml(c.direccion)}</DireccionComprador>` : ""}
  </Comprador>`;
}

function compradorConsumidor(f: Factura): string {
  return `<Comprador>
    <RazonSocialComprador>${escapeXml(f.nombreConsumidor ?? "CONSUMIDOR FINAL")}</RazonSocialComprador>
  </Comprador>`;
}

function compradorExtranjero(f: Factura): string {
  return `<Comprador>
    ${f.idTransaccion ? `<IdentificadorExtranjero>${escapeXml(f.idTransaccion)}</IdentificadorExtranjero>` : ""}
    <RazonSocialComprador>${escapeXml(f.nombreConsumidor ?? "BENEFICIARIO EXTERIOR")}</RazonSocialComprador>
  </Comprador>`;
}

// ── Items ─────────────────────────────────────────────────────────
function buildItems(items: LineaServicio[]): string {
  return items.map((item, i) => {
    const c       = calcLinea(item);
    const paxDesc = item.pax > 0 ? ` | PAX: ${item.pax}` : "";
    const cant    = item.modo === "por_persona" ? (item.pax || 1) : Math.max(item.pax, 1);
    const precioU = item.modo === "por_grupo" ? (c.bruto / Math.max(item.pax, 1)) : item.precio;
    return `<Item>
      <NumeroLinea>${i + 1}</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>${escapeXml(item.descripcion.substring(0, 80))}</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      ${(item.descripcion.length > 80 || paxDesc) ? `<DescripcionItem>${escapeXml((item.descripcion + paxDesc).substring(0, 1000))}</DescripcionItem>` : ""}
      <CantidadItem>${fmt(cant)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(precioU)}</PrecioUnitarioItem>
      ${item.descuentoMonto > 0 ? `<DescuentoMonto>${fmt(item.descuentoMonto)}</DescuentoMonto>` : ""}
      <TablaSubDescuento><SubDescuento><TasaSubDescuento>0.00</TasaSubDescuento><MontoSubDescuento>0.00</MontoSubDescuento></SubDescuento></TablaSubDescuento>
      <MontoItem>${fmt(c.sub)}</MontoItem>
      ${item.itbis === 0 ? `<BienOServExentoITBIS>E</BienOServExentoITBIS>` : `<ITBIS>${fmt(c.itbisAmt)}</ITBIS>`}
    </Item>`;
  }).join("\n");
}

// E41 — Retencion requerida con IndicadorAgenteRetencionoPercepcion
function buildItemsE41(items: LineaServicio[]): string {
  return items.map((item, i) => {
    const c       = calcLinea(item);
    const cant    = item.modo === "por_persona" ? (item.pax || 1) : Math.max(item.pax, 1);
    const precioU = item.modo === "por_grupo" ? (c.bruto / Math.max(item.pax, 1)) : item.precio;
    const itbisRetenido = fmt(c.itbisAmt);
    return `<Item>
      <NumeroLinea>${i + 1}</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoITBISRetenido>${itbisRetenido}</MontoITBISRetenido>
      </Retencion>
      <NombreItem>${escapeXml(item.descripcion.substring(0, 80))}</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>${fmt(cant)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(precioU)}</PrecioUnitarioItem>
      <MontoItem>${fmt(c.sub)}</MontoItem>
      <ITBIS>${fmt(c.itbisAmt)}</ITBIS>
    </Item>`;
  }).join("\n");
}

// E47 — Retencion con ISR retenido
function buildItemsE47(items: LineaServicio[]): string {
  return items.map((item, i) => {
    const c       = calcLinea(item);
    const cant    = item.modo === "por_persona" ? (item.pax || 1) : Math.max(item.pax, 1);
    const precioU = item.modo === "por_grupo" ? (c.bruto / Math.max(item.pax, 1)) : item.precio;
    return `<Item>
      <NumeroLinea>${i + 1}</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoISRRetenido>${fmt(c.sub * 0.27)}</MontoISRRetenido>
      </Retencion>
      <NombreItem>${escapeXml(item.descripcion.substring(0, 80))}</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>${fmt(cant)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(precioU)}</PrecioUnitarioItem>
      <MontoItem>${fmt(c.sub)}</MontoItem>
    </Item>`;
  }).join("\n");
}

// ── Totales por tipo ──────────────────────────────────────────────

// E31, E32, E33, E45 — gravado + ITBIS + total
function totalesGravados(f: Factura): string {
  const t      = calcTotales(f.items);
  const exentos = f.items.filter(i => i.itbis === 0).reduce((s, i) => s + calcLinea(i).sub, 0);
  const grav   = t.sub - exentos;
  return `<Totales>
    <MontoGravadoTotal>${fmt(grav)}</MontoGravadoTotal>
    <MontoGravadoI1>${fmt(grav)}</MontoGravadoI1>
    <MontoExento>${fmt(exentos)}</MontoExento>
    <TotalITBIS>${fmt(t.itbis)}</TotalITBIS>
    <TotalITBIS1>${fmt(t.itbis)}</TotalITBIS1>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
  </Totales>`;
}

// E41 — comprobante de compras con retenciones
function totalesE41(f: Factura): string {
  const t      = calcTotales(f.items);
  const exentos = f.items.filter(i => i.itbis === 0).reduce((s, i) => s + calcLinea(i).sub, 0);
  const grav   = t.sub - exentos;
  return `<Totales>
    <MontoGravadoTotal>${fmt(grav)}</MontoGravadoTotal>
    <MontoGravadoI1>${fmt(grav)}</MontoGravadoI1>
    <MontoExento>${fmt(exentos)}</MontoExento>
    <TotalITBIS>${fmt(t.itbis)}</TotalITBIS>
    <TotalITBIS1>${fmt(t.itbis)}</TotalITBIS1>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
    <TotalITBISRetenido>${fmt(t.itbis)}</TotalITBISRetenido>
  </Totales>`;
}

// E43 — gastos menores (solo MontoExento + MontoTotal)
function totalesE43(f: Factura): string {
  const t = calcTotales(f.items);
  return `<Totales>
    <MontoExento>0.00</MontoExento>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
  </Totales>`;
}

// E44 — regímenes especiales (exento de ITBIS, solo total)
function totalesE44(f: Factura): string {
  const t = calcTotales(f.items);
  return `<Totales>
    <MontoExento>${fmt(t.sub)}</MontoExento>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
  </Totales>`;
}

// E46 — exportaciones (exentas, MontoGravadoI3 para tasa 0%)
function totalesE46(f: Factura): string {
  const t = calcTotales(f.items);
  return `<Totales>
    <MontoExento>${fmt(t.sub)}</MontoExento>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
  </Totales>`;
}

// E47 — pagos al exterior (exentos + ISR retenido)
function totalesE47(f: Factura): string {
  const t        = calcTotales(f.items);
  const isrTotal = t.sub * 0.27;
  return `<Totales>
    <MontoExento>${fmt(t.sub)}</MontoExento>
    <MontoTotal>${fmt(t.total)}</MontoTotal>
    <TotalISRRetencion>${fmt(isrTotal)}</TotalISRRetencion>
  </Totales>`;
}

// ── InformacionReferencia ─────────────────────────────────────────
function infoRef(f: Factura, codMod: string): string {
  return `<InformacionReferencia>
    <NCFModificado>${f.eCFRef ?? ""}</NCFModificado>
    <FechaNCFModificado>${fmtFecha(f.fecha)}</FechaNCFModificado>
    <CodigoModificacion>${codMod}</CodigoModificacion>
    ${f.motivoNota ? `<RazonModificacion>${escapeXml(f.motivoNota)}</RazonModificacion>` : ""}
  </InformacionReferencia>`;
}

// ── CONSTRUCTORES POR TIPO ────────────────────────────────────────

function buildE31(f: Factura, c: Cliente, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocConIngresos(f, "31")}
    ${buildEmisor(e, f.fecha)}
    ${compradorB2B(c)}
    ${totalesGravados(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE32(f: Factura, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocConIngresos(f, "32")}
    ${buildEmisor(e, f.fecha)}
    ${compradorConsumidor(f)}
    ${totalesGravados(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE33(f: Factura, c: Cliente | undefined, e: EmpresaConfig): string {
  const comp = c ? compradorB2B(c) : compradorConsumidor(f);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocE33(f)}
    ${buildEmisor(e, f.fecha)}
    ${comp}
    ${totalesGravados(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
  ${infoRef(f, "3")}
</ECF>`;
}

function buildE34(f: Factura, c: Cliente | undefined, e: EmpresaConfig): string {
  const comp = c ? compradorB2B(c) : compradorConsumidor(f);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocE34(f)}
    ${buildEmisor(e, f.fecha)}
    ${comp}
    ${totalesGravados(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
  ${infoRef(f, "2")}
</ECF>`;
}

function buildE41(f: Factura, c: Cliente, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocE41(f)}
    ${buildEmisor(e, f.fecha)}
    ${compradorB2B(c)}
    ${totalesE41(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItemsE41(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE43(f: Factura, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocE43(f)}
    ${buildEmisor(e, f.fecha)}
    ${totalesE43(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE44(f: Factura, c: Cliente | undefined, e: EmpresaConfig): string {
  const comp = c ? compradorB2B(c) : compradorConsumidor(f);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocConIngresos(f, "44")}
    ${buildEmisor(e, f.fecha)}
    ${comp}
    ${totalesE44(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE45(f: Factura, c: Cliente, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocConIngresos(f, "45")}
    ${buildEmisor(e, f.fecha)}
    ${compradorB2B(c)}
    ${totalesGravados(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE46(f: Factura, c: Cliente | undefined, e: EmpresaConfig): string {
  let comp: string;
  if (f.idTransaccion) {
    comp = compradorExtranjero(f);
  } else if (c) {
    comp = compradorB2B(c);
  } else {
    comp = compradorConsumidor(f);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocConIngresos(f, "46")}
    ${buildEmisor(e, f.fecha)}
    ${comp}
    ${totalesE46(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItems(f.items)}
  </DetallesItems>
</ECF>`;
}

function buildE47(f: Factura, e: EmpresaConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>${VERSION}</Version>
    ${idDocE47(f)}
    ${buildEmisor(e, f.fecha)}
    ${compradorExtranjero(f)}
    ${totalesE47(f)}
  </Encabezado>
  <DetallesItems>
    ${buildItemsE47(f.items)}
  </DetallesItems>
</ECF>`;
}

// ── RFCE — Resumen E32 < RD$250,000 ──────────────────────────────
// Estructura según XSD RFCE_32_v_1_0:
// IdDoc (sin FechaVencimientoSecuencia) → Emisor → Comprador → Totales
function buildRFCE(f: Factura, e: EmpresaConfig, codigoSeguridad: string = ""): string {
  const t       = calcTotales(f.items);
  const exentos = f.items.filter(i => i.itbis === 0).reduce((s, i) => s + calcLinea(i).sub, 0);
  const grav    = t.sub - exentos;
  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>${VERSION}</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${f.eCF}</eNCF>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>${getTipoPago(f.terminos)}</TipoPago>
    </IdDoc>
    ${buildEmisorRFCE(e, f.fecha)}
    <Comprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${fmt(grav)}</MontoGravadoTotal>
      <MontoGravadoI1>${fmt(grav)}</MontoGravadoI1>
      <MontoExento>${fmt(exentos)}</MontoExento>
      <TotalITBIS>${fmt(t.itbis)}</TotalITBIS>
      <TotalITBIS1>${fmt(t.itbis)}</TotalITBIS1>
      <MontoTotal>${fmt(t.total)}</MontoTotal>
    </Totales>
    ${codigoSeguridad ? `<CodigoSeguridadeCF>${codigoSeguridad.substring(0, 6)}</CodigoSeguridadeCF>` : ""}
  </Encabezado>
</RFCE>`;
}

// ── EXPORTACIÓN PRINCIPAL ─────────────────────────────────────────
export function buildXML(f: Factura, cliente: Cliente | undefined, empresa: EmpresaConfig): string {
  switch (f.tipoECF) {
    case "E31": return buildE31(f, cliente!, empresa);
    case "E32": return buildE32(f, empresa);
    case "E33": return buildE33(f, cliente, empresa);
    case "E34": return buildE34(f, cliente, empresa);
    case "E41": return buildE41(f, cliente!, empresa);
    case "E43": return buildE43(f, empresa);
    case "E44": return buildE44(f, cliente, empresa);
    case "E45": return buildE45(f, cliente!, empresa);
    case "E46": return buildE46(f, cliente, empresa);
    case "E47": return buildE47(f, empresa);
    default:    throw new Error(`Tipo eCF no soportado: ${f.tipoECF}`);
  }
}

export function buildRFCEXml(f: Factura, empresa: EmpresaConfig, codigoSeguridad?: string): string {
  return buildRFCE(f, empresa, codigoSeguridad ?? "");
}

export const LIMITE_RFCE = 250_000;

// ── SET DE PRUEBAS DGII — Paso 2 Certificación ───────────────────
export interface CasoPrueba {
  eNCF: string; tipoECF: string; fecha: string; vencimiento: string;
  rncComprador?: string; razonComprador?: string; idExtranjero?: string;
  montoGravado: number; itbis: number; montoTotal: number;
  nombreItem: string; cantItem: number; precioUnit: number; indicadorBS: number;
  eCFRef?: string; fechaNCFMod?: string; codMod?: string; razonMod?: string;
  esMenor250k?: boolean;
}

const RNC_TEST = "131880681";
const RAZ_TEST = "DOCUMENTOS ELECTRONICOS DE PRUEBA DGII";

export const SET_PRUEBAS_DGII: CasoPrueba[] = [
  { eNCF:"E310000000001", tipoECF:"31", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:6000,     itbis:1080,    montoTotal:7080,      nombreItem:"ASW DTU",                              cantItem:15,   precioUnit:400,      indicadorBS:1 },
  { eNCF:"E310000000002", tipoECF:"31", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:3230,     itbis:0,       montoTotal:3230,      nombreItem:"PTE. CJ 24/12OZ",                      cantItem:1,    precioUnit:3230,     indicadorBS:1 },
  { eNCF:"E310000000004", tipoECF:"31", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:15548.04, itbis:3184.48, montoTotal:18732.52,  nombreItem:"MESAS INDUSTRIALES",                   cantItem:1,    precioUnit:15548.04, indicadorBS:1 },
  { eNCF:"E310000000006", tipoECF:"31", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:133975,   itbis:24115.50,montoTotal:228460.50, nombreItem:"ARROZ LA GARZA",                       cantItem:1,    precioUnit:133975,   indicadorBS:1 },
  { eNCF:"E320000000004", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:484250,   itbis:83125,   montoTotal:567375,    nombreItem:"BLOCK",                                cantItem:100,  precioUnit:4842.50,  indicadorBS:1, esMenor250k:false },
  { eNCF:"E320000000006", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:350765,   itbis:80960,   montoTotal:431725,    nombreItem:"LAPICES",                              cantItem:10000,precioUnit:35.08,    indicadorBS:1, esMenor250k:false },
  { eNCF:"E330000000001", tipoECF:"33", fecha:"2020-04-02", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:400000,   itbis:0,       montoTotal:400000,    nombreItem:"LECHE",                                cantItem:1,    precioUnit:400000,   indicadorBS:1, eCFRef:"E320000000006", fechaNCFMod:"2020-04-01", codMod:"3" },
  { eNCF:"E340000000001", tipoECF:"34", fecha:"2020-04-02", vencimiento:"2099-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:0,        itbis:0,       montoTotal:0,         nombreItem:"TOP BOWL 1",                           cantItem:23,   precioUnit:0,        indicadorBS:1, eCFRef:"E310000000001", fechaNCFMod:"2020-04-01", codMod:"2", razonMod:"Error en datos" },
  { eNCF:"E340000000016", tipoECF:"34", fecha:"2020-12-01", vencimiento:"2099-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:0,        itbis:0,       montoTotal:0,         nombreItem:"Servicio Profesional Legislativo Actualiz", cantItem:1, precioUnit:0,        indicadorBS:2, eCFRef:"E410000000010", fechaNCFMod:"2020-04-01", codMod:"2" },
  { eNCF:"E410000000001", tipoECF:"41", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:10000,    itbis:1800,    montoTotal:9000,      nombreItem:"SERVICIO PUBLICIDAD",                  cantItem:100,  precioUnit:100,      indicadorBS:2 },
  { eNCF:"E410000000010", tipoECF:"41", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:15045.30, itbis:2608.70, montoTotal:17654,     nombreItem:"Servicio Profesional Legislativo",     cantItem:1,    precioUnit:15045.30, indicadorBS:2 },
  { eNCF:"E430000000009", tipoECF:"43", fecha:"2020-04-01", vencimiento:"2028-12-31", montoGravado:0,        itbis:0,       montoTotal:20,        nombreItem:"Arreglo neumaticos",                   cantItem:20,   precioUnit:1,        indicadorBS:2 },
  { eNCF:"E430000000010", tipoECF:"43", fecha:"2020-04-01", vencimiento:"2028-12-31", montoGravado:0,        itbis:0,       montoTotal:12,        nombreItem:"Gasto personal en comida (kiosko)",    cantItem:2,    precioUnit:6,        indicadorBS:2 },
  { eNCF:"E440000000007", tipoECF:"44", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:0,        itbis:0,       montoTotal:432000,    nombreItem:"PTE. CJ 24/12OZ",                      cantItem:2,    precioUnit:216000,   indicadorBS:1 },
  { eNCF:"E440000000011", tipoECF:"44", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:0,        itbis:0,       montoTotal:3634258,   nombreItem:"Mero Basa",                            cantItem:8,    precioUnit:454282.25,indicadorBS:1 },
  { eNCF:"E450000000001", tipoECF:"45", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:30000,    itbis:5400,    montoTotal:35400,     nombreItem:"SERVICIO PUBLICIDAD",                  cantItem:1,    precioUnit:30000,    indicadorBS:2 },
  { eNCF:"E450000000009", tipoECF:"45", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:478750,   itbis:86175,   montoTotal:564925,    nombreItem:"BLOCK",                                cantItem:20,   precioUnit:23937.50, indicadorBS:1 },
  { eNCF:"E460000000001", tipoECF:"46", fecha:"2020-04-01", vencimiento:"2028-12-31", rncComprador:RNC_TEST, razonComprador:RAZ_TEST, montoGravado:1800000,  itbis:0,       montoTotal:1800000,   nombreItem:"AGUACATE CRIOLLO",                     cantItem:12,   precioUnit:150000,   indicadorBS:1 },
  { eNCF:"E460000000011", tipoECF:"46", fecha:"2020-04-01", vencimiento:"2028-12-31", idExtranjero:"56789UJILLL", montoGravado:1086, itbis:0,               montoTotal:1086, nombreItem:"Gouda Import",                               cantItem:1,    precioUnit:1086,     indicadorBS:1 },
  { eNCF:"E470000000008", tipoECF:"47", fecha:"2018-12-01", vencimiento:"2028-12-31", idExtranjero:"350555123",   montoGravado:945,  itbis:0,               montoTotal:945,  nombreItem:"Asesoria Legal P/H",                         cantItem:1,    precioUnit:945,      indicadorBS:2 },
  { eNCF:"E470000000009", tipoECF:"47", fecha:"2020-04-01", vencimiento:"2028-12-31", idExtranjero:"131880681",   montoGravado:7290, itbis:0,               montoTotal:7290, nombreItem:"Asesoria Legal P/H",                         cantItem:20,   precioUnit:364.50,   indicadorBS:2 },
  { eNCF:"E320000000011", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:34000,    itbis:6120,    montoTotal:40120,     nombreItem:"Cargador",                             cantItem:15,   precioUnit:2266.67,  indicadorBS:1, esMenor250k:true },
  { eNCF:"E320000000013", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:95000,    itbis:17100,   montoTotal:112100,    nombreItem:"Nevera",                               cantItem:1,    precioUnit:95000,    indicadorBS:1, esMenor250k:true },
  { eNCF:"E320000000014", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:10100,    itbis:1818,    montoTotal:11918,     nombreItem:"Articulos de belleza",                 cantItem:15,   precioUnit:673.33,   indicadorBS:1, esMenor250k:true },
  { eNCF:"E320000000015", tipoECF:"32", fecha:"2020-04-01", vencimiento:"2099-12-31", montoGravado:55000,    itbis:9900,    montoTotal:64900,     nombreItem:"Celular",                              cantItem:50,   precioUnit:1100,     indicadorBS:1, esMenor250k:true },
];