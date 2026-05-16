// Firma XMLDSig con C14N real según el estándar W3C
// Usa xml-crypto que implementa correctamente la canonicalización requerida por DGII
// El error "Firma del certificado invalida" ocurría porque node-forge sola no hace C14N correcto

import { SignedXml }  from "xml-crypto";
import * as forge     from "node-forge";

// ─── Cargar P12 y devolver PEMs ───────────────────────────────────────────────
function loadP12(): { privateKeyPem: string; certPem: string; certBase64: string } {
  const b64  = process.env.DGII_CERT_BASE64;
  const pass = process.env.DGII_CERT_PASSWORD ?? "";
  if (!b64) throw new Error("DGII_CERT_BASE64 no configurado en .env");

  const der  = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(der);
  const p12  = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);

  // Clave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del certificado");

  // Certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);
  const certPem       = forge.pki.certificateToPem(certBag.cert);
  const certBase64    = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");

  return { privateKeyPem, certPem, certBase64 };
}

// ─── Firma principal ──────────────────────────────────────────────────────────
// xml-crypto aplica C14N (http://www.w3.org/TR/2001/REC-xml-c14n-20010315)
// antes de calcular el DigestValue y de firmar el SignedInfo,
// que es exactamente lo que DGII valida al recibir el comprobante.
export async function firmarXML(xml: string): Promise<string> {
  const { privateKeyPem, certBase64 } = loadP12();

  const sig = new SignedXml({
    privateKey:              privateKeyPem,
    signatureAlgorithm:      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  // Referencia al documento completo (URI="") con transform enveloped
  sig.addReference({
    uri:             "",
    transforms:      ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  // KeyInfo con el certificado X509
  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

  // Calcular firma e insertar al final del elemento raíz
  sig.computeSignature(xml, {
    location: { reference: "/*", action: "append" },
  });

  return sig.getSignedXml();
}

// Alias — la semilla usa el mismo proceso de firma
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}