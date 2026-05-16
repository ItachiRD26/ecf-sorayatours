// Endpoint temporal de diagnóstico — BORRAR después de certificación
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import * as forge   from "node-forge";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const b64  = process.env.DGII_CERT_BASE64 ?? "";
  const pass = process.env.DGII_CERT_PASSWORD ?? "";
  const info: Record<string, unknown> = {};

  // 1. ¿Existe la variable?
  info.base64_presente    = b64.length > 0;
  info.base64_largo       = b64.length;
  info.password_presente  = pass.length > 0;

  // 2. ¿Es base64 válido?
  try {
    const der = forge.util.decode64(b64);
    info.der_bytes          = der.length;
    info.base64_valido      = true;

    // 3. ¿Parsea como PKCS12?
    try {
      const asn1 = forge.asn1.fromDer(der);
      const p12  = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);
      info.p12_parseable = true;

      // 4. ¿Tiene clave privada?
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      info.clave_privada_encontrada = !!keyBag?.key;

      // Si la clave está en keyBag en vez de pkcs8ShroudedKeyBag
      if (!keyBag?.key) {
        const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
        const keyBag2  = keyBags2[forge.pki.oids.keyBag]?.[0];
        info.clave_keyBag_encontrada = !!keyBag2?.key;
      }

      // 5. ¿Tiene certificado?
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag  = certBags[forge.pki.oids.certBag]?.[0];
      info.certificado_encontrado = !!certBag?.cert;

      if (certBag?.cert) {
        const cert  = certBag.cert;
        const subj  = cert.subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(", ");
        const iss   = cert.issuer.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(", ");
        info.cert_subject   = subj;
        info.cert_issuer    = iss;
        info.cert_serial    = cert.serialNumber;
        info.cert_validFrom = cert.validity.notBefore;
        info.cert_validTo   = cert.validity.notAfter;
        info.cert_expirado  = new Date() > cert.validity.notAfter;

        // 6. ¿El SN coincide con el RNC?
        const snAttr = cert.subject.attributes.find((a: any) => a.name === "serialName" || a.shortName === "SN");
        info.cert_SN = snAttr?.value ?? "no encontrado";
      }

    } catch (p12err: unknown) {
      info.p12_parseable = false;
      info.p12_error = p12err instanceof Error ? p12err.message : String(p12err);
      info.posible_causa = "Contraseña incorrecta o archivo .p12 corrupto";
    }

  } catch (b64err: unknown) {
    info.base64_valido = false;
    info.base64_error  = b64err instanceof Error ? b64err.message : String(b64err);
    info.posible_causa = "El valor de DGII_CERT_BASE64 no es base64 válido";
  }

  // 7. Probar obtener semilla (sin firmar)
  try {
    const amb = process.env.DGII_AMBIENTE ?? "testecf";
    const base = amb === "certecf"
      ? "https://ecf.dgii.gov.do/certecf"
      : "https://ecf.dgii.gov.do/testecf";

    const res = await fetch(`${base}/autenticacion/api/autenticacion/semilla`, {
      headers: { accept: "*/*" },
    });
    info.semilla_status    = res.status;
    info.semilla_reachable = res.ok;
    if (res.ok) {
      const xml = await res.text();
      info.semilla_xml = xml.substring(0, 200);
    }
  } catch (e: unknown) {
    info.semilla_reachable = false;
    info.semilla_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(info, { status: 200 });
}