// Genera y descarga los 4 XMLs firmados de E32 < 250k para subida manual al portal
// Usa la misma librería dgii-ecf y los mismos datos del Excel que el route de enviar
import { NextRequest, NextResponse } from "next/server";
import { adminAuth }                 from "@/lib/firebase-admin";
import { getAllRowsFromStorage }      from "@/app/api/dgii/cert/upload-set/route";
import { P12Reader, Signature } from "dgii-ecf";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

const CERT_PATH = process.env.DGII_CERT_PATH!;
const CERT_PASS = process.env.DGII_CERT_PASSWORD!;

// Los 4 E32 < 250k que se suben manualmente
const ENCFS_MANUALES = [
  "E320000000011",
  "E320000000013", 
  "E320000000014",
  "E320000000015",
];

// Misma función raw que usa el route de enviar
function raw(row: Record<string,unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && v !== "") return String(v).trim();
  }
  return "";
}

async function generarXMLFirmado(encf: string): Promise<string> {
  // 1. Leer datos del Excel (misma fuente que el route de enviar)
  const rows = await getAllRowsFromStorage() as Record<string,unknown>[];
  const row  = rows.find(r => {
    const e = String(r["encf"] ?? r["eNCF"] ?? r["#e"] ?? "").trim().toUpperCase();
    return e === encf.toUpperCase();
  });
  if (!row) throw new Error(`No se encontró el caso ${encf} en el Excel`);

  // 2. Cargar certificado
  const reader = new P12Reader(CERT_PASS);
  const certs  = reader.getKeyFromFile(CERT_PATH);

  // 3. Importar buildJsonECF y Transformer
  const { buildJsonECF } = await import("@/app/api/dgii/cert/enviar/route");
  const { Transformer }  = await import("dgii-ecf");

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
      const xmlFirmado = await generarXMLFirmado(encf);
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
    const xmlFirmado = await generarXMLFirmado(eNCF);
    const rnc        = process.env.DGII_RNC || "131217656";
    return new NextResponse(xmlFirmado, {
      headers: {
        "Content-Type":        "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${rnc}${eNCF}.xml"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}