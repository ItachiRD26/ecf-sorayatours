// Sube el Excel de Aprobaciones Comerciales (Paso 3) proporcionado por DGII
// Columnas exactas del Excel DGII:
//   Version | RNCEmisor | eNCF | FechaEmision | MontoTotal |
//   RNCComprador | Estado | DetalleMotivoRechazo | FechaHoraAprobacionComercial

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
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Mapeo columnas exactas del Excel DGII → nombres internos
const KEY_MAP: Record<string, string> = {
  "version":                       "version",
  "rncemisor":                     "rncEmisor",
  "encf":                          "encf",
  "fechaemision":                  "fechaEmision",
  "montototal":                    "montoTotal",
  "rnccomprador":                  "rncComprador",
  "estado":                        "estado",
  "detallemotivorechazo":          "motivoRechazo",
  "fechahoraaprobacioncomercial":  "fechaHoraAC",
  // variantes adicionales
  "total":                         "montoTotal",
  "motivorechazo":                 "motivoRechazo",
  "detallemotivo":                 "motivoRechazo",
  "fechahoraac":                   "fechaHoraAC",
};

export interface ACItem {
  encf:          string;
  tipo:          string;
  rncEmisor:     string;
  rncComprador:  string;
  fechaEmision:  string;   // dd-MM-YYYY
  montoTotal:    number;
  estado:        1 | 2;    // 1=Aceptado, 2=Rechazado
  fechaHoraAC:   string;   // dd-MM-YYYY HH:mm:ss — del Excel DGII
  motivoRechazo?: string;
}

function tipoDeENCF(encf: string): string {
  const m = encf.match(/^([A-Z]\d{2})/);
  return m ? m[1] : "";
}

function normalizeFecha(s: string): string {
  if (!s) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.substring(0, 10).split("-");
    return `${d}-${m}-${y}`;
  }
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 40000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${String(dt.getUTCDate()).padStart(2,"0")}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${dt.getUTCFullYear()}`;
  }
  return s;
}

function nowFechaHoraAC(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function rowToACItem(raw: Record<string, unknown>): ACItem | null {
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = KEY_MAP[normalizeKey(k)];
    if (mapped) n[mapped] = v;
  }

  const encf = String(n.encf ?? "").trim().toUpperCase();
  if (!encf) return null;

  const tipo         = tipoDeENCF(encf);
  const rncEmisor    = String(n.rncEmisor ?? process.env.DGII_RNC ?? "131217656").replace(/\D/g, "");
  const rncComprador = String(n.rncComprador ?? "").replace(/\D/g, "");
  const fechaEmision = normalizeFecha(String(n.fechaEmision ?? "").trim());
  const montoRaw     = n.montoTotal ?? 0;
  const montoTotal   = typeof montoRaw === "number"
    ? montoRaw
    : parseFloat(String(montoRaw).replace(/[^\d.-]/g, "")) || 0;
  const estadoRaw  = Number(n.estado ?? 1);
  const estado     = (estadoRaw === 2 ? 2 : 1) as 1 | 2;
  const fechaHoraRaw = String(n.fechaHoraAC ?? "").trim();
  const fechaHoraAC  = fechaHoraRaw || nowFechaHoraAC();

  if (!rncComprador || !fechaEmision) return null;

  // Sin undefined — Firestore lo rechaza
  const item: ACItem = {
    encf, tipo, rncEmisor, rncComprador,
    fechaEmision, montoTotal, estado, fechaHoraAC,
  };
  if (estado === 2) {
    const motivo = String(n.motivoRechazo ?? "").trim();
    if (motivo) item.motivoRechazo = motivo;
  }

  return item;
}

// ─── POST: subir Excel ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file     = formData.get("excel") as File | null;
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

    const buffer  = Buffer.from(await file.arrayBuffer());
    const wb      = XLSX.read(buffer, { type: "buffer" });
    const sheet   = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

    if (rawRows.length === 0)
      return NextResponse.json({ error: "El Excel está vacío" }, { status: 400 });

    const items = rawRows
      .map(r => rowToACItem(r))
      .filter((x): x is ACItem => x !== null);

    if (items.length === 0)
      return NextResponse.json({
        error: "No se encontraron filas válidas. Columnas detectadas: " +
               Object.keys(rawRows[0]).join(", "),
      }, { status: 400 });

    await adminDb.collection("config").doc("ac_set_paso3").set({
      items,
      nombreArchivo: file.name,
      totalFilas:    items.length,
      subidoEn:      new Date().toISOString(),
    });

    return NextResponse.json({
      success:    true,
      totalFilas: items.length,
      items,
      mensaje:    `✅ ${items.length} aprobaciones cargadas desde "${file.name}"`,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error parseando Excel: ${msg}` }, { status: 500 });
  }
}

// ─── GET: leer items ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("config").doc("ac_set_paso3").get();
  if (!snap.exists)
    return NextResponse.json({ error: "No hay set de AC cargado" }, { status: 404 });

  return NextResponse.json(snap.data());
}