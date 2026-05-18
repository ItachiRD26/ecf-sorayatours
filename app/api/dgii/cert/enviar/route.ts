// API Route — Envía un caso del set de pruebas DGII (Paso 2 Certificación)
// Usa la librería dgii-ecf para firma y envío — NO reinventamos la rueda.
// POST /api/dgii/cert/enviar  { encf: "E410000000010" }

import { NextRequest, NextResponse }  from "next/server";
import path                            from "path";
import { adminAuth }                   from "@/lib/firebase-admin";
import { getAllRowsFromStorage }        from "@/app/api/dgii/cert/upload-set/route";
import ECF, {
  P12Reader,
  Signature,
  ENVIRONMENT,
} from "dgii-ecf";

// ── Configuración ──────────────────────────────────────────────────────────────
const RNC_EMISOR   = process.env.DGII_RNC           ?? "131217656";
const CERT_PATH    = process.env.DGII_CERT_PATH     ?? "";
const CERT_PASS    = process.env.DGII_CERT_PASSWORD ?? "";
const AMBIENTE     = (process.env.DGII_AMBIENTE     ?? "certecf").toLowerCase();

// Mapea el string de .env al enum de la librería
function getEnv(): ENVIRONMENT {
  if (AMBIENTE.includes("prod") || AMBIENTE === "ecf") return ENVIRONMENT.PROD;
  if (AMBIENTE.includes("cert"))                        return ENVIRONMENT.CERT;
  return ENVIRONMENT.DEV;
}

