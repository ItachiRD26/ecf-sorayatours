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
    const snap = await adminDb.collection("facturas").doc(facturaId).get();
    if (!snap.exists) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

    const factura = snap.data()!;
    const empresa = (await adminDb.collection("config").doc("empresa").get()).data()!;

    // Construir XML de anulación (ANECF)
    const xmlAnulacion = `<?xml version="1.0" encoding="UTF-8"?>
<ANECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <RNCEmisor>${empresa.rnc.replace(/\D/g, "")}</RNCEmisor>
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

    const xmlFirmado = await firmarXML(
      xmlAnulacion.replace("</ANECF>", "").replace("</ANECF>", "") + "</ANECF>"
    );

    await anularENCF(xmlFirmado);

    await adminDb.collection("facturas").doc(facturaId).update({
      estadoDGII:     "Anulada",
      fechaAnulacion: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[DGII/anular]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}