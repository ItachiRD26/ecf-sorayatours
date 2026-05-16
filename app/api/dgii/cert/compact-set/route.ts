// Devuelve un JSON compacto con solo los campos financieros clave de cada fila del Excel
// Para verificar que los datos del set coinciden con lo que DGII espera
// GET /api/dgii/cert/compact-set
// GET /api/dgii/cert/compact-set?encf=E410000000010  (solo una fila)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth }                 from "@/lib/firebase-admin";
import { getAllRowsFromStorage }      from "@/app/api/dgii/cert/upload-set/route";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// Intenta obtener un campo de la fila con múltiples nombres posibles
function campo(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
    // También intentar variantes con guión bajo vs sin
    const alt = k.replace(/_/g, "");
    if (row[alt] !== undefined && row[alt] !== "") return row[alt];
  }
  return undefined;
}

function num(row: Record<string, unknown>, ...keys: string[]): number {
  const v = campo(row, ...keys);
  return v !== undefined ? Number(v) : 0;
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  const v = campo(row, ...keys);
  return v !== undefined ? String(v).trim() : "";
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const rows = await getAllRowsFromStorage();
    if (rows.length === 0)
      return NextResponse.json({ error: "No hay Excel cargado" }, { status: 404 });

    // Ver columnas del primer row (normalizado)
    const columnas = Object.keys(rows[0]).sort();

    // Filtrar por eNCF específico si se pasa como query param
    const { searchParams } = new URL(req.url);
    const encfFiltro = searchParams.get("encf")?.trim().toUpperCase();

    const filas = encfFiltro
      ? rows.filter(r => {
          const e = str(r, "encf", "e_ncf", "ncf", "eencf", "numero_comprobante", "no_comprobante");
          return e.toUpperCase() === encfFiltro || e.toUpperCase().replace(/\s/g,"") === encfFiltro;
        })
      : rows;

    const compact = filas.map(row => {
      // Intentar mapear los campos más importantes
      const encf = str(row,
        "encf","e_ncf","ncf","eencf","numero_comprobante","no_comprobante","comprobante"
      );
      const tipo = str(row, "tipo_ecf","tipoecf","tipo","tipo_de_ecf");

      const razonEmisor = str(row, "razon_social_emisor","razonsocialemisor","emisor","nombre_emisor");
      const nombreComercial = str(row, "nombre_comercial","nombrecomercial");
      const dirEmisor = str(row, "direccion_emisor","direccionemisor","direccion");
      const municipio = str(row, "municipio");
      const provincia = str(row, "provincia");
      const correoEmisor = str(row, "correo_emisor","correoemisor","email_emisor","correo");

      const rncComprador = str(row, "rnc_comprador","rnccomprador","rnc","rnc_del_comprador");
      const razonComprador = str(row, "razon_social_comprador","razonsocialcomprador","comprador","nombre_comprador");

      const montoGravadoI1 = num(row, "monto_gravado_i1","montogravadoi1","montogravadototal","monto_gravado");
      const montoGravadoI2 = num(row, "monto_gravado_i2","montogravadoi2");
      const montoExento    = num(row, "monto_exento","montoexento");
      const itbis1         = num(row, "itbis1","itbis_1","tasa_itbis1","porcentaje_itbis1");
      const itbis2         = num(row, "itbis2","itbis_2","tasa_itbis2","porcentaje_itbis2");
      const totalITBIS1    = num(row, "total_itbis1","totalitbis1","monto_itbis1","itbismonto1");
      const totalITBIS2    = num(row, "total_itbis2","totalitbis2","monto_itbis2","itbismonto2");
      const totalITBIS     = num(row, "total_itbis","totalitbis","total_de_itbis","itbis");
      const montoTotal     = num(row, "monto_total","montototal","total","importe_total");
      const itbisRetenido  = num(row, "total_itbis_retenido","totalitbisretenido","itbis_retenido","totalitbisret");
      const isrRetencion   = num(row, "total_isr_retencion","totalisrretencion","isr_retencion","isrretencion");
      const indicadorMonto = str(row, "indicador_monto_gravado","indicadormontogravado","indicador_monto");
      const tipoPago       = str(row, "tipo_pago","tipopago");
      const ncfMod         = str(row, "ncf_modificado","ncfmodificado","ncf_mod");
      const codMod         = str(row, "codigo_modificacion","codigomodificacion","cod_modificacion");

      // Items
      const nombreItem  = str(row, "nombre_item","nombreitem","descripcion_item","nombre_del_item","item","descripcion","producto");
      const cantItem    = num(row, "cantidad_item","cantidaditem","cantidad","qty");
      const precioUnit  = num(row, "precio_unitario","preciounitario","precio","price");
      const indBS       = str(row, "indicador_bieno_servicio","indicadorbienooservicio","indicador_bs","bien_o_servicio");

      return {
        encf, tipo,
        emisor: { razonEmisor, nombreComercial, dirEmisor, municipio, provincia, correoEmisor },
        comprador: { rncComprador, razonComprador },
        totales: {
          montoGravadoI1, montoGravadoI2, montoExento,
          itbis1, itbis2, totalITBIS1, totalITBIS2, totalITBIS,
          montoTotal, itbisRetenido, isrRetencion, indicadorMonto, tipoPago,
        },
        item: { nombreItem, cantItem, precioUnit, indBS },
        ref: { ncfMod, codMod },
      };
    });

    return NextResponse.json({
      columnas,              // Para ver qué nombres exactos tiene el Excel
      totalFilas: rows.length,
      datos: compact,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}