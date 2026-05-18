// GET /api/dgii/cert/debug-row?encf=E440000000011
import { NextRequest, NextResponse } from "next/server";
import { getAllRowsFromStorage } from "@/app/api/dgii/cert/upload-set/route";

export async function GET(req: NextRequest) {
  const encf = req.nextUrl.searchParams.get("encf")?.toUpperCase();
  if (!encf) return NextResponse.json({ error: "?encf= requerido" }, { status: 400 });

  const rows = await getAllRowsFromStorage() as Record<string,unknown>[];
  const row  = rows.find(r => {
    const v = String(r["encf"] ?? r["eNCF"] ?? r["e-NCF"] ?? r["ENCF"] ?? "").trim().toUpperCase();
    return v === encf;
  });

  if (!row) return NextResponse.json({ 
    error: `No encontrado: ${encf}`,
    sample_keys: Object.keys(rows[0] ?? {}).slice(0, 30)
  });

  // Solo columnas con valor
  const filled: Record<string,unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      filled[k] = v;
    }
  }
  return NextResponse.json({ encf, filled }, { status: 200 });
}