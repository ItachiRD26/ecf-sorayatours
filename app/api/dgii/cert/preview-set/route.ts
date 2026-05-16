// Muestra las columnas y primeras filas del Excel de DGII cargado en Storage
import { NextRequest, NextResponse } from "next/server";
import { adminAuth }  from "@/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import * as XLSX      from "xlsx";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const bucket = getStorage().bucket();
  const [buffer] = await bucket.file("dgii/set_pruebas_dgii.xlsx").download();

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets   = workbook.SheetNames;
  
  // Retornar datos de cada hoja
  const resultado: Record<string, unknown> = {};
  for (const name of sheets) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "" });
    resultado[name] = {
      columnas: Object.keys(rows[0] ?? {}),
      filas:    rows.length,
      preview:  rows.slice(0, 5), // primeras 5 filas
    };
  }

  return NextResponse.json(resultado);
}