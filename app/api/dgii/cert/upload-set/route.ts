// Parsea el Excel oficial de DGII (Set de Pruebas) y lo guarda en Firestore
// El Excel lo descarga el contribuyente del portal certecf en el Paso 2
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import * as XLSX                      from "xlsx";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// Normaliza nombres de columnas (quita espacios, tildes, mayúsculas)
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

    // Leer el Excel con SheetJS
    const arrayBuffer = await file.arrayBuffer();
    const workbook    = XLSX.read(arrayBuffer, { type: "array" });

    // Tomar la primera hoja
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rawRows.length === 0)
      return NextResponse.json({ error: "El Excel está vacío" }, { status: 400 });

    // Normalizar keys de cada fila
    const rows = rawRows.map(row => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[normalizeKey(k)] = v;
      }
      return normalized;
    });

    // Guardar en Firestore como set de pruebas
    await adminDb.collection("config").doc("set_pruebas_dgii").set({
      rows,
      columnas:     Object.keys(rows[0] ?? {}),
      totalFilas:   rows.length,
      nombreArchivo: file.name,
      subidoEn:     new Date().toISOString(),
    });

    // Preview de las primeras 3 filas para confirmar
    return NextResponse.json({
      success:     true,
      totalFilas:  rows.length,
      columnas:    Object.keys(rows[0] ?? {}),
      preview:     rows.slice(0, 3),
      mensaje:     `✅ Set de ${rows.length} comprobantes cargado correctamente`,
    });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Error parseando Excel: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// GET — retorna el set actual guardado
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("config").doc("set_pruebas_dgii").get();
  if (!snap.exists) return NextResponse.json({ error: "No hay set cargado" }, { status: 404 });

  return NextResponse.json(snap.data());
}