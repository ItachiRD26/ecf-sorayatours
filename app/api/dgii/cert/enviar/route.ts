// API Route — Envía un caso del set de pruebas DGII (Paso 2 Certificación)
// Lee los datos EXACTOS del Excel subido por el usuario (Firebase Storage)
// y construye el XML con los valores que DGII espera campo a campo.
// POST /api/dgii/cert/enviar  { encf: "E410000000010" }

import { NextRequest, NextResponse }   from "next/server";
import { adminAuth }                    from "@/lib/firebase-admin";
import { firmarXML }                    from "@/lib/dgii/xml-signer";
import { enviarECF, enviarRFCE }        from "@/lib/dgii/dgii-client";
import { getAllRowsFromStorage }          from "@/app/api/dgii/cert/upload-set/route";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// ── Helpers para leer campos del Excel con múltiples nombres posibles ──────────
function campo(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const alt = k.replace(/_/g, "");
    if (row[alt] !== undefined && row[alt] !== null && row[alt] !== "") return row[alt];
  }
  return undefined;
}
const s  = (r: Record<string, unknown>, ...k: string[]) => String(campo(r, ...k) ?? "").trim();
const n  = (r: Record<string, unknown>, ...k: string[]) => Number(campo(r, ...k) ?? 0);
const b  = (r: Record<string, unknown>, ...k: string[]) => {
  const v = campo(r, ...k);
  return v !== undefined && v !== "" && v !== null && Number(v) !== 0;
};

