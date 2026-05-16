// API Route — Envía un caso del set de pruebas DGII (Paso 2 Certificación)
// Lee los datos EXACTOS del Excel (Firebase Storage) y construye el XML campo a campo.
// POST /api/dgii/cert/enviar  { encf: "E410000000010" }

import { NextRequest, NextResponse }  from "next/server";
import { adminAuth }                   from "@/lib/firebase-admin";
import { firmarXML }                   from "@/lib/dgii/xml-signer";
import { enviarECF, enviarRFCE }       from "@/lib/dgii/dgii-client";
import { getAllRowsFromStorage }         from "@/app/api/dgii/cert/upload-set/route";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// '#e' = campo vacío en el Excel de DGII
const DGII_EMPTY = new Set(["#e", "#E"]);

function raw(row: Record<string,unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s !== "" && !DGII_EMPTY.has(s)) return s;
    }
  }
  return "";
}

// Número sin filtrar "0" — para IndicadorMontoGravado, ITBIS, etc.
function rawNum(row: Record<string,unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s !== "" && !DGII_EMPTY.has(s)) return s;
    }
  }
  return "";
}

const esc = (s: string) => s
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&apos;");

// 2 decimales (montos)
const fmt2 = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "0.00" : n.toFixed(2);
};
// 4 decimales (precios unitarios — DGII espera 4 dec)
const fmt4 = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "0.0000" : n.toFixed(4);
};
// Entero (ITBIS tasas, cantidades)
const fmtInt = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "0" : String(Math.round(n));
};

