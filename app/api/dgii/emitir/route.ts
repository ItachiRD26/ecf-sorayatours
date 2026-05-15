import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { buildXML, buildRFCEXml, LIMITE_RFCE } from "@/lib/dgii/xml-builder";
import { firmarXML }                 from "@/lib/dgii/xml-signer";
import { enviarECF, enviarRFCE }     from "@/lib/dgii/dgii-client";
import { generarURLQR, formatFechaQR, formatFechaHoraQR } from "@/lib/dgii/qr-builder";
import type { Factura, Cliente }     from "@/types";
import { calcTotales }               from "@/types";

// Verificar sesión
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
    // 1. Auth
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // 2. Obtener facturaId del body
    const body = await req.json();
    const { facturaId } = body;
    if (!facturaId) return NextResponse.json({ error: "facturaId requerido" }, { status: 400 });

    // 3. Cargar factura y datos de Firestore
    const [facturaSnap, empresaSnap] = await Promise.all([
      adminDb.collection("facturas").doc(facturaId).get(),
      adminDb.collection("config").doc("empresa").get(),
    ]);

    if (!facturaSnap.exists) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    const factura = { id: facturaId, ...facturaSnap.data() } as Factura;
    const empresa = empresaSnap.data() as { nombre: string; rnc: string; direccion: string; telefono: string };

    // Verificar que no haya sido ya enviada
    if (factura.estadoDGII && factura.estadoDGII !== "pendiente") {
      return NextResponse.json({ error: `Factura ya procesada: ${factura.estadoDGII}` }, { status: 400 });
    }

    // 4. Cargar cliente si aplica
    let cliente: Cliente | undefined;
    if (factura.clienteId && factura.clienteId !== "walk-in") {
      const clienteSnap = await adminDb.collection("clientes").doc(factura.clienteId).get();
      if (clienteSnap.exists) cliente = { id: clienteSnap.id, ...clienteSnap.data() } as Cliente;
    }

    // 5. Construir XML
    const xmlSinFirma = buildXML(factura, cliente, empresa);

    // 6. Firmar XML
    const xmlFirmado = await firmarXML(xmlSinFirma);

    // 7. Decidir si enviar como RFCE o e-CF completo
    const totales = calcTotales(factura.items);
    const esRFCE  = factura.tipoECF === "E32" && totales.total < LIMITE_RFCE;

    let trackId:   string;
    let estadoDGII: string;
    let signatureValue: string;

    // Extraer SignatureValue del XML firmado para el QR
    const sigMatch = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    signatureValue  = sigMatch?.[1]?.replace(/\s/g, "") ?? "";

    if (esRFCE) {
      // Enviar resumen RFCE
      const rfceXml     = buildRFCEXml(factura, empresa);
      const rfceFirmado = await firmarXML(rfceXml.replace("</ECF>", "</RFCE>").replace("<ECF>", "<RFCE>"));
      const resultado   = await enviarRFCE(rfceFirmado);
      trackId    = resultado.trackId;
      estadoDGII = resultado.estado || "Aceptado";
    } else {
      // Enviar XML completo
      trackId    = await enviarECF(xmlFirmado);
      estadoDGII = "Enviado"; // Se consulta luego con el trackId
    }

    // 8. Generar URL del QR
    const fechaEmision = formatFechaQR(factura.fecha);
    const fechaFirma   = formatFechaHoraQR(new Date().toISOString());
    const urlQR        = generarURLQR({
      tipoECF:        factura.tipoECF,
      rncEmisor:      empresa.rnc.replace(/\D/g, ""),
      rncComprador:   cliente?.rnc?.replace(/\D/g, ""),
      eNCF:           factura.eCF,
      fechaEmision,
      montoTotal:     totales.total,
      fechaFirma,
      signatureValue,
      esRFCE,
    });

    // 9. Guardar resultado en Firestore
    await adminDb.collection("facturas").doc(facturaId).update({
      estadoDGII,
      trackIdDGII:     trackId,
      xmlFirmado,
      urlQR,
      fechaEnvioDGII:  new Date().toISOString(),
      codigoSeguridad: signatureValue.substring(0, 6),
    });

    return NextResponse.json({
      success:    true,
      trackId,
      estadoDGII,
      urlQR,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[DGII/emitir]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}