const esc = (str: string) =>
  str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
     .replace(/"/g,"&quot;").replace(/'/g,"&apos;");

const fmt = (n: number) => isNaN(n) ? "0.00" : n.toFixed(2);

// eNCF E320000000011 → menores de 250k → necesitan RFCE
const ENCFS_RFCE = new Set([
  "E320000000011","E320000000013","E320000000014","E320000000015",
]);

// ── Encontrar la fila del Excel por eNCF ──────────────────────────────────────
function buscarFila(rows: Record<string,unknown>[], encf: string): Record<string,unknown> | null {
  const encfLimpio = encf.toUpperCase().trim();
  for (const row of rows) {
    const v = String(campo(row,
      "encf","e_ncf","ncf","eencf","numero_comprobante","no_comprobante","comprobante"
    ) ?? "").trim().toUpperCase().replace(/\s/g,"");
    if (v === encfLimpio || v.replace(/\s/g,"") === encfLimpio) return row;
  }
  return null;
}

// ── Detectar el tipo de ECF desde el eNCF (E31, E32, etc.) ───────────────────
function tipoDesde(encf: string, rowTipo?: string): string {
  if (rowTipo) {
    const t = rowTipo.replace(/[^0-9]/g,"");
    if (t.length >= 2) return t.substring(0,2);
  }
  const m = encf.match(/^E(\d{2})/i);
  return m ? m[1] : "32";
}

// ── Construcción del XML desde los datos exactos del Excel ────────────────────
function buildXMLDesdeExcel(row: Record<string,unknown>, encf: string): string {
  const tipo = tipoDesde(encf, s(row,"tipo_ecf","tipoecf","tipo","tipo_de_ecf"));

  // ── EMISOR (datos exactos del Excel de certecf) ───────────────────────────
  const rncEmisor    = s(row,"rnc_emisor","rncemisor","rnc").replace(/\D/g,"") || "131217656";
  const razonEmisor  = esc(s(row,"razon_social_emisor","razonsocialemisor","nombre_emisor") || "DOCUMENTOS ELECTRONICOS DE 02");
  const nomComercial = esc(s(row,"nombre_comercial","nombrecomercial") || razonEmisor);
  const dirEmisor    = esc(s(row,"direccion_emisor","direccionemisor","direccion"));
  const municipio    = s(row,"municipio") || "";
  const provincia    = s(row,"provincia") || "";
  const correoEm     = esc(s(row,"correo_emisor","correoemisor","correo","email"));
  const telefono     = s(row,"telefono_emisor","telefonoemissor","telefono") || "";
  const actEcon      = esc(s(row,"actividad_economica","actividadeconomica") || "Servicios de Turismo y Excursiones");
  const fechaEmision = s(row,"fecha_emision","fechaemision","fecha") || "";

  // Convertir fecha: soporta YYYY-MM-DD o DD-MM-YYYY
  let fmtFecha = (f: string) => {
    if (!f) return "";
    if (/^\d{2}-\d{2}-\d{4}$/.test(f)) return f;
    const [y,m,d] = f.split(/[-\/]/);
    if (y && m && d && y.length === 4) return `${d.padStart(2,"0")}-${m.padStart(2,"0")}-${y}`;
    return f;
  };

  const vencimiento = fmtFecha(s(row,"fecha_vencimiento_secuencia","fechavencimientosecuencia","vencimiento") || "2099-12-31");

  const emisorXml = `<Emisor>
    <RNCEmisor>${rncEmisor}</RNCEmisor>
    <RazonSocialEmisor>${razonEmisor}</RazonSocialEmisor>
    ${nomComercial && nomComercial !== razonEmisor ? `<NombreComercial>${nomComercial}</NombreComercial>` : ""}
    ${dirEmisor    ? `<DireccionEmisor>${dirEmisor}</DireccionEmisor>` : ""}
    ${telefono     ? `<TablaTelefonoEmisor><TelefonoEmisor>${telefono}</TelefonoEmisor></TablaTelefonoEmisor>` : ""}
    <ActividadEconomica>${actEcon}</ActividadEconomica>
    ${correoEm     ? `<CorreoEmisor>${correoEm}</CorreoEmisor>` : ""}
    ${municipio    ? `<Municipio>${municipio}</Municipio>` : ""}
    ${provincia    ? `<Provincia>${provincia}</Provincia>` : ""}
    <FechaEmision>${fmtFecha(fechaEmision)}</FechaEmision>
  </Emisor>`;

  // ── COMPRADOR ─────────────────────────────────────────────────────────────
  const rncComp    = s(row,"rnc_comprador","rnccomprador","rnc_del_comprador").replace(/\D/g,"");
  const razonComp  = esc(s(row,"razon_social_comprador","razonsocialcomprador","comprador","nombre_comprador"));
  const dirComp    = esc(s(row,"direccion_comprador","direccioncomprador"));
  const idExt      = esc(s(row,"identificador_extranjero","identificadorextranjero","id_extranjero"));

  let compradorXml = "";
  if (["47"].includes(tipo) || (tipo === "46" && idExt && !rncComp)) {
    compradorXml = `<Comprador>
    <IdentificadorExtranjero>${idExt || "0"}</IdentificadorExtranjero>
    <RazonSocialComprador>${razonComp || "BENEFICIARIO EXTERIOR"}</RazonSocialComprador>
  </Comprador>`;
  } else if (rncComp) {
    compradorXml = `<Comprador>
    <RNCComprador>${rncComp}</RNCComprador>
    <RazonSocialComprador>${razonComp || "COMPRADOR"}</RazonSocialComprador>
    ${dirComp ? `<DireccionComprador>${dirComp}</DireccionComprador>` : ""}
  </Comprador>`;
  } else if (["32","43"].includes(tipo) || (tipo === "46" && !rncComp && !idExt)) {
    compradorXml = `<Comprador>
    <RazonSocialComprador>${razonComp || "CONSUMIDOR FINAL"}</RazonSocialComprador>
  </Comprador>`;
  }

  // ── TOTALES desde las columnas exactas del Excel ──────────────────────────
  const montoGravI1   = n(row,"monto_gravado_i1","montogravadoi1");
  const montoGravI2   = n(row,"monto_gravado_i2","montogravadoi2");
  const montoGravTot  = n(row,"monto_gravado_total","montogravadototal") || (montoGravI1 + montoGravI2);
  const montoExento   = n(row,"monto_exento","montoexento");
  const tItbis1       = n(row,"itbis1","itbis_1","tasa_itbis1");   // 18
  const tItbis2       = n(row,"itbis2","itbis_2","tasa_itbis2");   // 16
  const totItbis1     = n(row,"total_itbis1","totalitbis1");
  const totItbis2     = n(row,"total_itbis2","totalitbis2");
  const totalITBIS    = n(row,"total_itbis","totalitbis");
  const montoTotal    = n(row,"monto_total","montototal","total");
  const itbisRet      = n(row,"total_itbis_retenido","totalitbisretenido","itbis_retenido");
  const isrRet        = n(row,"total_isr_retencion","totalisrretencion","isr_retencion");
  const indMontoGrav  = s(row,"indicador_monto_gravado","indicadormontogravado") || "0";
  const tipoPago      = s(row,"tipo_pago","tipopago") || "1";

  // Construir sección Totales según tipo
  let totalesXml = "";
  if (tipo === "43") {
    totalesXml = `<Totales>
    <MontoExento>${fmt(montoExento || montoTotal)}</MontoExento>
    <MontoTotal>${fmt(montoTotal)}</MontoTotal>
  </Totales>`;
  } else if (tipo === "44" || tipo === "46") {
    totalesXml = `<Totales>
    <MontoExento>${fmt(montoExento || montoTotal)}</MontoExento>
    <MontoTotal>${fmt(montoTotal)}</MontoTotal>
  </Totales>`;
  } else if (tipo === "47") {
    totalesXml = `<Totales>
    <MontoExento>${fmt(montoExento || montoTotal)}</MontoExento>
    <MontoTotal>${fmt(montoTotal)}</MontoTotal>
    ${isrRet > 0 ? `<TotalISRRetencion>${fmt(isrRet)}</TotalISRRetencion>` : ""}
  </Totales>`;
  } else {
    // E31, E32, E33, E34, E41, E45 — con montos gravados e ITBIS
    totalesXml = `<Totales>
    ${montoGravTot > 0 ? `<MontoGravadoTotal>${fmt(montoGravTot)}</MontoGravadoTotal>` : ""}
    ${montoGravI1  > 0 ? `<MontoGravadoI1>${fmt(montoGravI1)}</MontoGravadoI1>` : ""}
    ${montoGravI2  > 0 ? `<MontoGravadoI2>${fmt(montoGravI2)}</MontoGravadoI2>` : ""}
    ${montoExento  >= 0 ? `<MontoExento>${fmt(montoExento)}</MontoExento>` : ""}
    ${tItbis1      > 0 ? `<ITBIS1>${fmt(tItbis1)}</ITBIS1>` : ""}
    ${tItbis2      > 0 ? `<ITBIS2>${fmt(tItbis2)}</ITBIS2>` : ""}
    ${totalITBIS   > 0 ? `<TotalITBIS>${fmt(totalITBIS)}</TotalITBIS>` : ""}
    ${totItbis1    > 0 ? `<TotalITBIS1>${fmt(totItbis1)}</TotalITBIS1>` : ""}
    ${totItbis2    > 0 ? `<TotalITBIS2>${fmt(totItbis2)}</TotalITBIS2>` : ""}
    <MontoTotal>${fmt(montoTotal)}</MontoTotal>
    ${itbisRet     > 0 ? `<TotalITBISRetenido>${fmt(itbisRet)}</TotalITBISRetenido>` : ""}
    ${isrRet       > 0 ? `<TotalISRRetencion>${fmt(isrRet)}</TotalISRRetencion>` : ""}
    ${indMontoGrav  ? `<IndicadorMontoGravado>${indMontoGrav}</IndicadorMontoGravado>` : ""}
  </Totales>`;
  }

  // ── ITEMS desde el Excel ──────────────────────────────────────────────────
  const nombreItem = esc(s(row,"nombre_item","nombreitem","descripcion_item","item","descripcion","producto") || "Servicio");
  const cantItem   = n(row,"cantidad_item","cantidaditem","cantidad","qty") || 1;
  const precioUnit = n(row,"precio_unitario","preciounitario","precio_unit","precio") || 0;
  const indBS      = s(row,"indicador_bienoservicio","indicador_bieno_servicio","indicador_bs","tipo_bien") || "2";
  const montoItem  = montoGravI1 > 0 ? montoGravI1 : (montoExento > 0 ? montoExento : montoTotal);

  let itemBody = `<Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>`;

  // E41: retención ITBIS dentro del item
  if (tipo === "41" && (itbisRet > 0 || totalITBIS > 0)) {
    itemBody += `
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoITBISRetenido>${fmt(itbisRet || totalITBIS)}</MontoITBISRetenido>
        ${isrRet > 0 ? `<MontoISRRetenido>${fmt(isrRet)}</MontoISRRetenido>` : ""}
      </Retencion>`;
  }
  // E47: retención ISR dentro del item
  if (tipo === "47" && isrRet > 0) {
    itemBody += `
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoISRRetenido>${fmt(isrRet)}</MontoISRRetenido>
      </Retencion>`;
  }

  itemBody += `
      <NombreItem>${nombreItem.substring(0, 80)}</NombreItem>
      <IndicadorBienoServicio>${indBS}</IndicadorBienoServicio>
      <CantidadItem>${fmt(cantItem)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(precioUnit)}</PrecioUnitarioItem>
      <MontoItem>${fmt(montoItem)}</MontoItem>`;

  // ITBIS en el item (si hay)
  if (totalITBIS > 0 || totItbis1 > 0) {
    itemBody += `
      <ITBIS>${fmt(totItbis1 || totalITBIS)}</ITBIS>`;
  } else if (montoGravTot === 0 && tipo !== "41") {
    itemBody += `
      <BienOServExentoITBIS>E</BienOServExentoITBIS>`;
  }
  itemBody += `
    </Item>`;

  // ── IDDOC ─────────────────────────────────────────────────────────────────
  // TipoIngresos requerido para: 31, 32, 44, 45, 46 (y E33 opcional)
  const tiposConIngresos = ["31","32","33","44","45","46"];
  const tieneIngresos    = tiposConIngresos.includes(tipo);
  const tiposConPago     = ["31","32","33","34","41","44","45","46","47"];
  const tienePago        = tiposConPago.includes(tipo);

  const idDocXml = `<IdDoc>
    <TipoeCF>${tipo}</TipoeCF>
    <eNCF>${encf}</eNCF>
    <FechaVencimientoSecuencia>${vencimiento}</FechaVencimientoSecuencia>
    ${tieneIngresos ? `<TipoIngresos>01</TipoIngresos>` : ""}
    ${tienePago     ? `<TipoPago>${tipoPago || "1"}</TipoPago>` : ""}
  </IdDoc>`;

  // ── InformacionReferencia (E33, E34) ──────────────────────────────────────
  const ncfMod  = s(row,"ncf_modificado","ncfmodificado","ncf_mod");
  const fncfMod = fmtFecha(s(row,"fecha_ncf_modificado","fechancfmodificado","fecha_mod"));
  const codMod  = s(row,"codigo_modificacion","codigomodificacion","cod_modificacion") || "2";
  const razMod  = esc(s(row,"razon_modificacion","razonmodificacion","motivo_modificacion") || "");

  const infoRef = (["33","34"].includes(tipo) && ncfMod)
    ? `<InformacionReferencia>
    <NCFModificado>${ncfMod}</NCFModificado>
    <FechaNCFModificado>${fncfMod || fmtFecha(fechaEmision)}</FechaNCFModificado>
    <CodigoModificacion>${codMod}</CodigoModificacion>
    ${razMod ? `<RazonModificacion>${razMod}</RazonModificacion>` : ""}
  </InformacionReferencia>`
    : "";

  // ── ENSAMBLE FINAL ────────────────────────────────────────────────────────
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
    ${itemBody}
  </DetallesItems>
  ${infoRef}
</ECF>`;
}

// ── RFCE (Resumen Factura Consumo < 250k) ─────────────────────────────────────
function buildRFCEDesdeExcel(row: Record<string,unknown>, encf: string): string {
  const rncEm       = s(row,"rnc_emisor","rncemisor","rnc").replace(/\D/g,"") || "131217656";
  const razonEm     = esc(s(row,"razon_social_emisor","razonsocialemisor") || "");
  const tipoPago    = s(row,"tipo_pago","tipopago") || "1";
  const montoGravI1 = n(row,"monto_gravado_i1","montogravadoi1");
  const montoGravTot= n(row,"monto_gravado_total","montogravadototal") || montoGravI1;
  const montoExento = n(row,"monto_exento","montoexento");
  const tItbis1     = n(row,"itbis1","itbis_1","tasa_itbis1");
  const totalItbis  = n(row,"total_itbis","totalitbis");
  const montoTotal  = n(row,"monto_total","montototal","total");
  const vencimiento = s(row,"fecha_vencimiento_secuencia","fechavencimientosecuencia","vencimiento") || "2099-12-31";
  const fechaEm     = s(row,"fecha_emision","fechaemision","fecha") || "";

  const fmtF = (f: string) => {
    if (!f) return "";
    if (/^\d{2}-\d{2}-\d{4}$/.test(f)) return f;
    const [y,m,d] = f.split(/[-\/]/);
    if (y?.length === 4) return `${d?.padStart(2,"0")}-${m?.padStart(2,"0")}-${y}`;
    return f;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${encf}</eNCF>
      <FechaVencimientoSecuencia>${fmtF(vencimiento)}</FechaVencimientoSecuencia>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>${tipoPago}</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${rncEm}</RNCEmisor>
      <RazonSocialEmisor>${razonEm}</RazonSocialEmisor>
      <FechaEmision>${fmtF(fechaEm)}</FechaEmision>
    </Emisor>
    <Comprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      ${montoGravTot > 0 ? `<MontoGravadoTotal>${fmt(montoGravTot)}</MontoGravadoTotal>` : ""}
      ${montoGravI1  > 0 ? `<MontoGravadoI1>${fmt(montoGravI1)}</MontoGravadoI1>` : ""}
      ${montoExento  > 0 ? `<MontoExento>${fmt(montoExento)}</MontoExento>` : ""}
      ${tItbis1      > 0 ? `<ITBIS1>${fmt(tItbis1)}</ITBIS1>` : ""}
      ${totalItbis   > 0 ? `<TotalITBIS>${fmt(totalItbis)}</TotalITBIS>` : ""}
      <MontoTotal>${fmt(montoTotal)}</MontoTotal>
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
    const encf: string = (body.encf ?? body.eNCF ?? "").trim().toUpperCase();
    if (!encf) return NextResponse.json({ error: "encf requerido" }, { status: 400 });

    // Leer Excel de Firebase Storage
    const rows = await getAllRowsFromStorage();
    if (rows.length === 0)
      return NextResponse.json({ error: "No hay Excel cargado. Sube el Excel en el Paso 2." }, { status: 404 });

    const row = buscarFila(rows, encf);
    if (!row)
      return NextResponse.json({ error: `eNCF ${encf} no encontrado en el Excel` }, { status: 404 });

    const esRFCE = ENCFS_RFCE.has(encf);

    if (esRFCE) {
      // Enviar como RFCE (resumen < 250k)
      const rfceXml     = buildRFCEDesdeExcel(row, encf);
      const rfceFirmado = await firmarXML(rfceXml);
      const resultado   = await enviarRFCE(rfceFirmado);
      return NextResponse.json({
        success:     true,
        encf,
        trackId:     resultado.trackId,
        estadoDGII:  resultado.estado || "Enviado",
        esMenor250k: true,
        xmlGenerado: rfceFirmado,
      });
    }

    // Enviar como e-CF completo
    const xml     = buildXMLDesdeExcel(row, encf);
    const firmado = await firmarXML(xml);
    const trackId = await enviarECF(firmado);

    return NextResponse.json({
      success:     true,
      encf,
      trackId,
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