// API Route — Envía un caso del set de pruebas DGII (Paso 2 Certificación)
// Lee los datos EXACTOS del Excel subido por el usuario (Firebase Storage)
// y construye el XML con los valores campo a campo que DGII espera.
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

// '#e' = campo vacío en el Excel de DGII — tratarlo como null
const EMPTY_VALS = new Set(["#e", "#E", "", "0", "null", "undefined"]);

function campo(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && !EMPTY_VALS.has(String(v).trim())) return v;
    // variante sin guiones
    const alt = k.replace(/_/g, "");
    const v2 = row[alt];
    if (v2 !== undefined && v2 !== null && !EMPTY_VALS.has(String(v2).trim())) return v2;
  }
  return undefined;
}
// campo sin filtrar cero (para montos que pueden ser 0 legítimamente)
function campoNum(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "#e") return Number(v);
    const alt = k.replace(/_/g, "");
    const v2 = row[alt];
    if (v2 !== undefined && v2 !== null && String(v2).trim() !== "" && String(v2).trim() !== "#e") return Number(v2);
  }
  return undefined;
}

const s   = (r: Record<string, unknown>, ...k: string[]) => String(campo(r, ...k) ?? "").trim();
const n   = (r: Record<string, unknown>, ...k: string[]) => { const v = campoNum(r, ...k); return v ?? 0; };
const has = (r: Record<string, unknown>, ...k: string[]) => campoNum(r, ...k) !== undefined;

const esc = (str: string) =>
  str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
     .replace(/"/g,"&quot;").replace(/'/g,"&apos;");

const fmt = (num: number) => isNaN(num) ? "0.00" : num.toFixed(2);

// Facturas de consumo que van como RFCE (< RD$250k)
const ENCFS_RFCE = new Set([
  "E320000000011","E320000000013","E320000000014","E320000000015",
]);

// ── Fecha: cualquier formato → DD-MM-YYYY ─────────────────────────────────────
function fmtFecha(f: string): string {
  if (!f || f === "#e") return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(f)) return f;          // ya DD-MM-YYYY
  const [a, b, c] = f.split(/[-\/]/);
  if (a && b && c) {
    if (a.length === 4) return `${c.padStart(2,"0")}-${b.padStart(2,"0")}-${a}`; // YYYY-MM-DD
    return `${a.padStart(2,"0")}-${b.padStart(2,"0")}-${c}`;                      // DD-MM-YYYY
  }
  return f;
}

// ── Buscar fila en el Excel por eNCF ─────────────────────────────────────────
function buscarFila(rows: Record<string,unknown>[], encf: string): Record<string,unknown> | null {
  const target = encf.toUpperCase().replace(/\s/g,"");
  for (const row of rows) {
    const v = String(row["encf"] ?? "").trim().toUpperCase().replace(/\s/g,"");
    if (v === target) return row;
  }
  return null;
}

// ── Tipo de ECF desde el número (E410 → "41") ─────────────────────────────────
function tipoECF(encf: string, rowTipo: string): string {
  if (rowTipo) {
    const t = rowTipo.replace(/[^0-9]/g,"");
    if (t.length >= 2) return t.substring(0,2);
  }
  const m = encf.match(/^E(\d{2})/i);
  return m ? m[1] : "32";
}