// Fecha: YYYY-MM-DD o serial Excel → DD-MM-YYYY
function fmtFecha(v: string): string {
  if (!v) return "";
  // Excel serial number
  if (/^\d{5}$/.test(v)) {
    const d = new Date((Number(v) - 25569) * 86400000);
    return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return v;
  const parts = v.split(/[-\/]/);
  if (parts.length === 3) {
    const [a,b,c] = parts;
    if (a.length === 4) return `${c.padStart(2,"0")}-${b.padStart(2,"0")}-${a}`;
    return `${a.padStart(2,"0")}-${b.padStart(2,"0")}-${c}`;
  }
  return v;
}

// Helper: leer fecha del Excel
const fecha = (row: Record<string,unknown>, ...keys: string[]) =>
  fmtFecha(raw(row, ...keys));

// Helper: elemento XML opcional — solo si hay valor
const opt = (tag: string, val: string) =>
  val ? `<${tag}>${esc(val)}</${tag}>` : "";
const optDate = (tag: string, val: string) =>
  val ? `<${tag}>${val}</${tag}>` : "";
const optNum2 = (tag: string, val: string) =>
  val ? `<${tag}>${fmt2(val)}</${tag}>` : "";
const optInt = (tag: string, val: string) =>
  val ? `<${tag}>${fmtInt(val)}</${tag}>` : "";

// Facturas de consumo que van como RFCE (< RD$250k)
const ENCFS_RFCE = new Set(["E320000000011","E320000000013","E320000000014","E320000000015"]);

// Buscar fila del Excel por eNCF
function buscarFila(rows: Record<string,unknown>[], encf: string): Record<string,unknown> | null {
  const t = encf.toUpperCase().replace(/\s/g,"");
  for (const row of rows) {
    if (String(row["encf"] ?? "").trim().toUpperCase().replace(/\s/g,"") === t) return row;
  }
  return null;
}

// Tipo de ECF: "E410000000010" → "41"
function tipoECF(encf: string, rowTipo: string): string {
  if (rowTipo) {
    const t = rowTipo.replace(/[^0-9]/g,"");
    if (t.length >= 2) return t.substring(0,2);
  }
  const m = encf.match(/^E(\d{2})/i);
  return m ? m[1] : "32";
}

// ── BUILDER PRINCIPAL ECF ─────────────────────────────────────────────────────
function buildXML(row: Record<string,unknown>, encf: string): string {
  const tipo = tipoECF(encf, raw(row,"tipoecf","tipo_ecf"));

  // ── IdDoc ─────────────────────────────────────────────────────────────────
  // FechaVencimientoSecuencia: NO en E32 ni E34
  const tieneFechaVencim = !["32","34"].includes(tipo);
  // TipoIngresos: NO en E41, E43, E47
  const tieneIngresos    = !["41","43","47"].includes(tipo);
  // IndicadorNotaCredito: solo E34 (puede ser "0" o "1")
  const tieneNotaCredito = tipo === "34";

  const vencimRaw = raw(row,"fechavencimientosecuencia","fecha_vencimiento_secuencia");
  const vencim    = vencimRaw ? fmtFecha(vencimRaw) : "";

  const indMontoGrav = rawNum(row,"indicadormontogravado","indicador_monto_gravado");
  const indNotaCred  = rawNum(row,"indicadornotacredito","indicador_nota_credito");
  const tipoPago     = raw(row,"tipopago","tipo_pago") || "1";
  const tipoIngr     = raw(row,"tipoingresos","tipo_ingresos"); // sin fallback: si Excel vacío, no enviar
  const fechaLimPago = fecha(row,"fechalimitepago","fecha_limite_pago");
  const terminoPago  = raw(row,"terminopago","termino_pago");

  const idDocXml = `<IdDoc>
    <TipoeCF>${tipo}</TipoeCF>
    <eNCF>${encf}</eNCF>
    ${tieneFechaVencim && vencim ? `<FechaVencimientoSecuencia>${vencim}</FechaVencimientoSecuencia>` : ""}
    ${tieneNotaCredito ? `<IndicadorNotaCredito>${indNotaCred || "0"}</IndicadorNotaCredito>` : ""}
    ${indMontoGrav !== "" ? `<IndicadorMontoGravado>${indMontoGrav}</IndicadorMontoGravado>` : ""}
    ${tieneIngresos && tipoIngr ? `<TipoIngresos>${tipoIngr}</TipoIngresos>` : ""}
    <TipoPago>${tipoPago}</TipoPago>
    ${optDate("FechaLimitePago", fechaLimPago)}
    ${opt("TerminoPago", terminoPago)}
  </IdDoc>`;

  // ── Emisor ────────────────────────────────────────────────────────────────
  // Orden XSD: RNC→Razon→NomCom→Sucursal→Direc→Municipio→Provincia→Telefono→
  //            Correo→WebSite→Actividad→CodVendedor→NoFactInterna→NoPedido→
  //            ZonaVenta→RutaVenta→InfoAdicional→FechaEmision
  const rncEm       = raw(row,"rncemisor","rnc_emisor").replace(/\D/g,"") || "131217656";
  const razonEm     = esc(raw(row,"razonsocialemisor","razon_social_emisor"));
  const nomCom      = esc(raw(row,"nombrecomercial","nombre_comercial"));
  const dirEm       = esc(raw(row,"direccionemisor","direccion_emisor"));
  const muni        = raw(row,"municipio");
  const prov        = raw(row,"provincia");
  const telEm1      = raw(row,"telefonoemisor1","telefonoemisor");
  const correoEm    = esc(raw(row,"correoemisor","correo_emisor"));
  const webSite     = esc(raw(row,"website","web_site"));
  const actEcon     = esc(raw(row,"actividadeconomica","actividad_economica"));
  const codVend     = esc(raw(row,"codigovendedor","codigo_vendedor"));
  const noFactInt   = raw(row,"numerofacturainterna","numero_factura_interna");
  const noPedido    = raw(row,"numeropedidointerno","numero_pedido_interno");
  const zonaVenta   = esc(raw(row,"zonaventa","zona_venta"));
  const rutaVenta   = esc(raw(row,"rutaventa","ruta_venta"));
  const infoEmis    = esc(raw(row,"informacionadicionalemisor","informacion_adicional_emisor"));
  const fechaEm     = fmtFecha(raw(row,"fechaemision","fecha_emision"));

  const emisorXml = `<Emisor>
    <RNCEmisor>${rncEm}</RNCEmisor>
    <RazonSocialEmisor>${razonEm}</RazonSocialEmisor>
    ${opt("NombreComercial", nomCom)}
    ${dirEm ? `<DireccionEmisor>${dirEm}</DireccionEmisor>` : ""}
    ${opt("Municipio", muni)}
    ${opt("Provincia", prov)}
    ${telEm1 ? `<TablaTelefonoEmisor><TelefonoEmisor>${telEm1}</TelefonoEmisor></TablaTelefonoEmisor>` : ""}
    ${opt("CorreoEmisor", correoEm)}
    ${opt("WebSite", webSite)}
    ${opt("ActividadEconomica", actEcon)}
    ${opt("CodigoVendedor", codVend)}
    ${opt("NumeroFacturaInterna", noFactInt)}
    ${opt("NumeroPedidoInterno", noPedido)}
    ${opt("ZonaVenta", zonaVenta)}
    ${opt("RutaVenta", rutaVenta)}
    ${opt("InformacionAdicionalEmisor", infoEmis)}
    <FechaEmision>${fechaEm}</FechaEmision>
  </Emisor>`;

  // ── Comprador ─────────────────────────────────────────────────────────────
  // Orden XSD: RNC→Razon→Contacto→Correo→Direc→Municipio→Provincia→
  //            FechaEntrega→ContactoEntrega→DirEntrega→TelAdicional→
  //            FechaOrdenCompra→NumeroOrdenCompra→CodigoInterno
  const rncComp      = raw(row,"rnccomprador","rnc_comprador").replace(/\D/g,"");
  const razonComp    = esc(raw(row,"razonsocialcomprador","razon_social_comprador"));
  const contactoComp = esc(raw(row,"contactocomprador","contacto_comprador"));
  const correoComp   = esc(raw(row,"correocomprador","correo_comprador"));
  const dirComp      = esc(raw(row,"direccioncomprador","direccion_comprador"));
  const muniComp     = raw(row,"municipiocomprador","municipio_comprador");
  const provComp     = raw(row,"provinciacomprador","provincia_comprador");
  const fechaEntrega = fecha(row,"fechaentrega","fecha_entrega");
  const contEntrega  = esc(raw(row,"contactoentrega","contacto_entrega"));
  const dirEntrega   = esc(raw(row,"direccionentrega","direccion_entrega"));
  const telAdicional = raw(row,"telefonoadicional","telefono_adicional");
  const fechaOC      = fecha(row,"fechaordencompra","fecha_orden_compra");
  const numOC        = raw(row,"numeroordencompra","numero_orden_compra");
  const codIntComp   = raw(row,"codigointernocomprador","codigo_interno_comprador");
  const idExt        = esc(raw(row,"identificadorextranjero","identificador_extranjero"));

  let compradorXml = "";
  if (idExt && (tipo === "47" || (tipo === "46" && !rncComp))) {
    compradorXml = `<Comprador>
    <IdentificadorExtranjero>${idExt}</IdentificadorExtranjero>
    <RazonSocialComprador>${razonComp || "BENEFICIARIO EXTERIOR"}</RazonSocialComprador>
  </Comprador>`;
  } else if (rncComp || razonComp) {
    compradorXml = `<Comprador>
    ${rncComp ? `<RNCComprador>${rncComp}</RNCComprador>` : ""}
    ${razonComp ? `<RazonSocialComprador>${razonComp}</RazonSocialComprador>` : ""}
    ${opt("ContactoComprador", contactoComp)}
    ${opt("CorreoComprador", correoComp)}
    ${opt("DireccionComprador", dirComp)}
    ${opt("MunicipioComprador", muniComp)}
    ${opt("ProvinciaComprador", provComp)}
    ${optDate("FechaEntrega", fechaEntrega)}
    ${opt("ContactoEntrega", contEntrega)}
    ${opt("DireccionEntrega", dirEntrega)}
    ${opt("TelefonoAdicional", telAdicional)}
    ${optDate("FechaOrdenCompra", fechaOC)}
    ${opt("NumeroOrdenCompra", numOC)}
    ${opt("CodigoInternoComprador", codIntComp)}
  </Comprador>`;
  }

  // ── Totales ───────────────────────────────────────────────────────────────
  // Orden XSD: GravTot→GravI1→GravI2→GravI3→Exento→ITBIS1(int)→ITBIS2→ITBIS3→
  //            TotalITBIS→TotalITBIS1→TotalITBIS2→TotalITBIS3→
  //            MontoTotal→MontoNoFacturable→MontoPeriodo→SaldoAnterior→
  //            MontoAvancePago→ValorPagar→TotalITBISRetenido→TotalISRRetencion
  const gravTot    = raw(row,"montogravadototal","monto_gravado_total");
  const gravI1     = raw(row,"montogravadoi1","monto_gravado_i1");
  const gravI2     = raw(row,"montogravadoi2","monto_gravado_i2");
  const gravI3     = raw(row,"montogravadoi3","monto_gravado_i3");
  const montoEx    = raw(row,"montoexento","monto_exento");
  const itbis1     = rawNum(row,"itbis1");
  const itbis2     = rawNum(row,"itbis2");
  const itbis3     = rawNum(row,"itbis3");
  const totItbis   = raw(row,"totalitbis","total_itbis");
  const totItbis1  = raw(row,"totalitbis1","total_itbis1");
  const totItbis2  = raw(row,"totalitbis2","total_itbis2");
  const totItbis3  = raw(row,"totalitbis3","total_itbis3");
  const montoTot   = raw(row,"montototal","monto_total") || "0";
  const montoNF    = raw(row,"montonofacturable","monto_no_facturable");
  const montoPer   = raw(row,"montoperiodo","monto_periodo");
  const saldoAnt   = raw(row,"saldoanterior","saldo_anterior");
  const avancePag  = raw(row,"montoavancepago","monto_avance_pago");
  const valorPag   = raw(row,"valorpagar","valor_pagar");
  const itbisRet   = raw(row,"totalitbisretenido","total_itbis_retenido");
  const isrRet     = raw(row,"totalisrretencion","total_isr_retencion");

  let totalesXml = "";
  if (tipo === "43") {
    totalesXml = `<Totales>
    ${optNum2("MontoExento", montoEx || montoTot)}
    <MontoTotal>${fmt2(montoTot)}</MontoTotal>
  </Totales>`;
  } else if (tipo === "44") {
    // E44: régimen especial — solo exento + total
    totalesXml = `<Totales>
    ${optNum2("MontoExento", montoEx)}
    <MontoTotal>${fmt2(montoTot)}</MontoTotal>
    ${optNum2("MontoPeriodo", montoPer)}
    ${optNum2("ValorPagar", valorPag)}
  </Totales>`;
  } else if (tipo === "46") {
    // E46: exportaciones — usa MontoGravadoI3 con ITBIS3=0
    totalesXml = `<Totales>
    ${optNum2("MontoGravadoTotal", gravTot || gravI3)}
    ${optNum2("MontoGravadoI1", gravI1)}
    ${optNum2("MontoGravadoI2", gravI2)}
    ${optNum2("MontoGravadoI3", gravI3)}
    ${optNum2("MontoExento", montoEx)}
    ${itbis1 !== "" ? `<ITBIS1>${fmtInt(itbis1)}</ITBIS1>` : ""}
    ${itbis2 !== "" ? `<ITBIS2>${fmtInt(itbis2)}</ITBIS2>` : ""}
    ${itbis3 !== "" ? `<ITBIS3>${fmtInt(itbis3)}</ITBIS3>` : ""}
    ${optNum2("TotalITBIS", totItbis)}
    ${optNum2("TotalITBIS1", totItbis1)}
    ${optNum2("TotalITBIS2", totItbis2)}
    ${optNum2("TotalITBIS3", totItbis3)}
    <MontoTotal>${fmt2(montoTot)}</MontoTotal>
    ${optNum2("MontoPeriodo", montoPer)}
    ${optNum2("ValorPagar", valorPag)}
  </Totales>`;
  } else if (tipo === "47") {
    totalesXml = `<Totales>
    ${optNum2("MontoExento", montoEx || montoTot)}
    <MontoTotal>${fmt2(montoTot)}</MontoTotal>
    ${optNum2("MontoPeriodo", montoPer)}
    ${optNum2("ValorPagar", valorPag)}
    ${optNum2("TotalISRRetencion", isrRet)}
  </Totales>`;
  } else {
    totalesXml = `<Totales>
    ${optNum2("MontoGravadoTotal", gravTot)}
    ${optNum2("MontoGravadoI1", gravI1)}
    ${optNum2("MontoGravadoI2", gravI2)}
    ${optNum2("MontoGravadoI3", gravI3)}
    ${optNum2("MontoExento", montoEx)}
    ${itbis1 !== "" ? `<ITBIS1>${fmtInt(itbis1)}</ITBIS1>` : ""}
    ${itbis2 !== "" ? `<ITBIS2>${fmtInt(itbis2)}</ITBIS2>` : ""}
    ${itbis3 !== "" ? `<ITBIS3>${fmtInt(itbis3)}</ITBIS3>` : ""}
    ${optNum2("TotalITBIS", totItbis)}
    ${optNum2("TotalITBIS1", totItbis1)}
    ${optNum2("TotalITBIS2", totItbis2)}
    ${optNum2("TotalITBIS3", totItbis3)}
    <MontoTotal>${fmt2(montoTot)}</MontoTotal>
    ${optNum2("MontoNoFacturable", montoNF)}
    ${optNum2("MontoPeriodo", montoPer)}
    ${optNum2("SaldoAnterior", saldoAnt)}
    ${optNum2("MontoAvancePago", avancePag)}
    ${optNum2("ValorPagar", valorPag)}
    ${optNum2("TotalITBISRetenido", itbisRet)}
    ${optNum2("TotalISRRetencion", isrRet)}
  </Totales>`;
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  // Orden XSD: NumeroLinea→IndicadorFacturacion→Retencion→NombreItem→
  //            IndicadorBienoServicio→DescripcionItem→CantidadItem→UnidadMedida→
  //            FechaElaboracion→FechaVencimientoItem→PrecioUnitarioItem→
  //            DescuentoMonto→TablaSubDescuento→MontoItem→ITBIS|Exento
  const items: string[] = [];
  for (let i = 1; i <= 62; i++) {
    const nom = raw(row, `nombreitem${i}`);
    if (!nom) break;

    const indFact = rawNum(row, `indicadorfacturacion${i}`) || "1";
    const retITBI = raw(row, `montoitbisretenido${i}`);
    const retISR  = raw(row, `montoisrretenido${i}`);
    const indAgen = rawNum(row, `indicadoragenteretencionopercepcion${i}`);
    const indBS   = rawNum(row, `indicadorbienoservicio${i}`) || "2";
    const descItem = esc(raw(row, `descripcionitem${i}`));
    const cant    = raw(row, `cantidaditem${i}`) || "1";
    const unidMed = raw(row, `unidadmedida${i}`);
    const fechaElab = fecha(row, `fechaelaboracion${i}`);
    const fechaVencI = fecha(row, `fechavencimientoitem${i}`);
    const precio  = raw(row, `preciounitarioitem${i}`) || "0";
    const descMonto = raw(row, `descuentomonto${i}`);
    const mItem   = raw(row, `montoitem${i}`) || "0";
    const itbItem = raw(row, `liquidacion${i}1`) || raw(row, `subtotaitbis${i}`);

    let itemXml = `<Item>
      <NumeroLinea>${i}</NumeroLinea>
      <IndicadorFacturacion>${indFact}</IndicadorFacturacion>`;

    // Retención para E41/E47
    if (retITBI || retISR || (indAgen && ["41","47"].includes(tipo))) {
      itemXml += `
      <Retencion>
        ${indAgen ? `<IndicadorAgenteRetencionoPercepcion>${indAgen}</IndicadorAgenteRetencionoPercepcion>` : ""}
        ${optNum2("MontoITBISRetenido", retITBI)}
        ${optNum2("MontoISRRetenido", retISR)}
      </Retencion>`;
    }

    // Cantidad: entero si es número redondo

    itemXml += `
      <NombreItem>${esc(nom.substring(0,80))}</NombreItem>
      <IndicadorBienoServicio>${indBS}</IndicadorBienoServicio>
      ${descItem ? `<DescripcionItem>${descItem}</DescripcionItem>` : ""}
      <CantidadItem>${cant || "1"}</CantidadItem>
      ${opt("UnidadMedida", unidMed)}
      ${optDate("FechaElaboracion", fechaElab)}
      ${optDate("FechaVencimientoItem", fechaVencI)}
      <PrecioUnitarioItem>${precio || "0"}</PrecioUnitarioItem>
      ${optNum2("DescuentoMonto", descMonto)}
      <MontoItem>${fmt2(mItem)}</MontoItem>`;

    // ITBIS del ítem o Exento
    if (itbItem) {
      itemXml += `\n      <ITBIS>${fmt2(itbItem)}</ITBIS>`;
    }

    itemXml += `\n    </Item>`;
    items.push(itemXml);
  }

  // Fallback si el Excel no tiene ítems detallados
  if (items.length === 0) {
    const mBase = gravI1 || gravTot || montoTot || "0";
    items.push(`<Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Servicio</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <PrecioUnitarioItem>${fmt2(mBase)}</PrecioUnitarioItem>
      <MontoItem>${fmt2(mBase)}</MontoItem>
    </Item>`);
  }

  // ── InformacionReferencia (E33, E34) ──────────────────────────────────────
  const ncfMod   = raw(row,"ncfmodificado","ncf_modificado");
  const fechaMod = fecha(row,"fechancfmodificado","fecha_ncf_modificado");
  const codMod   = raw(row,"codigomodificacion","codigo_modificacion") || "2";
  const razMod   = esc(raw(row,"razonmodificacion","razon_modificacion"));
  const infoRef  = (["33","34"].includes(tipo) && ncfMod)
    ? `<InformacionReferencia>
    <NCFModificado>${ncfMod}</NCFModificado>
    <FechaNCFModificado>${fechaMod || fechaEm}</FechaNCFModificado>
    <CodigoModificacion>${codMod}</CodigoModificacion>
    ${opt("RazonModificacion", razMod)}
  </InformacionReferencia>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    ${idDocXml}
    ${emisorXml}
    ${compradorXml}
    ${totalesXml}
  </Encabezado>
  <DetallesItems>
    ${items.join("\n    ")}
  </DetallesItems>
  ${infoRef}
</ECF>`;
}

// ── RFCE — Resumen Factura Consumo < RD$250,000 ───────────────────────────────
// XSD RFCE: IdDoc(TipoeCF→eNCF→TipoIngresos→TipoPago) — NO FechaVencimientoSecuencia
function buildRFCE(row: Record<string,unknown>, encf: string): string {
  const tipo     = tipoECF(encf, raw(row,"tipoecf","tipo_ecf"));
  const rncEm    = raw(row,"rncemisor","rnc_emisor").replace(/\D/g,"") || "131217656";
  const razonEm  = esc(raw(row,"razonsocialemisor","razon_social_emisor"));
  const fechaEm  = fmtFecha(raw(row,"fechaemision","fecha_emision"));
  const tipoPago = raw(row,"tipopago","tipo_pago") || "1";
  const tipoIngr = raw(row,"tipoingresos","tipo_ingresos") || "01";
  const rncComp  = raw(row,"rnccomprador","rnc_comprador").replace(/\D/g,"");
  const razonComp = esc(raw(row,"razonsocialcomprador","razon_social_comprador"));

  const gravTot   = raw(row,"montogravadototal","monto_gravado_total");
  const gravI1    = raw(row,"montogravadoi1","monto_gravado_i1");
  const gravI2    = raw(row,"montogravadoi2","monto_gravado_i2");
  const montoEx   = raw(row,"montoexento","monto_exento");
  const totItbis  = raw(row,"totalitbis","total_itbis");
  const totItbis1 = raw(row,"totalitbis1","total_itbis1");
  const totItbis2 = raw(row,"totalitbis2","total_itbis2");
  const montoTot  = raw(row,"montototal","monto_total") || "0";

  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${tipo}</TipoeCF>
      <eNCF>${encf}</eNCF>
      <TipoIngresos>${tipoIngr}</TipoIngresos>
      <TipoPago>${tipoPago}</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${rncEm}</RNCEmisor>
      <RazonSocialEmisor>${razonEm}</RazonSocialEmisor>
      <FechaEmision>${fechaEm}</FechaEmision>
    </Emisor>
    <Comprador>
      ${rncComp ? `<RNCComprador>${rncComp}</RNCComprador>` : ""}
      <RazonSocialComprador>${razonComp || "CONSUMIDOR FINAL"}</RazonSocialComprador>
    </Comprador>
    <Totales>
      ${optNum2("MontoGravadoTotal", gravTot)}
      ${optNum2("MontoGravadoI1", gravI1)}
      ${optNum2("MontoGravadoI2", gravI2)}
      ${optNum2("MontoExento", montoEx)}
      ${optNum2("TotalITBIS", totItbis)}
      ${optNum2("TotalITBIS1", totItbis1)}
      ${optNum2("TotalITBIS2", totItbis2)}
      <MontoTotal>${fmt2(montoTot)}</MontoTotal>
    </Totales>
  </Encabezado>
</RFCE>`;
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!await verificarSesion(req))
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const encf  = String(body.encf ?? body.eNCF ?? "").trim().toUpperCase();
    if (!encf) return NextResponse.json({ error: "encf requerido" }, { status: 400 });

    const rows = await getAllRowsFromStorage();
    if (rows.length === 0)
      return NextResponse.json({ error: "No hay Excel cargado." }, { status: 404 });

    const row = buscarFila(rows, encf);
    if (!row)
      return NextResponse.json({ error: `eNCF ${encf} no encontrado en el Excel` }, { status: 404 });

    const esRFCE = ENCFS_RFCE.has(encf);

    if (esRFCE) {
      const rfceXml     = buildRFCE(row, encf);
      const rfceFirmado = await firmarXML(rfceXml);
      const resultado   = await enviarRFCE(rfceFirmado);
      return NextResponse.json({
        success:     true, encf,
        trackId:     resultado.trackId,
        estadoDGII:  resultado.estado || "Enviado",
        esMenor250k: true,
        xmlGenerado: rfceFirmado,
      });
    }

    const xml     = buildXML(row, encf);
    const firmado = await firmarXML(xml);
    const trackId = await enviarECF(firmado);

    return NextResponse.json({
      success:     true, encf, trackId,
      estadoDGII:  "Enviado",
      esMenor250k: false,
      xmlGenerado: firmado,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/enviar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}