// Carga el certificado una sola vez (en memoria, no por request)
let _certs: { key: string; cert: string } | null = null;
function getCerts() {
  if (_certs) return _certs;
  const reader = new P12Reader(CERT_PASS);
  const data   = reader.getKeyFromFile(path.resolve(CERT_PATH));
  if (!data.key || !data.cert) throw new Error("No se pudo leer el certificado .p12");
  _certs = { key: data.key, cert: data.cert };
  return _certs;
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// ── Helpers lectura Excel ──────────────────────────────────────────────────────
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
function rawNum(row: Record<string,unknown>, ...keys: string[]): string {
  return raw(row, ...keys); // sin filtrar "0"
}

function fmtFecha(v: string): string {
  if (!v) return "";
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
const fecha = (row: Record<string,unknown>, ...keys: string[]) =>
  fmtFecha(raw(row, ...keys));

// toFmt: devuelve string con 2 decimales — el Transformer lo serializa tal cual
const toFmt  = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n.toFixed(2); };
const toNum  = toFmt; // alias para compatibilidad
const toInt  = (v: string) => { const n = parseInt(v);   return isNaN(n) ? undefined : n; };

// Facturas de consumo RFCE (< RD$250k) — eNCF que van como resumen
const ENCFS_RFCE = new Set([
  "E320000000011","E320000000013","E320000000014","E320000000015"
]);

function tipoECF(encf: string, rawTipo: string): string {
  const fromEncf = encf.match(/^E(\d{2})/)?.[1];
  return rawTipo || fromEncf || "31";
}

// ── Constructor de JSON para la librería ───────────────────────────────────────
// La librería usa Transformer.json2xml() que serializa JSON → XML
// El JSON sigue EXACTAMENTE la estructura del XSD (mismos nombres de campos)
// Los campos opcionales ausentes simplemente no se incluyen → no se generan tags vacíos
function buildJsonECF(row: Record<string,unknown>, encf: string): Record<string,unknown> {
  const tipo = tipoECF(encf, raw(row,"tipoecf","tipo_ecf"));

  // ── IdDoc ──────────────────────────────────────────────────────────────────
  const tieneFechaVencim  = !["32","34"].includes(tipo);
  const tieneNotaCredito  = tipo === "34";
  const tieneIngresos     = !["41","43","47"].includes(tipo);
  const tipoPagoReq       = !["41","43","47"].includes(tipo);

  const vencimRaw = raw(row,"fechavencimientosecuencia","fecha_vencimiento_secuencia");
  const vencim    = vencimRaw ? fmtFecha(vencimRaw) : "";
  const tipoPagoRaw = raw(row,"tipopago","tipo_pago");
  const tipoPago  = tipoPagoRaw || (tipoPagoReq ? "1" : "");
  const tipoIngr  = raw(row,"tipoingresos","tipo_ingresos");
  const indMonGr  = rawNum(row,"indicadormontogravado","indicador_monto_gravado");
  const indNotaC  = rawNum(row,"indicadornotacredito","indicador_nota_credito");
  const fechaLimP = fecha(row,"fechalimitepago","fecha_limite_pago");
  const termPago  = raw(row,"terminopago","termino_pago");

  const IdDoc: Record<string,unknown> = {
    TipoeCF: tipo,
    eNCF: encf,
    ...(tieneFechaVencim && vencim   ? { FechaVencimientoSecuencia: vencim } : {}),
    ...(tieneNotaCredito             ? { IndicadorNotaCredito: indNotaC || "0" } : {}),
    ...(indMonGr !== ""              ? { IndicadorMontoGravado: indMonGr } : {}),
    ...(tieneIngresos && tipoIngr    ? { TipoIngresos: tipoIngr } : {}),
    ...(tipoPago                     ? { TipoPago: tipoPago } : {}),
    ...(fechaLimP                    ? { FechaLimitePago: fechaLimP } : {}),
    ...(termPago                     ? { TerminoPago: termPago } : {}),
  };

  // ── Emisor ─────────────────────────────────────────────────────────────────
  const rncEm     = raw(row,"rncemisor","rnc_emisor").replace(/\D/g,"") || RNC_EMISOR;
  const razonEm   = raw(row,"razonsocialemisor","razon_social_emisor");
  const nomCom    = raw(row,"nombrecomercial","nombre_comercial");
  const dirEm     = raw(row,"direccionemisor","direccion_emisor");
  const muni      = raw(row,"municipio");
  const prov      = raw(row,"provincia");
  const telEm1    = raw(row,"telefonoemisor1","telefonoemisor");
  const correoEm  = raw(row,"correoemisor","correo_emisor");
  const webSite   = raw(row,"website","web_site");
  const actEcon   = raw(row,"actividadeconomica","actividad_economica");
  const codVend   = raw(row,"codigovendedor","codigo_vendedor");
  const noFactInt = raw(row,"numerofacturainterna","numero_factura_interna");
  const noPedido  = raw(row,"numeropedidointerno","numero_pedido_interno");
  const zonaVenta = raw(row,"zonaventa","zona_venta");
  const rutaVenta = raw(row,"rutaventa","ruta_venta");
  const infoEmis  = raw(row,"informacionadicionalemisor","informacion_adicional_emisor");
  const fechaEm   = fmtFecha(raw(row,"fechaemision","fecha_emision"));

  const Emisor: Record<string,unknown> = {
    RNCEmisor: rncEm,
    RazonSocialEmisor: razonEm,
    ...(nomCom    ? { NombreComercial: nomCom } : {}),
    ...(dirEm     ? { DireccionEmisor: dirEm } : {}),
    ...(muni      ? { Municipio: muni } : {}),
    ...(prov      ? { Provincia: prov } : {}),
    ...(telEm1    ? { TablaTelefonoEmisor: { TelefonoEmisor: telEm1 } } : {}),
    ...(correoEm  ? { CorreoEmisor: correoEm } : {}),
    ...(webSite   ? { WebSite: webSite } : {}),
    ...(actEcon   ? { ActividadEconomica: actEcon } : {}),
    ...(codVend   ? { CodigoVendedor: codVend } : {}),
    ...(noFactInt ? { NumeroFacturaInterna: noFactInt } : {}),
    ...(noPedido  ? { NumeroPedidoInterno: noPedido } : {}),
    ...(zonaVenta ? { ZonaVenta: zonaVenta } : {}),
    ...(rutaVenta ? { RutaVenta: rutaVenta } : {}),
    ...(infoEmis  ? { InformacionAdicionalEmisor: infoEmis } : {}),
    FechaEmision: fechaEm,
  };

  // ── Comprador ──────────────────────────────────────────────────────────────
  const rncComp       = raw(row,"rnccomprador","rnc_comprador").replace(/\D/g,"");
  const idExtran      = raw(row,"identificadorextranjero","identificador_extranjero");
  const razonComp     = raw(row,"razonsocialcomprador","razon_social_comprador");
  const contactoComp  = raw(row,"contactocomprador","contacto_comprador");
  const correoComp    = raw(row,"correocomprador","correo_comprador");
  const dirComp       = raw(row,"direccioncomprador","direccion_comprador");
  const muniComp      = raw(row,"municipiocomprador","municipio_comprador");
  const provComp      = raw(row,"provinciacomprador","provincia_comprador");
  const fechaEnt      = fecha(row,"fechaentrega","fecha_entrega");
  const contactoEnt   = raw(row,"contactoentrega","contacto_entrega");
  const dirEnt        = raw(row,"direccionentrega","direccion_entrega");
  const telAdi        = raw(row,"telefonoadicional","telefono_adicional");
  const fechaOC       = fecha(row,"fechaordencompra","fecha_orden_compra");
  const numOC         = raw(row,"numeroordencompra","numero_orden_compra");
  const codIntComp    = raw(row,"codigointernocomprador","codigo_interno_comprador");

  const Comprador: Record<string,unknown> = {
    ...(rncComp     ? { RNCComprador: rncComp }           : {}),
    ...(idExtran    ? { IdentificadorExtranjero: idExtran } : {}),
    ...(razonComp   ? { RazonSocialComprador: razonComp }  : {}),
    ...(contactoComp? { ContactoComprador: contactoComp }  : {}),
    ...(correoComp  ? { CorreoComprador: correoComp }      : {}),
    ...(dirComp     ? { DireccionComprador: dirComp }      : {}),
    ...(muniComp    ? { MunicipioComprador: muniComp }     : {}),
    ...(provComp    ? { ProvinciaComprador: provComp }     : {}),
    ...(fechaEnt    ? { FechaEntrega: fechaEnt }           : {}),
    ...(contactoEnt ? { ContactoEntrega: contactoEnt }     : {}),
    ...(dirEnt      ? { DireccionEntrega: dirEnt }         : {}),
    ...(telAdi      ? { TelefonoAdicional: telAdi }        : {}),
    ...(fechaOC     ? { FechaOrdenCompra: fechaOC }        : {}),
    ...(numOC       ? { NumeroOrdenCompra: numOC }         : {}),
    ...(codIntComp  ? { CodigoInternoComprador: codIntComp}: {}),
  };

  // ── Totales ────────────────────────────────────────────────────────────────
  const gravTot  = raw(row,"montogravadototal","monto_gravado_total");
  const gravI1   = raw(row,"montogravadoi1","monto_gravado_i1","montogravado_i1","monto_gravadoi1");
  const gravI2   = raw(row,"montogravadoi2","monto_gravado_i2","montogravado_i2","monto_gravadoi2");
  const gravI3   = raw(row,"montogravadoi3","monto_gravado_i3","montogravado_i3","monto_gravadoi3");
  const montoEx  = raw(row,"montoexento","monto_exento");
  const itbis1   = rawNum(row,"itbis1");
  const itbis2   = rawNum(row,"itbis2");
  const itbis3   = rawNum(row,"itbis3");
  const totItbis = raw(row,"totalitbis","total_itbis");
  const totItb1  = raw(row,"totalitbis1","total_itbis1");
  const totItb2  = raw(row,"totalitbis2","total_itbis2");
  const totItb3  = raw(row,"totalitbis3","total_itbis3");
  const montoTot = raw(row,"montototal","monto_total") || "0";
  const montoNF  = raw(row,"montonofacturable","monto_no_facturable");
  const montoPer = raw(row,"montoperiodo","monto_periodo");
  const saldoAnt = raw(row,"saldoanterior","saldo_anterior");
  const avancePag= raw(row,"montoavancepago","monto_avance_pago");
  const valorPag = raw(row,"valorpagar","valor_pagar");
  const itbisRet = raw(row,"totalitbisretenido","total_itbis_retenido");
  const isrRet   = raw(row,"totalisrretencion","total_isr_retencion");
  const montoImpAd = raw(row,"montoimpuestoadicional","monto_impuesto_adicional","montoimpuesto_adicional","monto_impuestoadicional");

  // ImpuestosAdicionales (E31 con ISC alcohol/tabaco etc.)
  // Columnas: tipoimpuesto{k}, tasaimpuestoadicional{k}, montoimpuestoselectivoconsumoespecifico{k},
  //           montoimpuestoselectivoconsumoadvalorem{k}, otrosimpuestosadicionales{k}
  const impAdicArr: Record<string,unknown>[] = [];
  for (let k = 1; k <= 4; k++) {
    const tipoImp = raw(row, `tipoimpuesto${k}`);
    if (!tipoImp) break;
    const tasa    = raw(row, `tasaimpuestoadicional${k}`);
    const espec   = raw(row, `montoimpuestoselectivoconsumoespecifico${k}`);
    const adval   = raw(row, `montoimpuestoselectivoconsumoadvalorem${k}`);
    const otros   = raw(row, `otrosimpuestosadicionales${k}`);
    const imp: Record<string,unknown> = { TipoImpuesto: tipoImp };
    if (tasa)  imp.TasaImpuestoAdicional = toInt(tasa);  // tasa es entero: 10, no 10.00
    if (espec) imp.MontoImpuestoSelectivoConsumoEspecifico = toNum(espec);
    if (adval) imp.MontoImpuestoSelectivoConsumoAdvalorem  = toNum(adval);
    if (otros) imp.OtrosImpuestosAdicionales               = toNum(otros);
    impAdicArr.push(imp);
  }

  let Totales: Record<string,unknown> = {};

  if (tipo === "43") {
    Totales = {
      ...(montoEx || montoTot ? { MontoExento: toNum(montoEx || montoTot) } : {}),
      ...(montoImpAd ? { MontoImpuestoAdicional: toNum(montoImpAd) } : {}),
      MontoTotal: toNum(montoTot),
    };
  } else if (tipo === "44") {
    Totales = {
      ...(montoEx  ? { MontoExento:   toNum(montoEx)  } : {}),
      MontoTotal: toNum(montoTot),
      ...(montoPer ? { MontoPeriodo:  toNum(montoPer) } : {}),
      ...(valorPag ? { ValorPagar:    toNum(valorPag) } : {}),
    };
  } else if (tipo === "46") {
    Totales = {
      ...(gravTot || gravI3 ? { MontoGravadoTotal: toNum(gravTot || gravI3) } : {}),
      ...(gravI1   ? { MontoGravadoI1:  toNum(gravI1)   } : {}),
      ...(gravI2   ? { MontoGravadoI2:  toNum(gravI2)   } : {}),
      ...(gravI3   ? { MontoGravadoI3:  toNum(gravI3)   } : {}),
      ...(montoEx  ? { MontoExento:     toNum(montoEx)  } : {}),
      ...(itbis1 !== "" ? { ITBIS1: toInt(itbis1) } : {}),
      ...(itbis2 !== "" ? { ITBIS2: toInt(itbis2) } : {}),
      ...(itbis3 !== "" ? { ITBIS3: toInt(itbis3) } : {}),
      ...(totItbis ? { TotalITBIS:   toNum(totItbis) } : {}),
      ...(totItb1  ? { TotalITBIS1:  toNum(totItb1)  } : {}),
      ...(totItb2  ? { TotalITBIS2:  toNum(totItb2)  } : {}),
      ...(totItb3  ? { TotalITBIS3:  toNum(totItb3)  } : {}),
      ...(impAdicArr.length > 0 ? { ImpuestosAdicionales: { ImpuestoAdicional: impAdicArr.length === 1 ? impAdicArr[0] : impAdicArr } } : {}),
      MontoTotal: toNum(montoTot),
      ...(montoPer ? { MontoPeriodo:  toNum(montoPer) } : {}),
      ...(valorPag ? { ValorPagar:    toNum(valorPag) } : {}),
    };
  } else if (tipo === "47") {
    Totales = {
      ...(montoEx || montoTot ? { MontoExento: toNum(montoEx || montoTot) } : {}),
      MontoTotal: toNum(montoTot),
      ...(montoPer ? { MontoPeriodo:     toNum(montoPer) } : {}),
      ...(valorPag ? { ValorPagar:       toNum(valorPag) } : {}),
      ...(isrRet   ? { TotalISRRetencion: toNum(isrRet)  } : {}),
    };
  } else {
    // E31, E32, E33, E34, E41, E45 — bloque genérico
    Totales = {
      ...(gravTot  ? { MontoGravadoTotal: toNum(gravTot)  } : {}),
      ...(gravI1   ? { MontoGravadoI1:    toNum(gravI1)   } : {}),
      ...(gravI2   ? { MontoGravadoI2:    toNum(gravI2)   } : {}),
      ...(gravI3   ? { MontoGravadoI3:    toNum(gravI3)   } : {}),
      ...(montoEx  ? { MontoExento:       toNum(montoEx)  } : {}),
      ...(itbis1 !== "" ? { ITBIS1: toInt(itbis1) } : {}),
      ...(itbis2 !== "" ? { ITBIS2: toInt(itbis2) } : {}),
      ...(itbis3 !== "" ? { ITBIS3: toInt(itbis3) } : {}),
      ...(totItbis ? { TotalITBIS:   toNum(totItbis) } : {}),
      ...(totItb1  ? { TotalITBIS1:  toNum(totItb1)  } : {}),
      ...(totItb2  ? { TotalITBIS2:  toNum(totItb2)  } : {}),
      ...(totItb3  ? { TotalITBIS3:  toNum(totItb3)  } : {}),
      ...(montoImpAd ? { MontoImpuestoAdicional: toNum(montoImpAd) } : {}),
      ...(impAdicArr.length > 0 ? { ImpuestosAdicionales: { ImpuestoAdicional: impAdicArr.length === 1 ? impAdicArr[0] : impAdicArr } } : {}),
      MontoTotal: toNum(montoTot),
      ...(montoNF  ? { MontoNoFacturable: toNum(montoNF)  } : {}),
      ...(montoPer ? { MontoPeriodo:      toNum(montoPer) } : {}),
      ...(saldoAnt ? { SaldoAnterior:     toNum(saldoAnt) } : {}),
      ...(avancePag? { MontoAvancePago:   toNum(avancePag)} : {}),
      ...(valorPag ? { ValorPagar:        toNum(valorPag) } : {}),
      ...(itbisRet ? { TotalITBISRetenido: toNum(itbisRet)} : {}),
      ...(isrRet   ? { TotalISRRetencion:  toNum(isrRet)  } : {}),
    };
  }

  // ── TablaDescuentoRecargo global (descuentos/recargos que afectan totales) ─
  const ajustesGlobales: Record<string,unknown>[] = [];
  for (let n = 1; n <= 5; n++) {
    const descAj = raw(row, `descripciondescuentoorecargo${n}`);
    if (!descAj) break;
    const tipoAj = raw(row, `tipoajuste${n}`);
    const tipVal = raw(row, `tipovalor${n}`);
    const valAj  = raw(row, `valordescuentoorecargo${n}`);
    const monAj  = raw(row, `montodescuentoorecargo${n}`);
    const indFac = raw(row, `indicadorfacturaciondescuentoorecargo${n}`);
    const linAj  = raw(row, `numerolineador${n}`) || String(n);
    const aj: Record<string,unknown> = { NumeroLinea: toNum(linAj) ?? n };
    if (tipoAj) aj.TipoAjuste                          = tipoAj;
    if (descAj) aj.DescripcionDescuentooRecargo             = descAj;
    if (tipVal) aj.TipoValor                               = tipVal;
    if (valAj)  aj.ValorDescuentooRecargo                  = toNum(valAj);
    if (monAj)  aj.MontoDescuentooRecargo                  = toNum(monAj);
    if (indFac) aj.IndicadorFacturacionDescuentoRecargo = indFac;
    ajustesGlobales.push(aj);
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  const itemsList: Record<string,unknown>[] = [];

  for (let i = 1; i <= 62; i++) {
    const nom = raw(row, `nombreitem${i}`);
    if (!nom) break;

    // Código de producto por item (tipocodigo{i}1, codigoitem{i}1)
    const tipoCod = raw(row, `tipocodigo${i}1`);
    const codItem = raw(row, `codigoitem${i}1`);

    const indFact = rawNum(row, `indicadorfacturacion${i}`) || "1";
    const retITBI = raw(row, `montoitbisretenido${i}`);
    const retISR  = raw(row, `montoisrretenido${i}`);
    const indAgen = rawNum(row, `indicadoragenteretencionopercepcion${i}`);
    const indBS   = rawNum(row, `indicadorbienoservicio${i}`) || "2";
    const descItem= raw(row, `descripcionitem${i}`);
    const cant    = raw(row, `cantidaditem${i}`) || "1";
    const unidMed = raw(row, `unidadmedida${i}`);
    const cantRef = raw(row, `cantidadreferencia${i}`);
    const unidRef = raw(row, `unidadreferencia${i}`);
    const gradAlc = raw(row, `gradosalcohol${i}`);
    const precRef = raw(row, `preciounitarioreferencia${i}`);
    const fechaElab  = fecha(row, `fechaelaboracion${i}`);
    const fechaVencI = fecha(row, `fechavencimientoitem${i}`);
    const precio  = raw(row, `preciounitarioitem${i}`) || "0";
    const descMonto = raw(row, `descuentomonto${i}`, `montodescuento${i}`, `monto_descuento${i}`);
    // TablaSubDescuento: columnas son tiposubdescuento{item}{sub} e.g. tiposubdescuento11, tiposubdescuento12...
    // Construir array de hasta 5 sub-descuentos
    const subDescs: Array<{tipo:string; pct?:string; mon?:string}> = [];
    for (let j = 1; j <= 5; j++) {
      const tipoJ = raw(row, `tiposubdescuento${i}${j}`);
      if (!tipoJ) break;
      const pctJ  = raw(row, `subdescuentoporcentaje${i}${j}`);
      const monJ  = raw(row, `montosubdescuento${i}${j}`);
      subDescs.push({ tipo: tipoJ, pct: pctJ || undefined, mon: monJ || undefined });
    }
    const tipoSD = subDescs.length > 0 ? subDescs[0].tipo : "";
    const recMon  = raw(row, `recargomonto${i}`);
    const mItem   = raw(row, `montoitem${i}`) || "0";
    const itbItem = raw(row, `liquidacion${i}1`) || raw(row, `subtotaitbis${i}`);

    const item: Record<string,unknown> = {
      NumeroLinea: i,
      ...(tipoCod && codItem ? { TablaCodigosItem: { CodigoItem: { TipoCodigo: tipoCod, Codigo: codItem } } } : {}),
      IndicadorFacturacion: indFact,
    };

    // Retención E41/E47
    if (retITBI || retISR || (indAgen && ["41","47"].includes(tipo))) {
      const ret: Record<string,unknown> = {};
      if (indAgen) ret.IndicadorAgenteRetencionoPercepcion = indAgen;
      if (retITBI) ret.MontoITBISRetenido = toNum(retITBI);
      if (retISR)  ret.MontoISRRetenido   = toNum(retISR);
      item.Retencion = ret;
    }

    item.NombreItem            = nom.substring(0, 80);
    item.IndicadorBienoServicio= indBS;
    if (descItem) item.DescripcionItem = descItem;
    item.CantidadItem = cant;
    if (unidMed) item.UnidadMedida = unidMed;
    if (cantRef) item.CantidadReferencia = cantRef;
    if (unidRef) item.UnidadReferencia   = unidRef;
    if (gradAlc) item.GradosAlcohol      = gradAlc;
    if (precRef) item.PrecioUnitarioReferencia = precRef;
    if (fechaElab)  item.FechaElaboracion     = fechaElab;
    if (fechaVencI) item.FechaVencimientoItem = fechaVencI;
    item.PrecioUnitarioItem = precio;

    // Descuento: usar DescuentoMonto cuando existe (DGII prefiere este campo)
    // TablaSubDescuento solo si no hay descuentomonto y hay subdescuentos de porcentaje
    if (descMonto) {
      item.DescuentoMonto = toNum(descMonto);
    }

    if (recMon) item.RecargoMonto = toNum(recMon);
    item.MontoItem = toNum(mItem);
    if (itbItem) item.ITBIS = toNum(itbItem);

    itemsList.push(item);
  }

  // Fallback si el Excel no tiene ítems detallados
  if (itemsList.length === 0) {
    const mBase = toNum(gravI1 || gravTot || montoTot || "0") ?? 0;
    itemsList.push({
      NumeroLinea: 1,
      IndicadorFacturacion: "1",
      NombreItem: "Servicio",
      IndicadorBienoServicio: "2",
      CantidadItem: 1,
      PrecioUnitarioItem: mBase,
      MontoItem: mBase,
    });
  }

  // ── InformacionReferencia (E33, E34) ───────────────────────────────────────
  const ncfMod   = raw(row,"ncfmodificado","ncf_modificado");
  const fechaMod = fecha(row,"fechancfmodificado","fecha_ncf_modificado");
  const codMod   = raw(row,"codigomodificacion","codigo_modificacion") || "2";
  const razMod   = raw(row,"razonmodificacion","razon_modificacion");

  // ── FechaHoraFirma ─────────────────────────────────────────────────────────
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2,"0");
  const FechaHoraFirma =
    `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // ── Ensamblar JSON final ───────────────────────────────────────────────────
  const json: Record<string,unknown> = {
    ECF: {
      Encabezado: {
        Version: "1.0",
        IdDoc,
        Emisor,
        ...(Object.keys(Comprador).length > 0 ? { Comprador } : {}),
        Totales,
        ...(ajustesGlobales.length > 0 ? {
          DescuentosORecargos: {
            DescuentoORecargo: ajustesGlobales.length === 1 ? ajustesGlobales[0] : ajustesGlobales
          }
        } : {}),
      },
      DetallesItems: {
        Item: itemsList.length === 1 ? itemsList[0] : itemsList,
      },
      ...((["33","34"].includes(tipo) && ncfMod) ? {
        InformacionReferencia: {
          NCFModificado: ncfMod,
          FechaNCFModificado: fechaMod || fmtFecha(raw(row,"fechaemision","fecha_emision")),
          CodigoModificacion: codMod,
          ...(razMod ? { RazonModificacion: razMod } : {}),
        }
      } : {}),
      FechaHoraFirma,
    },
  };

  return json;
}

// ── POST Handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ok = await verificarSesion(req);
    if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { encf, token: tokenExterno } = await req.json();
    if (!encf) return NextResponse.json({ error: "encf requerido" }, { status: 400 });

    // Leer fila del Excel
    const rows = await getAllRowsFromStorage() as Record<string,unknown>[];
    const row  = rows.find(r => {
      const v = String(r["encf"] ?? r["eNCF"] ?? r["e-NCF"] ?? "").trim().toUpperCase();
      return v === encf.toUpperCase();
    });
    if (!row) return NextResponse.json({ error: `eNCF no encontrado: ${encf}` }, { status: 404 });

    // Certificado y clases de la librería
    const certs     = getCerts();
    const ecfClient = new ECF(certs, getEnv());
    const signature = new Signature(certs.key, certs.cert);

    // Autenticar (o usar token de Firestore ya guardado)
    if (!tokenExterno) {
      // Intentar token de Firestore primero
      try {
        const { adminDb } = await import("@/lib/firebase-admin");
        const snap = await adminDb.collection("config").doc("dgii_token").get();
        if (snap.exists) {
          const data = snap.data() as { token: string; expira: string };
          const expira = new Date(data.expira);
          if (expira.getTime() - Date.now() > 5 * 60 * 1000) {
            // Token válido — inyectarlo en la librería
            const { setAuthToken } = await import("dgii-ecf");
            setAuthToken(data.token);
          } else {
            await ecfClient.authenticate();
          }
        } else {
          await ecfClient.authenticate();
        }
      } catch {
        await ecfClient.authenticate();
      }
    }

    const fileName = `${RNC_EMISOR}${encf}.xml`;
    const esRFCE   = ENCFS_RFCE.has(encf.toUpperCase());

    if (esRFCE) {
      // ── RFCE: E32 < RD$250k ───────────────────────────────────────────────
      // Construimos el RFCE directamente desde el Excel — NO usamos convertECF32ToRFCE
      // porque ese helper re-parsea el XML firmado y pierde el formato decimal
      const ecfJson = buildJsonECF(row, encf);
      const enc     = ecfJson.ECF as Record<string,unknown>;
      const encab   = enc.Encabezado as Record<string,unknown>;
      const idDoc   = encab.IdDoc   as Record<string,unknown>;
      const emisor  = encab.Emisor  as Record<string,unknown>;
      const comprad = encab.Comprador as Record<string,unknown> | undefined;
      const totales = encab.Totales as Record<string,unknown>;

      // Primero firmamos el ECF para obtener el CodigoSeguridadeCF
      const { Transformer } = await import("dgii-ecf");
      const transformer     = new Transformer();
      const ecfXml          = transformer.json2xml(ecfJson);
      const signedEcf       = signature.signXml(ecfXml, "ECF");

      // Extraer CodigoSeguridadeCF (primeros 6 chars del SHA256 del SignatureValue)
      const { getCodeSixDigitfromSignature } = await import("dgii-ecf");
      const codigoSeguridad = getCodeSixDigitfromSignature(signedEcf);
      if (!codigoSeguridad) throw new Error("No se pudo obtener CodigoSeguridadeCF");

      // Construir RFCE con valores ya formateados (strings "34000.00")
      const rfceIdDoc: Record<string,unknown> = {
        TipoeCF: idDoc.TipoeCF,
        eNCF:    idDoc.eNCF,
        ...(idDoc.TipoIngresos ? { TipoIngresos: idDoc.TipoIngresos } : {}),
        ...(idDoc.TipoPago     ? { TipoPago:     idDoc.TipoPago     } : {}),
      };

      const rfceTotales: Record<string,unknown> = {};
      const numFields = ["MontoGravadoTotal","MontoGravadoI1","MontoGravadoI2","MontoGravadoI3",
        "MontoExento","TotalITBIS","TotalITBIS1","TotalITBIS2","TotalITBIS3",
        "MontoImpuestoAdicional","MontoTotal","MontoNoFacturable","MontoPeriodo"];
      for (const f of numFields) {
        if (totales[f] !== undefined && totales[f] !== null) rfceTotales[f] = totales[f];
      }

      const rfceJson = {
        RFCE: {
          Encabezado: {
            Version: "1.0",
            IdDoc: rfceIdDoc,
            Emisor: {
              RNCEmisor: emisor.RNCEmisor,
              RazonSocialEmisor: emisor.RazonSocialEmisor,
              FechaEmision: emisor.FechaEmision,
            },
            ...(comprad && Object.keys(comprad).length > 0 ? { Comprador: {
              ...(comprad.RNCComprador ? { RNCComprador: comprad.RNCComprador } : {}),
              ...(comprad.IdentificadorExtranjero ? { IdentificadorExtranjero: comprad.IdentificadorExtranjero } : {}),
              ...(comprad.RazonSocialComprador ? { RazonSocialComprador: comprad.RazonSocialComprador } : {}),
            }} : {}),
            Totales: rfceTotales,
            CodigoSeguridadeCF: codigoSeguridad,
          },
        },
      };

      const rfceXml    = transformer.json2xml(rfceJson);
      const signedRFCE = signature.signXml(rfceXml, "RFCE");

      // Debug
      try {
        const fs2 = await import("fs"); const p = await import("path");
        fs2.mkdirSync("/tmp/ecf-debug", { recursive: true });
        fs2.writeFileSync(p.join("/tmp/ecf-debug", `${encf}_ecf_signed.xml`),  signedEcf);
        fs2.writeFileSync(p.join("/tmp/ecf-debug", `${encf}_rfce_signed.xml`), signedRFCE);
      } catch { /* no critical */ }

      const resultado = await ecfClient.sendSummary(signedRFCE, fileName);
      console.log(`[cert/enviar] RFCE ${encf}:`, JSON.stringify(resultado));
      return NextResponse.json({ success: true, encf, resultado });

    } else {
      // ── ECF normal ────────────────────────────────────────────────────────
      const json = buildJsonECF(row, encf);
      const { Transformer } = await import("dgii-ecf");
      const transformer     = new Transformer();
      const xml             = transformer.json2xml(json);
      const signedXml       = signature.signXml(xml, "ECF");

      // Debug opcional
      try {
        const fs2 = await import("fs"); const p = await import("path");
        fs2.mkdirSync("/tmp/ecf-debug", { recursive: true });
        fs2.writeFileSync(p.join("/tmp/ecf-debug", `${encf}_signed.xml`), signedXml);
      } catch { /* no critical */ }

      const resultado = await ecfClient.sendElectronicDocument(signedXml, fileName);

      console.log(`[cert/enviar] ECF ${encf}:`, JSON.stringify(resultado));
      return NextResponse.json({ success: true, encf, resultado });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/enviar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}