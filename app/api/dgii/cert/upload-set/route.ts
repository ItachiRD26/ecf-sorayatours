// Sube el Excel de DGII a Firebase Storage y guarda metadata en Firestore
// Firebase Storage maneja archivos grandes sin límite de 1MB
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { getStorage }                from "firebase-admin/storage";
import * as XLSX                     from "xlsx";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file     = formData.get("excel") as File | null;
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // 1. Subir archivo original a Firebase Storage
    const bucket    = getStorage().bucket();
    const storagePath = "dgii/set_pruebas_dgii.xlsx";
    const fileRef   = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    });

    // 2. Parsear con SheetJS para obtener metadata y preview
    const workbook  = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rawRows.length === 0)
      return NextResponse.json({ error: "El Excel está vacío" }, { status: 400 });

    // Normalizar keys solo del preview
    const normalizeRow = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
      return out;
    };

    const columnas = Object.keys(rawRows[0]).map(normalizeKey);
    const preview  = rawRows.slice(0, 3).map(normalizeRow);

    // 3. Guardar metadata en Firestore (pequeño, sin las filas)
    await adminDb.collection("config").doc("set_pruebas_dgii").set({
      storagePath,
      columnas,
      totalFilas:    rawRows.length,
      nombreArchivo: file.name,
      subidoEn:      new Date().toISOString(),
    });

    return NextResponse.json({
      success:    true,
      totalFilas: rawRows.length,
      columnas,
      preview,
      mensaje:    `✅ ${rawRows.length} comprobantes cargados desde "${file.name}"`,
    });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Error parseando Excel: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// GET metadata
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("config").doc("set_pruebas_dgii").get();
  if (!snap.exists) return NextResponse.json({ error: "No hay set cargado" }, { status: 404 });
  return NextResponse.json(snap.data());
}

// Helper para leer todas las filas desde Storage (usado por el seed route)
export async function getAllRowsFromStorage(): Promise<Record<string, unknown>[]> {
  const snap = await adminDb.collection("config").doc("set_pruebas_dgii").get();
  if (!snap.exists) return [];

  const { storagePath } = snap.data() as { storagePath: string };
  const bucket  = getStorage().bucket();
  const [buffer] = await bucket.file(storagePath).download();

  const workbook  = XLSX.read(buffer, { type: "buffer" });
  const sheet     = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")] = v;
    }
    return out;
  });
}