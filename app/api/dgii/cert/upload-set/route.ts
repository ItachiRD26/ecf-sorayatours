// Parsea el Excel oficial de DGII (Set de Pruebas) y lo guarda en Firestore
// Guarda los datos en chunks de 100 filas para evitar el límite de 1MB de Firestore
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import * as XLSX                      from "xlsx";

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

const CHUNK_SIZE = 50; // filas por documento Firestore

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

    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rawRows.length === 0)
      return NextResponse.json({ error: "El Excel está vacío" }, { status: 400 });

    // Normalizar keys
    const rows = rawRows.map(row => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
        normalized[normalizeKey(k)] = v;
      }
      return normalized;
    });

    const columnas    = Object.keys(rows[0] ?? {});
    const totalFilas  = rows.length;
    const totalChunks = Math.ceil(totalFilas / CHUNK_SIZE);

    // Borrar chunks anteriores
    const colRef = adminDb.collection("set_pruebas_chunks");
    const oldSnap = await colRef.get();
    const deleteBatch = adminDb.batch();
    oldSnap.docs.forEach(d => deleteBatch.delete(d.ref));
    if (oldSnap.size > 0) await deleteBatch.commit();

    // Guardar nuevos chunks
    for (let i = 0; i < totalChunks; i++) {
      const chunk = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await colRef.doc(`chunk_${i}`).set({ chunk, index: i });
    }

    // Metadata en config
    await adminDb.collection("config").doc("set_pruebas_dgii").set({
      columnas,
      totalFilas,
      totalChunks,
      nombreArchivo: file.name,
      subidoEn:      new Date().toISOString(),
    });

    return NextResponse.json({
      success:     true,
      totalFilas,
      totalChunks,
      columnas,
      preview:     rows.slice(0, 2),
      mensaje:     `✅ ${totalFilas} comprobantes cargados en ${totalChunks} partes`,
    });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Error parseando Excel: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// GET — retorna metadata + primeras filas
export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const snap = await adminDb.collection("config").doc("set_pruebas_dgii").get();
  if (!snap.exists) return NextResponse.json({ error: "No hay set cargado" }, { status: 404 });

  const meta = snap.data()!;

  // Retornar primeras filas del chunk 0
  const chunk0 = await adminDb.collection("set_pruebas_chunks").doc("chunk_0").get();
  const preview = chunk0.exists ? (chunk0.data()!.chunk as unknown[]).slice(0, 3) : [];

  return NextResponse.json({ ...meta, preview });
}

// GET todas las filas — para el seed route
export async function getAllRows(): Promise<Record<string, unknown>[]> {
  const meta = await adminDb.collection("config").doc("set_pruebas_dgii").get();
  if (!meta.exists) return [];

  const { totalChunks } = meta.data() as { totalChunks: number };
  const allRows: Record<string, unknown>[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const snap = await adminDb.collection("set_pruebas_chunks").doc(`chunk_${i}`).get();
    if (snap.exists) {
      allRows.push(...(snap.data()!.chunk as Record<string, unknown>[]));
    }
  }
  return allRows;
}