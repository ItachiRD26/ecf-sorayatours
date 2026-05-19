// Descarga los 4 XMLs de E32 < 250k para subida manual al portal DGII
// Sirve el MISMO XML firmado que se usó para generar el RFCE (misma firma = mismo CodigoSeguridadeCF)
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { getAllRowsFromStorage }      from "@/app/api/dgii/cert/upload-set/route";
import { P12Reader, Signature }       from "dgii-ecf";
import { buildJsonECF }               from "@/app/api/dgii/cert/enviar/route";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const CERT_PATH = process.env.DGII_CERT_PATH!;
const CERT_PASS = process.env.DGII_CERT_PASSWORD!;
const RNC       = process.env.DGII_RNC || "131217656";

const ENCFS_MANUALES = [
  "E320000000011",
  "E320000000013",
  "E320000000014",
  "E320000000015",
];

async function getXMLFirmado(encf: string): Promise<string> {
  // 1. Intentar recuperar el XML firmado guardado cuando se envió el RFCE
  try {
    const snap = await adminDb.collection("ecf_firmados").doc(encf).get();
    if (snap.exists) {
      const data = snap.data() as { signedEcf: string };
      if (data.signedEcf) {
        console.log(`[descargar-xmls] Usando ECF firmado guardado para ${encf}`);
        return data.signedEcf;
      }
    }
  } catch (e) { console.warn("No se pudo leer Firestore:", e); }

  // 2. Si no existe (primera vez o se limpió), generar uno nuevo
  console.log(`[descargar-xmls] Generando nuevo ECF firmado para ${encf}`);
  const rows = await getAllRowsFromStorage() as Record<string,unknown>[];
  const row  = rows.find(r => {
    const e = String(r["encf"] ?? r["eNCF"] ?? r["#e"] ?? "").trim().toUpperCase();
    return e === encf.toUpperCase();
  });
  if (!row) throw new Error(`No se encontró el caso ${encf} en el Excel`);

  const reader = new P12Reader(CERT_PASS);
  const certs  = reader.getKeyFromFile(CERT_PATH);

  const { Transformer } = await import("dgii-ecf");
  const json        = buildJsonECF(row, encf);
  const transformer = new Transformer();
  const xml         = transformer.json2xml(json);
  const signature   = new Signature(certs.key!, certs.cert!);
  const signedXml   = signature.signXml(xml, "ECF");
  return signedXml;
}

// GET → retorna todos los XMLs como JSON
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const resultados: { eNCF: string; xmlFirmado: string; error?: string }[] = [];
  for (const encf of ENCFS_MANUALES) {
    try {
      const xmlFirmado = await getXMLFirmado(encf);
      resultados.push({ eNCF: encf, xmlFirmado });
    } catch (e: unknown) {
      resultados.push({ eNCF: encf, xmlFirmado: "", error: String(e) });
    }
  }
  return NextResponse.json({ success: true, xmls: resultados });
}

// POST con { eNCF: "E320000000011" } → descarga ese XML como archivo
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { eNCF } = await req.json();
  if (!ENCFS_MANUALES.includes(eNCF))
    return NextResponse.json({ error: "eNCF no válido" }, { status: 400 });

  try {
    const xmlFirmado = await getXMLFirmado(eNCF);
    return new NextResponse(xmlFirmado, {
      headers: {
        "Content-Type":        "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${RNC}${eNCF}.xml"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}