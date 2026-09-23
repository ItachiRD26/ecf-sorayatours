import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { anularENCF }                from "@/lib/dgii/dgii-client";
import { firmarXML }                 from "@/lib/dgii/xml-signer";

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

    const { facturaId } = await req.json();
    if (!facturaId) return NextResponse.json({ error: "facturaId requerido" }, { status: 400 });

    const [facturaSnap, empresaSnap] = await Promise.all([
      adminDb.collection("facturas").doc(facturaId).get(),
      adminDb.collection("config").doc("empresa").get(),
    ]);

    if (!facturaSnap.exists) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    const factura = facturaSnap.data()!;
    const empresa = empresaSnap.data()!;
    const rnc     = (empresa.rnc as string).replace(/\D/g, "");

    // El servicio de Anulación (ANECF) de la DGII SOLO acepta secuencias que
    // nunca fueron enviadas a la DGII ni al receptor (ver Informe Técnico e-CF
    // "10. Correcciones y Anulación de un e-CF" y "Formato de Anulación de
    // e-NCF v1.0"). Un e-CF ya transmitido/aceptado no se puede anular así —
    // la DGII exige una Nota de Crédito Electrónica (E34) para esos casos.
    const yaEnviada = !!factura.estadoDGII && factura.estadoDGII !== "pendiente";
    if (yaEnviada) {
      return NextResponse.json(
        { error: "Este e-CF ya fue transmitido a la DGII. La DGII no permite anularlo con ANECF — emite una Nota de Crédito (E34) que lo referencie." },
        { status: 409 }
      );
    }

    const tipoNum = parseInt(String(factura.tipoECF).replace(/\D/g, ""), 10);
    const ahora   = new Date();
    const pad     = (n: number) => String(n).padStart(2, "0");
    const fechaHoraAnulacion =
      `${pad(ahora.getDate())}-${pad(ahora.getMonth() + 1)}-${ahora.getFullYear()} ` +
      `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;

    // ANECF — formato según XSD oficial de DGII (ANECF v1.0.xsd)
    const xmlAnulacion = `<?xml version="1.0" encoding="UTF-8"?>
<ANECF>
  <Encabezado>
    <Version>1.0</Version>
    <RncEmisor>${rnc}</RncEmisor>
    <CantidadeNCFAnulados>1</CantidadeNCFAnulados>
    <FechaHoraAnulacioneNCF>${fechaHoraAnulacion}</FechaHoraAnulacioneNCF>
  </Encabezado>
  <DetalleAnulacion>
    <Anulacion>
      <NoLinea>1</NoLinea>
      <TipoeCF>${tipoNum}</TipoeCF>
      <TablaRangoSecuenciasAnuladaseNCF>
        <Secuencias>
          <SecuenciaeNCFDesde>${factura.eCF}</SecuenciaeNCFDesde>
          <SecuenciaeNCFHasta>${factura.eCF}</SecuenciaeNCFHasta>
        </Secuencias>
      </TablaRangoSecuenciasAnuladaseNCF>
      <CantidadeNCFAnulados>1</CantidadeNCFAnulados>
    </Anulacion>
  </DetalleAnulacion>
</ANECF>`;

    // firmarXML inserta la firma antes del último tag de cierre (</ANECF>)
    const xmlFirmado = await firmarXML(xmlAnulacion);
    await anularENCF(xmlFirmado);

    await adminDb.collection("facturas").doc(facturaId).update({
      estadoDGII:     "Anulada",
      estado:         "anulada",
      fechaAnulacion: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[DGII/anular]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}