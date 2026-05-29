import { NextRequest, NextResponse }                    from "next/server";
import { adminAuth, adminDb }                           from "@/lib/firebase-admin";
import { buildXML, buildRFCEXml, LIMITE_RFCE, fmtRNC } from "@/lib/dgii/xml-builder";
import { firmarXML }                                    from "@/lib/dgii/xml-signer";
import { enviarECF, enviarRFCE }                        from "@/lib/dgii/dgii-client";
import { generarURLQR, formatFechaQR, formatFechaHoraQR, calcularCodigoSeguridad } from "@/lib/dgii/qr-builder";
import type { Factura, Cliente }                        from "@/types";
import { calcTotales }                                  from "@/types";

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

    // 2. facturaId
    const { facturaId, token: tokenManual } = await req.json();
    if (!facturaId) return NextResponse.json({ error: "facturaId requerido" }, { status: 400 });

    // 3. Cargar factura + config empresa desde Firestore
    const [facturaSnap, empresaSnap] = await Promise.all([
      adminDb.collection("facturas").doc(facturaId).get(),
      adminDb.collection("config").doc("empresa").get(),
    ]);

    if (!facturaSnap.exists) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    const factura = { id: facturaId, ...facturaSnap.data() } as Factura;

    // Fallback con datos reales si config/empresa no existe en Firestore todavía
    const EMPRESA_FALLBACK = {
      nombre:    "SORAYA Y LEONARDO TOURS SRL",
      rnc:       "131-21765-6",
      direccion: "Playa Juan de Bolanos Bugalow #3, Montecristi",
      telefono:  "809-961-6343",
    };
    const empresa = (empresaSnap.exists && empresaSnap.data()?.rnc)
      ? empresaSnap.data() as typeof EMPRESA_FALLBACK
      : EMPRESA_FALLBACK;

    // Evitar re-envíos
    if (factura.estadoDGII && factura.estadoDGII !== "pendiente") {
      return NextResponse.json(
        { error: `Factura ya procesada: ${factura.estadoDGII}` },
        { status: 400 }
      );
    }

    // 4. Cargar cliente si aplica
    // E43 y E47 no tienen comprador con RNC — clienteId puede estar vacío
    let cliente: Cliente | undefined;
    if (factura.clienteId && factura.clienteId !== "walk-in") {
      const snap = await adminDb.collection("clientes").doc(factura.clienteId).get();
      if (snap.exists) cliente = { id: snap.id, ...snap.data() } as Cliente;
    }

    // 5. Calcular totales
    const totales = calcTotales(factura.items);
    const esRFCE  = factura.tipoECF === "E32" && totales.total < LIMITE_RFCE;

    // Validar FechaVencimientoSecuencia — obligatorio en XSD, fallaría si está vacío
    // El UI guarda YYYY-MM-DD; si llega vacío usamos un fallback razonable
    if (!factura.vencimientoECF) {
      // Fallback: 5 años desde hoy para no bloquear el envío
      const d = new Date();
      d.setFullYear(d.getFullYear() + 5);
      const pad = (n: number) => String(n).padStart(2, "0");
      (factura as unknown as Record<string, unknown>).vencimientoECF =
        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      console.warn("[DGII/emitir] vencimientoECF vacío — usando fallback:", factura.vencimientoECF);
    }

    // 6. Construir + firmar XML principal
    const xmlSinFirma = buildXML(factura, cliente, empresa);
    const xmlFirmado  = await firmarXML(xmlSinFirma);

    // 7. Extraer SignatureValue para el QR y el código de seguridad
    const sigMatch = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    const signatureValue = sigMatch?.[1]?.replace(/\s/g, "") ?? "";

    // El código de seguridad que imprime la factura = SHA-256 del SignatureValue (primeros 6 chars)
    // Mismo cálculo que usa el QR — así coinciden siempre
    const codigoSeguridad = calcularCodigoSeguridad(signatureValue);

    let trackId:    string;
    let estadoDGII: string;

    if (esRFCE) {
      // E32 < RD$250,000 → enviar el resumen RFCE primero (por fc.dgii.gov.do)
      // La factura completa se sube manualmente al portal de DGII después de que el resumen sea aceptado
      // CodigoSeguridadeCF = primeros 6 chars del SignatureValue del ECF (no SHA256)
      const codigoSeguridadRFCE = signatureValue.substring(0, 6);
      const rfceXml     = buildRFCEXml(factura, empresa, codigoSeguridadRFCE, cliente); // CodigoSeguridadeCF requerido por XSD
      const rfceFirmado = await firmarXML(rfceXml);
      const resultado   = await enviarRFCE(rfceFirmado, tokenManual, factura.eCF);

      trackId    = resultado.trackId;
      estadoDGII = resultado.estado || "Enviado"; // "Enviado" mientras se procesa, no "Aceptado"
    } else {
      // Todos los demás tipos: enviar eCF completo
      trackId    = await enviarECF(xmlFirmado, tokenManual, factura.eCF);
      estadoDGII = "Enviado";
    }

    // 8. Generar URL del timbre QR
    const fechaEmision = formatFechaQR(factura.fecha);
    const fechaFirma   = formatFechaHoraQR(new Date().toISOString());
    const urlQR = generarURLQR({
      tipoECF:       factura.tipoECF,
      rncEmisor:     fmtRNC(empresa.rnc),
      // rncComprador: cliente registrado > rncCompradorOcasional (E32 ≥ 250k) > undefined
      rncComprador:  cliente?.rnc
        ? fmtRNC(cliente.rnc)
        : factura.rncCompradorOcasional
          ? factura.rncCompradorOcasional.replace(/\D/g, "")
          : undefined,
      eNCF:          factura.eCF,
      fechaEmision,
      montoTotal:    totales.total,
      fechaFirma,
      signatureValue,
      esRFCE,
    });

    // 9. Guardar todo en Firestore
    await adminDb.collection("facturas").doc(facturaId).update({
      estadoDGII,
      trackIdDGII:    trackId,
      xmlFirmado,
      urlQR,
      codigoSeguridad,          // SHA-256 correcto, coincide con el QR
      fechaEnvioDGII: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, trackId, estadoDGII, urlQR, codigoSeguridad });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[DGII/emitir]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}