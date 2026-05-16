// Genera y descarga los 4 XMLs firmados de E32 < 250k
// Estos se suben manualmente al portal certecf DESPUÉS de que los RFCE estén aprobados
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { firmarXML } from "@/lib/dgii/xml-signer";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const RNC_EMISOR   = "131217656";
const RAZON_EMISOR = "SORAYA Y LEONARDO TOURS SRL";
const DIR_EMISOR   = "Playa Juan de Bolanos Bugalow 3, Montecristi";
const TEL_EMISOR   = "8099616343";

const CASOS_E32_PEQUENAS = [
  { eNCF:"E320000000011", item:"Cargador",            cant:15,  precU:2266.67, mG:34000,  itb:6120,  mT:40120  },
  { eNCF:"E320000000013", item:"Nevera",              cant:1,   precU:95000,   mG:95000,  itb:17100, mT:112100 },
  { eNCF:"E320000000014", item:"Articulos de belleza",cant:15,  precU:673.33,  mG:10100,  itb:1818,  mT:11918  },
  { eNCF:"E320000000015", item:"Celular",             cant:50,  precU:1100,    mG:55000,  itb:9900,  mT:64900  },
];

function buildE32XML(c: typeof CASOS_E32_PEQUENAS[0]): string {
  const fmt = (n: number) => n.toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>${c.eNCF}</eNCF>
      <FechaVencimientoSecuencia>31-12-2099</FechaVencimientoSecuencia>
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoPago>1</TipoPago>
      <FechaEmision>01-04-2020</FechaEmision>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${RNC_EMISOR}</RNCEmisor>
      <RazonSocialEmisor>${RAZON_EMISOR}</RazonSocialEmisor>
      <DireccionEmisor>${DIR_EMISOR}</DireccionEmisor>
      <TablaTelefonoEmisor><TelefonoEmisor>${TEL_EMISOR}</TelefonoEmisor></TablaTelefonoEmisor>
      <ActividadEconomica>Servicios de Turismo y Excursiones</ActividadEconomica>
      <FechaEmision>01-04-2020</FechaEmision>
    </Emisor>
    <Comprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${fmt(c.mG)}</MontoGravadoTotal>
      <MontoGravadoI1>${fmt(c.mG)}</MontoGravadoI1>
      <MontoExento>0.00</MontoExento>
      <ITBIS1>${fmt(c.itb)}</ITBIS1>
      <TotalITBIS>${fmt(c.itb)}</TotalITBIS>
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
      <TablaSubDescuento>
        <SubDescuento>
          <TasaSubDescuento>0.00</TasaSubDescuento>
          <MontoSubDescuento>0.00</MontoSubDescuento>
        </SubDescuento>
      </TablaSubDescuento>
      <MontoItem>${fmt(c.mG)}</MontoItem>
      <ITBIS>${fmt(c.itb)}</ITBIS>
    </Item>
  </DetallesItems>
</ECF>`;
}

// GET → genera todos los XMLs firmados y los retorna como JSON
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const resultados: { eNCF: string; item: string; xmlFirmado: string; error?: string }[] = [];

  for (const caso of CASOS_E32_PEQUENAS) {
    try {
      const xml       = buildE32XML(caso);
      const xmlFirmado = await firmarXML(xml);
      resultados.push({ eNCF: caso.eNCF, item: caso.item, xmlFirmado });
    } catch (e: unknown) {
      resultados.push({ eNCF: caso.eNCF, item: caso.item, xmlFirmado: "", error: String(e) });
    }
  }

  return NextResponse.json({ success: true, xmls: resultados });
}

// GET con ?eNCF=E320000000011 → descarga ese XML específico como archivo
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { eNCF } = await req.json();
  const caso = CASOS_E32_PEQUENAS.find(c => c.eNCF === eNCF);
  if (!caso) return NextResponse.json({ error: "eNCF no encontrado" }, { status: 404 });

  const xml        = buildE32XML(caso);
  const xmlFirmado = await firmarXML(xml);

  return new NextResponse(xmlFirmado, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${eNCF}.xml"`,
    },
  });
}