// ── Construir XML completo desde datos del Excel ──────────────────────────────
function buildXML(row: Record<string,unknown>, encf: string): string {
  const tipo = tipoECF(encf, s(row,"tipoecf","tipo_ecf"));

  // ── Emisor ────────────────────────────────────────────────────────────────
  const rncEm     = s(row,"rncemisor","rnc_emisor").replace(/\D/g,"");
  const razonEm   = esc(s(row,"razonsocialemisor","razon_social_emisor"));
  const nomCom    = esc(s(row,"nombrecomercial","nombre_comercial"));
  const dirEm     = esc(s(row,"direccionemisor","direccion_emisor"));
  const muni      = s(row,"municipio");
  const prov      = s(row,"provincia");
  const correoEm  = esc(s(row,"correoemisor","correo_emisor"));
  const telEm1    = s(row,"telefonoemisor1","telefono_emisor1","telefonoemisor");
  const actEcon   = esc(s(row,"actividadeconomica","actividad_economica"));
  // En certecf, algunos casos tienen ActividadEconomica vacía según el Excel
  const fechaEm   = fmtFecha(s(row,"fechaemision","fecha_emision"));
  const vencimRaw = s(row,"fechavencimientosecuencia","fecha_vencimiento_secuencia");
  const vencim    = vencimRaw ? fmtFecha(vencimRaw) : "";  // empty = no incluir el campo
  const tipoPago  = s(row,"tipopago","tipo_pago") || "1";
  const tipoIngr  = s(row,"tipoingresos","tipo_ingresos") || "01";

  // Orden XSD: RNC→Razon→NomCom→Dir→Municipio→Provincia→Telefono→Correo→Actividad→FechaEmision
  const emisorXml = `<Emisor>
    <RNCEmisor>${rncEm || "131217656"}</RNCEmisor>
    <RazonSocialEmisor>${razonEm}</RazonSocialEmisor>
    ${nomCom   ? `<NombreComercial>${nomCom}</NombreComercial>` : ""}
    ${dirEm    ? `<DireccionEmisor>${dirEm}</DireccionEmisor>` : ""}
    ${muni     ? `<Municipio>${muni}</Municipio>` : ""}
    ${prov     ? `<Provincia>${prov}</Provincia>` : ""}
    ${telEm1   ? `<TablaTelefonoEmisor><TelefonoEmisor>${telEm1}</TelefonoEmisor></TablaTelefonoEmisor>` : ""}
    ${correoEm ? `<CorreoEmisor>${correoEm}</CorreoEmisor>` : ""}
    ${actEcon  ? `<ActividadEconomica>${actEcon}</ActividadEconomica>` : ""}
    <FechaEmision>${fechaEm}</FechaEmision>
  </Emisor>`;

  // ── Comprador ─────────────────────────────────────────────────────────────
  const rncComp    = s(row,"rnccomprador","rnc_comprador").replace(/\D/g,"");
  const razonComp  = esc(s(row,"razonsocialcomprador","razon_social_comprador"));
  const dirComp    = esc(s(row,"direccioncomprador","direccion_comprador"));
  const idExt      = esc(s(row,"identificadorextranjero","identificador_extranjero"));

  let compradorXml = "";
  if (idExt && (tipo === "47" || (tipo === "46" && !rncComp))) {
    // Extranjero con identificador
    compradorXml = `<Comprador>
    <IdentificadorExtranjero>${idExt}</IdentificadorExtranjero>
    <RazonSocialComprador>${razonComp || "BENEFICIARIO EXTERIOR"}</RazonSocialComprador>
  </Comprador>`;
  } else if (rncComp) {
    // B2B con RNC
    compradorXml = `<Comprador>
    <RNCComprador>${rncComp}</RNCComprador>
    <RazonSocialComprador>${razonComp}</RazonSocialComprador>
    ${dirComp ? `<DireccionComprador>${dirComp}</DireccionComprador>` : ""}
  </Comprador>`;
  } else if (tipo === "47") {
    // Exterior sin identificador → solo razón social
    compradorXml = `<Comprador>
    <RazonSocialComprador>${razonComp || "BENEFICIARIO EXTERIOR"}</RazonSocialComprador>
  </Comprador>`;
  } else if (razonComp && !["43"].includes(tipo)) {
    // Solo nombre (consumidor final, E32, etc.)
    compradorXml = `<Comprador>
    <RazonSocialComprador>${razonComp}</RazonSocialComprador>
  </Comprador>`;
  }

  // ── Totales desde columnas exactas del Excel ───────────────────────────────
  const gravI1   = campoNum(row,"montogravadoi1","monto_gravado_i1");
  const gravI2   = campoNum(row,"montogravadoi2","monto_gravado_i2");
  const gravI3   = campoNum(row,"montogravadoi3","monto_gravado_i3");
  const gravTot  = campoNum(row,"montogravadototal","monto_gravado_total");
  const exento   = campoNum(row,"montoexento","monto_exento");
  const itbis1   = campoNum(row,"itbis1");
  const itbis2   = campoNum(row,"itbis2");
  const itbis3   = campoNum(row,"itbis3");
  const totItb1  = campoNum(row,"totalitbis1","total_itbis1");
  const totItb2  = campoNum(row,"totalitbis2","total_itbis2");
  const totItb3  = campoNum(row,"totalitbis3","total_itbis3");
  const totItbis = campoNum(row,"totalitbis","total_itbis");
  const montoTot = n(row,"montototal","monto_total");
  const itbisRet = campoNum(row,"totalitbisretenido","total_itbis_retenido");
  const isrRet   = campoNum(row,"totalisrretencion","total_isr_retencion");
  const indMonto = s(row,"indicadormontogravado","indicador_monto_gravado");
  const montoNoFact = campoNum(row,"montonofacturable","monto_no_facturable");

  let totalesXml = "";
  if (tipo === "43") {
    totalesXml = `<Totales>
    <MontoExento>${fmt(exento ?? montoTot)}</MontoExento>
    <MontoTotal>${fmt(montoTot)}</MontoTotal>
  </Totales>`;
  } else if (tipo === "44" || tipo === "46") {
    totalesXml = `<Totales>
    ${exento !== undefined ? `<MontoExento>${fmt(exento)}</MontoExento>` : ""}
    <MontoTotal>${fmt(montoTot)}</MontoTotal>
  </Totales>`;
  } else if (tipo === "47") {
    totalesXml = `<Totales>
    ${exento !== undefined ? `<MontoExento>${fmt(exento)}</MontoExento>` : ""}
    <MontoTotal>${fmt(montoTot)}</MontoTotal>
    ${isrRet !== undefined ? `<TotalISRRetencion>${fmt(isrRet)}</TotalISRRetencion>` : ""}
  </Totales>`;
  } else {
    // E31, E32, E33, E34, E41, E45 — con gravados e ITBIS
    totalesXml = `<Totales>
    ${gravTot   !== undefined ? `<MontoGravadoTotal>${fmt(gravTot)}</MontoGravadoTotal>` : ""}
    ${gravI1    !== undefined ? `<MontoGravadoI1>${fmt(gravI1)}</MontoGravadoI1>` : ""}
    ${gravI2    !== undefined ? `<MontoGravadoI2>${fmt(gravI2)}</MontoGravadoI2>` : ""}
    ${gravI3    !== undefined ? `<MontoGravadoI3>${fmt(gravI3)}</MontoGravadoI3>` : ""}
    ${exento    !== undefined ? `<MontoExento>${fmt(exento)}</MontoExento>` : ""}
    ${itbis1    !== undefined ? `<ITBIS1>${fmt(itbis1)}</ITBIS1>` : ""}
    ${itbis2    !== undefined ? `<ITBIS2>${fmt(itbis2)}</ITBIS2>` : ""}
    ${itbis3    !== undefined ? `<ITBIS3>${fmt(itbis3)}</ITBIS3>` : ""}
    ${totItbis  !== undefined ? `<TotalITBIS>${fmt(totItbis)}</TotalITBIS>` : ""}
    ${totItb1   !== undefined ? `<TotalITBIS1>${fmt(totItb1)}</TotalITBIS1>` : ""}
    ${totItb2   !== undefined ? `<TotalITBIS2>${fmt(totItb2)}</TotalITBIS2>` : ""}
    ${totItb3   !== undefined ? `<TotalITBIS3>${fmt(totItb3)}</TotalITBIS3>` : ""}
    <MontoTotal>${fmt(montoTot)}</MontoTotal>
    ${montoNoFact !== undefined ? `<MontoNoFacturable>${fmt(montoNoFact)}</MontoNoFacturable>` : ""}
    ${itbisRet  !== undefined ? `<TotalITBISRetenido>${fmt(itbisRet)}</TotalITBISRetenido>` : ""}
    ${isrRet    !== undefined ? `<TotalISRRetencion>${fmt(isrRet)}</TotalISRRetencion>` : ""}
  </Totales>`;
  }

  // ── Items (columnas nombreitem1, cantidaditem1, preciounitarioitem1, etc.) ──
  // El Excel de DGII numera los ítems: nombreitem1, nombreitem2…
  // Para la certificación, cada factura tiene solo 1 ítem
  const items: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const nom = s(row, `nombreitem${i}`);
    if (!nom) break;
    const cant    = n(row, `cantidaditem${i}`);
    const precio  = n(row, `preciounitarioitem${i}`);
    const mItem   = n(row, `montoitem${i}`);
    const indBS   = s(row, `indicadorbienoservicio${i}`) || "2";
    const indFact = s(row, `indicadorfacturacion${i}`) || "1";
    const itbItem = campoNum(row, `liquidacion${i}`, `subtotaitbis${i}`);
    const retITBI = campoNum(row, `montoitbisretenido${i}`);
    const retISR  = campoNum(row, `montoisrretenido${i}`);
    const indAgen = s(row, `indicadoragenteretencionopercepcion${i}`);

    // IndicadorFacturacion: del Excel (puede ser 0 = no facturable, 1 = normal)
    // UnidadMedida: del Excel (puede ser vacío para algunos tipos)
    const unidadM = s(row, `unidadmedida${i}`);

    let itemXml = `<Item>
      <NumeroLinea>${i}</NumeroLinea>
      <IndicadorFacturacion>${indFact}</IndicadorFacturacion>`;

    // Retención dentro del ítem (E41, E47)
    if ((tipo === "41" || tipo === "47") && (retITBI !== undefined || retISR !== undefined || indAgen)) {
      itemXml += `
      <Retencion>
        ${indAgen  ? `<IndicadorAgenteRetencionoPercepcion>${indAgen}</IndicadorAgenteRetencionoPercepcion>` : ""}
        ${retITBI !== undefined ? `<MontoITBISRetenido>${fmt(retITBI)}</MontoITBISRetenido>` : ""}
        ${retISR  !== undefined ? `<MontoISRRetenido>${fmt(retISR)}</MontoISRRetenido>` : ""}
      </Retencion>`;
    }

    itemXml += `
      <NombreItem>${esc(nom.substring(0,80))}</NombreItem>
      <IndicadorBienoServicio>${indBS}</IndicadorBienoServicio>
      <CantidadItem>${fmt(cant)}</CantidadItem>
      ${unidadM ? `<UnidadMedida>${unidadM}</UnidadMedida>` : ""}
      <PrecioUnitarioItem>${fmt(precio)}</PrecioUnitarioItem>
      <MontoItem>${fmt(mItem)}</MontoItem>`;

    if (itbItem !== undefined && itbItem > 0) {
      itemXml += `
      <ITBIS>${fmt(itbItem)}</ITBIS>`;
    } else if (
      !["44","46","47"].includes(tipo) &&
      gravI1 === undefined && gravTot === undefined
    ) {
      itemXml += `
      <BienOServExentoITBIS>E</BienOServExentoITBIS>`;
    }

    itemXml += `
    </Item>`;
    items.push(itemXml);
  }

  // Si el Excel no tiene ítems (no es un error, solo no aplica aquí)
  const itemsXml = items.length > 0 ? items.join("\n    ") : `<Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>Servicio</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>1.00</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(montoTot)}</PrecioUnitarioItem>
      <MontoItem>${fmt(montoTot)}</MontoItem>
    </Item>`;

  // ── IdDoc ──────────────────────────────────────────────────────────────────
  const tiposConIngresos = ["31","32","33","44","45","46"];
  const tiposConPago     = ["31","32","33","34","41","44","45","46","47"];
  // Reglas por tipo según XSD:
  // FechaVencimientoSecuencia: NO en E32, NO en E34
  // IndicadorNotaCredito: solo E34 (antes de IndicadorMontoGravado)
  // TipoIngresos: NO en E41, E43, E47
  const tieneFechaVencim   = !["32","34"].includes(tipo);
  const tieneNotaCredito   = tipo === "34";
  const tieneIngresos      = !["41","43","47"].includes(tipo);
  const indNotaCred        = s(row,"indicadornotacredito","indicador_nota_credito");

  const idDocXml = `<IdDoc>
    <TipoeCF>${tipo}</TipoeCF>
    <eNCF>${encf}</eNCF>
    ${tieneFechaVencim && vencim ? `<FechaVencimientoSecuencia>${vencim}</FechaVencimientoSecuencia>` : ""}
    ${tieneNotaCredito && indNotaCred ? `<IndicadorNotaCredito>${indNotaCred}</IndicadorNotaCredito>` : ""}
    ${indMonto     ? `<IndicadorMontoGravado>${indMonto}</IndicadorMontoGravado>` : ""}
    ${tieneIngresos ? `<TipoIngresos>${tipoIngr}</TipoIngresos>` : ""}
    ${tipoPago     ? `<TipoPago>${tipoPago}</TipoPago>` : ""}
  </IdDoc>`;

  // ── InformacionReferencia (E33, E34) ──────────────────────────────────────
  const ncfMod   = s(row,"ncfmodificado","ncf_modificado");
  const fechaMod = fmtFecha(s(row,"fechancfmodificado","fecha_ncf_modificado"));
  const codMod   = s(row,"codigomodificacion","codigo_modificacion") || "2";
  const razMod   = esc(s(row,"razonmodificacion","razon_modificacion") || "");

  const infoRef = (["33","34"].includes(tipo) && ncfMod)
    ? `<InformacionReferencia>
    <NCFModificado>${ncfMod}</NCFModificado>
    <FechaNCFModificado>${fechaMod || fechaEm}</FechaNCFModificado>
    <CodigoModificacion>${codMod}</CodigoModificacion>
    ${razMod ? `<RazonModificacion>${razMod}</RazonModificacion>` : ""}
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
    ${itemsXml}
  </DetallesItems>
  ${infoRef}
</ECF>`;
}

