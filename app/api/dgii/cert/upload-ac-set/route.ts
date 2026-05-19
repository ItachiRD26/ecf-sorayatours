// Sube el Excel de Aprobaciones Comerciales (Paso 3) de DGII
// El Excel tiene las filas de los eCFs que requieren AC
// Columnas esperadas: eNCF, TipoECF, RNCEmisor, RNCComprador, FechaEmision, MontoTotal
// (Estado por defecto = 1 Aceptado; el sistema permite cambiar a 2 Rechazado con motivo)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import * as XLSX                     from "xlsx";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// Mapeo flexible de columnas del Excel de DGII → nombres internos
const KEY_MAP: Record<string, string> = {
  encf:             "encf",
  e_ncf:            "encf",
  numero_e_cf:      "encf",
  tipo_e_cf:        "tipo",
  tipo:             "tipo",
  rnc_emisor:       "rncEmisor",
  rncemisor:        "rncEmisor",
  rnc_comprador:    "rncComprador",
  rnccomprador:     "rncComprador",
  fecha_emision:    "fechaEmision",
  fechaemision:     "fechaEmision",
  monto_total:      "montoTotal",
  montototal:       "montoTotal",
  total:            "montoTotal",
  estado:           "estado",
  motivo_rechazo:   "motivoRechazo",
  motivorechazo:    "motivoRechazo",
  detalle_motivo:   "motivoRechazo",
};

export interface ACItem {
  encf:           string;
  tipo:           string;
  rncEmisor:      string;
  rncComprador:   string;
  fechaEmision:   string;
  montoTotal:     number;
  estado:         1 | 2;     // 1=Aceptado, 2=Rechazado
  motivoRechazo?: string;
}

function rowToACItem(raw: Record<string, unknown>): ACItem | null {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = KEY_MAP[normalizeKey(k)] ?? normalizeKey(k);
    normalized[nk] = v;
  }

  const encf = String(normalized.encf ?? "").trim().toUpperCase();
  if (!encf) return null;

  const tipo          = String(normalized.tipo ?? tipoDeENCF(encf)).trim().toUpperCase();
  const rncEmisor     = String(normalized.rncEmisor ?? process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");
  const rncComprador  = String(normalized.rncComprador ?? "").replace(/\D/g, "");
  const fechaEmision  = normalizeFecha(String(normalized.fechaEmision ?? "").trim());
  const montoRaw      = normalized.montoTotal ?? normalized.total ?? 0;
  const montoTotal    = typeof montoRaw === "number" ? montoRaw : parseFloat(String(montoRaw).replace(/[^\d.-]/g, "")) || 0;
  const estadoRaw     = Number(normalized.estado ?? 1);
  const estado        = (estadoRaw === 2 ? 2 : 1) as 1 | 2;
  const motivoRechazo = estado === 2 ? String(normalized.motivoRechazo ?? "").trim() : undefined;

  if (!rncComprador || !fechaEmision) return null;

  return { encf, tipo, rncEmisor, rncComprador, fechaEmision, montoTotal, estado, motivoRechazo };
}

function tipoDeENCF(encf: string): string {
  const m = encf.match(/^([A-Z]\d{2})/);
  return m ? m[1] : "";
}

function normalizeFecha(s: string): string {
  if (!s) return "";
  // dd-MM-YYYY → ok
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  // dd/MM/YYYY → dd-MM-YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.replace(/\//g, "-");
  // YYYY-MM-DD → dd-MM-YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.substring(0, 10).split("-");
    return `${d}-${m}-${y}`;
  }
  // Número de serie Excel (días desde 1900-01-01)
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 40000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`;
  }
  return s;
}

// ─── POST: subir Excel de AC ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file     = formData.get("excel") as File | null;
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

    const buffer   = Buffer.from(await file.arrayBuffer());
    const wb       = XLSX.read(buffer, { type: "buffer" });
    const sheet    = wb.Sheets[wb.SheetNames[0]];
    const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

    if (rawRows.length === 0)
      return NextResponse.json({ error: "El Excel está vacío" }, { status: 400 });

    const items = rawRows
      .map(r => rowToACItem(r))
      .filter((x): x is ACItem => x !== null);

    if (items.length === 0)
      return NextResponse.json({ error: "No se encontraron filas válidas con eNCF y RNCComprador" }, { status: 400 });

    // Guardar en Firestore
    await adminDb.collection("config").doc("ac_set_paso3").set({
      items,
      nombreArchivo: file.name,
      totalFilas:    items.length,
      subidoEn:      new Date().toISOString(),
    });

    return NextResponse.json({
      success:    true,
      totalFilas: items.length,
      columnas:   Object.keys(rawRows[0]).map(normalizeKey),
      items,
      mensaje:    `✅ ${items.length} aprobaciones comerciales cargadas desde "${file.name}"`,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error parseando Excel: ${msg}` }, { status: 500 });
  }
}

// ─── GET: leer items guardados ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("config").doc("ac_set_paso3").get();
  if (!snap.exists)
    return NextResponse.json({ error: "No hay set de AC cargado" }, { status: 404 });

  return NextResponse.json(snap.data());
}