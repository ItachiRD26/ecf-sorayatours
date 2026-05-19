// Genera y descarga los 4 XMLs firmados de E32 < 250k como RFCE
// Estos se suben manualmente al portal certecf DESPUÉS de que los RFCE estén aprobados
// Formato: RFCE según XSD RFCE_32_v_1_0 — SIN DetallesItems, CON CodigoSeguridadeCF
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { firmarXML } from "@/lib/dgii/xml-signer";
import * as fs from "fs";
import * as path from "path";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const RNC_EMISOR   = "131217656";
const RAZON_EMISOR = "SORAYA Y LEONARDO TOURS SRL";

const CASOS_E32_PEQUENAS = [
  { eNCF:"E320000000011", item:"Cargador",             cant:15,  precU:2266.67, mG:34000, itb:6120,  mT:40120  },
  { eNCF:"E320000000013", item:"Nevera",               cant:1,   precU:95000,   mG:95000, itb:17100, mT:112100 },
  { eNCF:"E320000000014", item:"Articulos de belleza", cant:15,  precU:673.33,  mG:10100, itb:1818,  mT:11918  },
  { eNCF:"E320000000015", item:"Celular",              cant:50,  precU:1100,    mG:55000, itb:9900,  mT:64900  },
];

const fmt = (n: number) => n.toFixed(2);

// Paso 1: construir un ECF temporal solo para obtener el SignatureValue
// y calcular CodigoSeguridadeCF (primeros 6 chars del SignatureValue)
function buildECFTemporal(c: typeof CASOS_E32_PEQUENAS[0]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${c.eNCF}</eNCF>
      <FechaVencimientoSecuencia>31-12-2099</FechaVencimientoSecuencia>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>1</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${RNC_EMISOR}</RNCEmisor>
      <RazonSocialEmisor>${RAZON_EMISOR}</RazonSocialEmisor>
      <FechaEmision>01-04-2020</FechaEmision>
    </Emisor>
    <Comprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${fmt(c.mG)}</MontoGravadoTotal>
      <MontoGravadoI1>${fmt(c.mG)}</MontoGravadoI1>
      <MontoExento>0.00</MontoExento>
      <ITBIS1>18</ITBIS1>
      <TotalITBIS>${fmt(c.itb)}</TotalITBIS>
      <TotalITBIS1>${fmt(c.itb)}</TotalITBIS1>
      <MontoTotal>${fmt(c.mT)}</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>${c.item}</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio>
      <CantidadItem>${fmt(c.cant)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmt(c.precU)}</PrecioUnitarioItem>
      <MontoItem>${fmt(c.mG)}</MontoItem>
      <ITBIS>${fmt(c.itb)}</ITBIS>
    </Item>
  </DetallesItems>
  <FechaHoraFirma>01-04-2020 00:00:00</FechaHoraFirma>
</ECF>`;
}

// Paso 2: construir el RFCE real con el CodigoSeguridadeCF ya calculado
function buildRFCE(c: typeof CASOS_E32_PEQUENAS[0], codigoSeguridad: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RFCE>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${c.eNCF}</eNCF>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>1</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${RNC_EMISOR}</RNCEmisor>
      <RazonSocialEmisor>${RAZON_EMISOR}</RazonSocialEmisor>
      <FechaEmision>01-04-2020</FechaEmision>
    </Emisor>
    <Comprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${fmt(c.mG)}</MontoGravadoTotal>
      <MontoGravadoI1>${fmt(c.mG)}</MontoGravadoI1>
      <MontoExento>0.00</MontoExento>
      <TotalITBIS>${fmt(c.itb)}</TotalITBIS>
      <TotalITBIS1>${fmt(c.itb)}</TotalITBIS1>
      <MontoTotal>${fmt(c.mT)}</MontoTotal>
    </Totales>
    <CodigoSeguridadeCF>${codigoSeguridad}</CodigoSeguridadeCF>
  </Encabezado>
</RFCE>`;
}

async function generarRFCEFirmado(caso: typeof CASOS_E32_PEQUENAS[0]): Promise<string> {
  // Leer el ECF ya aprobado por DGII para obtener el CodigoSeguridadeCF correcto
  const ecfSignedPath = path.join("/tmp/ecf-debug", `${caso.eNCF}_ecf_signed.xml`);
  
  let codigo = "";
  try {
    const ecfSigned = fs.readFileSync(ecfSignedPath, "utf8");
    const sigMatch  = ecfSigned.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    const sigVal    = sigMatch ? sigMatch[1].replace(/\s/g, "") : "";
    codigo          = sigVal.slice(0, 6);
  } catch {
    throw new Error(`No se encontró el ECF aprobado para ${caso.eNCF}. Asegúrate de haber enviado el set de certificación primero.`);
  }

  // Construir y firmar el RFCE con el código del ECF real
  const rfceXml  = buildRFCE(caso, codigo);
  const firmado  = await firmarXML(rfceXml);
  return firmado;
}

// GET → genera todos los XMLs firmados y los retorna como JSON
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const resultados: { eNCF: string; item: string; xmlFirmado: string; error?: string }[] = [];

  for (const caso of CASOS_E32_PEQUENAS) {
    try {
      const xmlFirmado = await generarRFCEFirmado(caso);
      resultados.push({ eNCF: caso.eNCF, item: caso.item, xmlFirmado });
    } catch (e: unknown) {
      resultados.push({ eNCF: caso.eNCF, item: caso.item, xmlFirmado: "", error: String(e) });
    }
  }

  return NextResponse.json({ success: true, xmls: resultados });
}

// POST con { eNCF: "E320000000011" } → descarga ese RFCE firmado como archivo
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { eNCF } = await req.json();
  const caso = CASOS_E32_PEQUENAS.find(c => c.eNCF === eNCF);
  if (!caso) return NextResponse.json({ error: "eNCF no encontrado" }, { status: 404 });

  const xmlFirmado = await generarRFCEFirmado(caso);

  return new NextResponse(xmlFirmado, {
    headers: {
      "Content-Type":        "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${RNC_EMISOR}${eNCF}.xml"`,
    },
  });
}