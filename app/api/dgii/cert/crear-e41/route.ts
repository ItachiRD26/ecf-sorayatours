import { NextRequest, NextResponse }  from "next/server";
import { adminAuth, adminDb }         from "@/lib/firebase-admin";
import { buildXML }                   from "@/lib/dgii/xml-builder";
import { firmarXML }                  from "@/lib/dgii/xml-signer";
import { enviarECF }                  from "@/lib/dgii/dgii-client";
import { generarURLQR, formatFechaQR, formatFechaHoraQR, calcularCodigoSeguridad } from "@/lib/dgii/qr-builder";
import type { Factura, Cliente, LineaServicio } from "@/types";
import { calcTotales } from "@/types";

// TODO(cert): Eliminar CERT_USADOS_E41 una vez completado el proceso de certificación DGII.
// Estos números fueron consumidos en el Paso 2 y no pueden reutilizarse.
const CERT_USADOS_E41 = new Set([1, 10]);

async function nextE41Seq(): Promise<number> {
  const ref = adminDb.collection("config").doc("secuencias");
  return adminDb.runTransaction(async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists ? ((snap.data() as Record<string, number>).E41 ?? 0) : 0;
    let next = current + 1;
    // TODO(cert): Eliminar este bloque junto con CERT_USADOS_E41 al finalizar certificación.
    while (CERT_USADOS_E41.has(next)) next++;
    tx.set(ref, { E41: next }, { merge: true });
    return next;
  });
}

async function verificarSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie);
    return decoded.uid;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { rncProveedor, nombreProveedor, descripcion, montoSub, itbisRate, fecha, token } =
      await req.json();

    if (!rncProveedor || !nombreProveedor || !descripcion || montoSub == null || itbisRate == null) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const rncClean = String(rncProveedor).replace(/\D/g, "");
    if (rncClean.length !== 9 && rncClean.length !== 11) {
      return NextResponse.json({ error: "RNC debe tener 9 u 11 dígitos" }, { status: 400 });
    }

    // Empresa config
    const EMPRESA_FALLBACK = {
      nombre:    "SORAYA Y LEONARDO TOURS SRL",
      rnc:       "1-31217656-6",
      direccion: "Playa Juan de Bolanos Bugalow #3, Montecristi",
      telefono:  "809-961-6343",
    };
    const empresaSnap = await adminDb.collection("config").doc("empresa").get();
    const empresa = (empresaSnap.exists && empresaSnap.data()?.rnc)
      ? empresaSnap.data() as typeof EMPRESA_FALLBACK
      : EMPRESA_FALLBACK;
    const vencimientoECF = (empresaSnap.data()?.vencimientoECF as string | undefined) ?? "2027-12-31";

    // Upsert proveedor en colección clientes (por si se quiere consultar después)
    const provQuery = await adminDb.collection("clientes")
      .where("rnc", "==", rncClean)
      .limit(1)
      .get();

    let proveedorId: string;
    if (!provQuery.empty) {
      proveedorId = provQuery.docs[0].id;
    } else {
      const provRef  = adminDb.collection("clientes").doc();
      await provRef.set({
        rnc:       rncClean,
        nombre:    String(nombreProveedor),
        tipo:      rncClean.length === 9 ? "juridica" : "fisica",
        direccion: "", ciudad: "", contacto: "", telefono: "",
        creadoEn:  new Date().toISOString(),
      });
      proveedorId = provRef.id;
    }

    const proveedor: Cliente = {
      id:        proveedorId,
      rnc:       rncClean,
      nombre:    String(nombreProveedor),
      tipo:      rncClean.length === 9 ? "juridica" : "fisica",
      direccion: "", ciudad: "", contacto: "", telefono: "",
    };

    // Secuencia
    const seq = await nextE41Seq();
    const eCF = `E41${String(seq).padStart(10, "0")}`;

    // Línea de servicio
    const item: LineaServicio = {
      codigo:         "COMPRA",
      descripcion:    String(descripcion).substring(0, 80),
      modo:           "por_grupo",
      cant:           1,
      pax:            1,
      precio:         Number(montoSub),
      descuentoMonto: 0,
      itbis:          Number(itbisRate),
    };

    const fechaStr = fecha || new Date().toISOString().split("T")[0];

    // Crear Factura en Firestore
    const facturaRef = adminDb.collection("facturas").doc();
    const factura: Factura = {
      id:             facturaRef.id,
      noFactura:      `E41-${String(seq).padStart(6, "0")}`,
      eCF,
      tipoECF:        "E41",
      fecha:          fechaStr,
      vencimientoECF,
      terminos:       "Contado",
      clienteId:      proveedorId,
      estado:         "pendiente",
      estadoDGII:     "pendiente",
      items:          [item],
      creadoEn:       new Date().toISOString(),
      creadoPor:      uid,
    };

    await facturaRef.set(factura);

    // Construir + firmar XML
    const xmlSinFirma = buildXML(factura, proveedor, empresa);
    const xmlFirmado  = await firmarXML(xmlSinFirma);

    const sigMatch       = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    const signatureValue = sigMatch?.[1]?.replace(/\s/g, "") ?? "";
    const codigoSeguridad = calcularCodigoSeguridad(signatureValue);

    // Enviar a DGII
    const trackId = await enviarECF(xmlFirmado, token, eCF);

    // URL QR
    const totales = calcTotales(factura.items);
    const urlQR   = generarURLQR({
      tipoECF:      "E41",
      rncEmisor:    empresa.rnc.replace(/\D/g, ""),
      rncComprador: rncClean,
      eNCF:         eCF,
      fechaEmision: formatFechaQR(fechaStr),
      montoTotal:   totales.total,
      fechaFirma:   formatFechaHoraQR(new Date().toISOString()),
      signatureValue,
      esRFCE:       false,
    });

    // Actualizar Factura con resultado DGII
    await facturaRef.update({
      estadoDGII:     "Enviado",
      trackIdDGII:    trackId,
      xmlFirmado,
      urlQR,
      codigoSeguridad,
      fechaEnvioDGII: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      facturaId: facturaRef.id,
      eCF,
      trackId,
      montoTotal: totales.total,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/crear-e41]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