// ── RFCE — Resumen Factura Consumo < RD$250,000 ───────────────────────────────
function buildRFCE(row: Record<string,unknown>, encf: string): string {
  const tipo     = tipoECF(encf, s(row,"tipoecf","tipo_ecf"));
  const rncEm    = s(row,"rncemisor","rnc_emisor").replace(/\D/g,"");
  const razonEm  = esc(s(row,"razonsocialemisor","razon_social_emisor"));
  const fechaEm  = fmtFecha(s(row,"fechaemision","fecha_emision"));
  const vencim   = fmtFecha(s(row,"fechavencimientosecuencia","fecha_vencimiento_secuencia") || "2099-12-31");
  const tipoPago = s(row,"tipopago","tipo_pago") || "1";
  const tipoIngr = s(row,"tipoingresos","tipo_ingresos") || "01";
  const rncComp  = s(row,"rnccomprador","rnc_comprador").replace(/\D/g,"");
  const razonComp = esc(s(row,"razonsocialcomprador","razon_social_comprador"));
  const gravI1   = campoNum(row,"montogravadoi1","monto_gravado_i1");
  const gravI2   = campoNum(row,"montogravadoi2","monto_gravado_i2");
  const gravTot  = campoNum(row,"montogravadototal","monto_gravado_total");
  const exento   = campoNum(row,"montoexento","monto_exento");
  const totItbis = campoNum(row,"totalitbis","total_itbis");
  const totItb1  = campoNum(row,"totalitbis1","total_itbis1");
  const totItb2  = campoNum(row,"totalitbis2","total_itbis2");
  const montoTot = n(row,"montototal","monto_total");

  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${tipo}</TipoeCF>
      <eNCF>${encf}</eNCF>
      <FechaVencimientoSecuencia>${vencim}</FechaVencimientoSecuencia>
      <TipoIngresos>${tipoIngr}</TipoIngresos>
      <TipoPago>${tipoPago}</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${rncEm || "131217656"}</RNCEmisor>
      <RazonSocialEmisor>${razonEm}</RazonSocialEmisor>
      <FechaEmision>${fechaEm}</FechaEmision>
    </Emisor>
    <Comprador>
      ${rncComp  ? `<RNCComprador>${rncComp}</RNCComprador>` : ""}
      <RazonSocialComprador>${razonComp || "CONSUMIDOR FINAL"}</RazonSocialComprador>
    </Comprador>
    <Totales>
      ${gravTot  !== undefined ? `<MontoGravadoTotal>${fmt(gravTot)}</MontoGravadoTotal>` : ""}
      ${gravI1   !== undefined ? `<MontoGravadoI1>${fmt(gravI1)}</MontoGravadoI1>` : ""}
      ${gravI2   !== undefined ? `<MontoGravadoI2>${fmt(gravI2)}</MontoGravadoI2>` : ""}
      ${exento   !== undefined ? `<MontoExento>${fmt(exento)}</MontoExento>` : ""}
      ${totItbis !== undefined ? `<TotalITBIS>${fmt(totItbis)}</TotalITBIS>` : ""}
      ${totItb1  !== undefined ? `<TotalITBIS1>${fmt(totItb1)}</TotalITBIS1>` : ""}
      ${totItb2  !== undefined ? `<TotalITBIS2>${fmt(totItb2)}</TotalITBIS2>` : ""}
      <MontoTotal>${fmt(montoTot)}</MontoTotal>
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

    // Descargar Excel de Firebase Storage
    const rows = await getAllRowsFromStorage();
    if (rows.length === 0)
      return NextResponse.json({ error: "No hay Excel cargado. Sube el Excel del Paso 2 primero." }, { status: 404 });

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