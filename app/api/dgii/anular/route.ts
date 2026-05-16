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

    // ANECF — formato de anulación según XSD de DGII
    const xmlAnulacion = `<?xml version="1.0" encoding="UTF-8"?>
<ANECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <RNCEmisor>${rnc}</RNCEmisor>
      <TipoAnulacion>1</TipoAnulacion>
    </IdDoc>
  </Encabezado>
  <DetalleAnulacion>
    <ItemAnulacion>
      <eNCFDesde>${factura.eCF}</eNCFDesde>
      <eNCFHasta>${factura.eCF}</eNCFHasta>
    </ItemAnulacion>
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