import { NextRequest, NextResponse }  from "next/server";
import { adminAuth, adminDb }         from "@/lib/firebase-admin";
import { buildXML }                   from "@/lib/dgii/xml-builder";
import { firmarXML }                  from "@/lib/dgii/xml-signer";
import { enviarECF }                  from "@/lib/dgii/dgii-client";
import { generarURLQR, formatFechaQR, formatFechaHoraQR, calcularCodigoSeguridad } from "@/lib/dgii/qr-builder";
import type { Factura, Cliente, LineaServicio, TipoECF } from "@/types";
import { calcTotales } from "@/types";

type CertTipoECF = "E43" | "E44" | "E45" | "E46" | "E47";

// TODO(cert): Eliminar CERT_USADOS_ECF una vez completado el proceso de certificación DGII.
const CERT_USADOS_ECF: Record<CertTipoECF, Set<number>> = {
  E43: new Set([9, 10, 11]),
  E44: new Set([7, 11]),
  E45: new Set([1, 9]),
  E46: new Set([1, 2, 11]),
  E47: new Set([1, 8, 9]),
};

async function nextSeq(tipo: CertTipoECF): Promise<number> {
  const ref = adminDb.collection("config").doc("secuencias");
  return adminDb.runTransaction(async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists ? ((snap.data() as Record<string, number>)[tipo] ?? 0) : 0;
    const blocked = CERT_USADOS_ECF[tipo];
    let next = current + 1;
    // TODO(cert): Eliminar este bloque junto con CERT_USADOS_ECF al finalizar certificación.
    while (blocked.has(next)) next++;
    tx.set(ref, { [tipo]: next }, { merge: true });
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

    const body = await req.json();
    const {
      tipoECF, descripcion, monto, itbisRate = 0,
      rncComprador, nombreComprador,
      idExtranjero, nombreExtranjero,
      fecha, vencimientoECF: vencBody, token,
    } = body as Record<string, unknown>;

    const TIPOS_VALIDOS: CertTipoECF[] = ["E43","E44","E45","E46","E47"];
    if (!TIPOS_VALIDOS.includes(tipoECF as CertTipoECF)) {
      return NextResponse.json({ error: `Tipo no válido: ${tipoECF}` }, { status: 400 });
    }

    const tipo = tipoECF as CertTipoECF;

    if (!descripcion || !monto || Number(monto) <= 0) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const rncClean      = String(rncComprador  ?? "").replace(/\D/g, "");
    const idExtStr      = String(idExtranjero  ?? "").trim();
    const nomExtStr     = String(nombreExtranjero ?? "").trim();
    const needsComprador  = ["E44","E45"].includes(tipo) || (tipo === "E46" && !idExtStr);
    const needsExtranjero = tipo === "E47" || (tipo === "E46" && !!idExtStr);

    if (needsComprador) {
      if (rncClean.length !== 9 && rncClean.length !== 11)
        return NextResponse.json({ error: "RNC debe tener 9 u 11 dígitos" }, { status: 400 });
      if (!String(nombreComprador ?? "").trim())
        return NextResponse.json({ error: "Nombre del comprador requerido" }, { status: 400 });
    }
    if (needsExtranjero) {
      if (!idExtStr || !nomExtStr)
        return NextResponse.json({ error: "Identificador y nombre del extranjero requeridos" }, { status: 400 });
    }

    // Empresa
    const EMPRESA_FALLBACK = {
      nombre:    "SORAYA Y LEONARDO TOURS SRL",
      rnc:       "131-21765-6",
      direccion: "Playa Juan de Bolanos Bugalow #3, Montecristi",
      telefono:  "809-961-6343",
    };
    const empresaSnap = await adminDb.collection("config").doc("empresa").get();
    const empresa = (empresaSnap.exists && empresaSnap.data()?.rnc)
      ? empresaSnap.data() as typeof EMPRESA_FALLBACK
      : EMPRESA_FALLBACK;
    const vencimientoECF: string = String(vencBody ?? "") || (empresaSnap.data()?.vencimientoECF as string | undefined) || "2028-12-31";

    // Secuencia
    const seq     = await nextSeq(tipo);
    const eCF     = `${tipo}${String(seq).padStart(10, "0")}`;
    const fechaStr = String(fecha ?? "") || new Date().toISOString().split("T")[0];

    // Línea de servicio
    const item: LineaServicio = {
      codigo:         tipo,
      descripcion:    String(descripcion).substring(0, 80),
      modo:           "por_grupo",
      cant:           1,
      pax:            1,
      precio:         Number(monto),
      descuentoMonto: 0,
      itbis:          Number(itbisRate),
    };

    // Upsert comprador si necesita
    let clienteId = "N/A";
    let cliente: Cliente | undefined;

    if (needsComprador) {
      const provQuery = await adminDb.collection("clientes").where("rnc", "==", rncClean).limit(1).get();
      if (!provQuery.empty) {
        clienteId = provQuery.docs[0].id;
      } else {
        const provRef = adminDb.collection("clientes").doc();
        await provRef.set({
          rnc: rncClean, nombre: String(nombreComprador),
          tipo: rncClean.length === 9 ? "juridica" : "fisica",
          direccion: "", ciudad: "", contacto: "", telefono: "",
          creadoEn: new Date().toISOString(),
        });
        clienteId = provRef.id;
      }
      cliente = {
        id: clienteId, rnc: rncClean, nombre: String(nombreComprador),
        tipo: rncClean.length === 9 ? "juridica" : "fisica",
        direccion: "", ciudad: "", contacto: "", telefono: "",
      };
    }

    const facturaRef = adminDb.collection("facturas").doc();
    const factura: Factura = {
      id:             facturaRef.id,
      noFactura:      `${tipo}-${String(seq).padStart(6, "0")}`,
      eCF,
      tipoECF:        tipo as TipoECF,
      fecha:          fechaStr,
      vencimientoECF,
      terminos:       "Contado",
      clienteId,
      estado:         "pendiente",
      estadoDGII:     "pendiente",
      items:          [item],
      creadoEn:       new Date().toISOString(),
      creadoPor:      uid,
      ...(idExtStr  ? { idTransaccion: idExtStr  } : {}),
      ...(nomExtStr ? { nombreConsumidor: nomExtStr } : {}),
    };

    await facturaRef.set(factura);

    // Construir + firmar XML
    const xmlSinFirma = buildXML(factura, cliente, empresa);
    console.log(`[crear-ecf/${tipo}] XML sin firma:\n`, xmlSinFirma);
    const xmlFirmado  = await firmarXML(xmlSinFirma);

    const sigMatch        = xmlFirmado.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    const signatureValue  = sigMatch?.[1]?.replace(/\s/g, "") ?? "";
    const codigoSeguridad = calcularCodigoSeguridad(signatureValue);

    // Enviar a DGII
    const trackId = await enviarECF(xmlFirmado, token as string, eCF);

    // URL QR
    const totales = calcTotales(factura.items);
    const urlQR   = generarURLQR({
      tipoECF:      tipo,
      rncEmisor:    empresa.rnc.replace(/\D/g, ""),
      rncComprador: rncClean || "",
      eNCF:         eCF,
      fechaEmision: formatFechaQR(fechaStr),
      montoTotal:   totales.total,
      fechaFirma:   formatFechaHoraQR(new Date().toISOString()),
      signatureValue,
      esRFCE:       false,
    });

    // Actualizar Factura
    await facturaRef.update({
      estadoDGII:     "Enviado",
      trackIdDGII:    trackId,
      xmlFirmado,
      urlQR,
      codigoSeguridad,
      fechaEnvioDGII: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true, facturaId: facturaRef.id, eCF, trackId, montoTotal: totales.total,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/crear-ecf]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
