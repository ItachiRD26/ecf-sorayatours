// Firmado de e-CF usando xml-crypto 3.x (implementación estándar XMLDSig)
// C14N correcto con propagación de namespaces
// Orden estándar: SignedInfo → SignatureValue → KeyInfo (según ejemplo DGII oficial)

import { SignedXml }  from "xml-crypto";
import * as forge     from "node-forge";
import * as fs        from "fs";

// ── Carga del certificado P12 ─────────────────────────────────────────────────
function loadCertAndKey(): { privateKeyPem: string; certBase64: string } {
  const pass     = process.env.DGII_CERT_PASSWORD ?? "";
  const certPath = process.env.DGII_CERT_PATH;
  const b64      = process.env.DGII_CERT_BASE64;

  let derBytes: string;
  if (certPath) {
    const buf = fs.readFileSync(certPath);
    derBytes  = buf.toString("binary");
  } else if (b64) {
    derBytes = forge.util.decode64(b64);
  } else {
    throw new Error("Configurar DGII_CERT_PATH o DGII_CERT_BASE64 en .env");
  }

  const asn1 = forge.asn1.fromDer(derBytes);
  const p12  = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);

  // Extraer clave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let   keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    const kb2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag    = kb2[forge.pki.oids.keyBag]?.[0] as typeof keyBag;
  }
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);

  // Extraer certificado → base64 limpio
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const certPem    = forge.pki.certificateToPem(certBag.cert);
  const certBase64 = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/[\r\n]/g, "");

  return { privateKeyPem, certBase64 };
}

// ── Firmado principal ─────────────────────────────────────────────────────────
export async function firmarXML(xml: string): Promise<string> {
  const { privateKeyPem, certBase64 } = loadCertAndKey();

  // Detectar elemento raíz (ECF, RFCE, Semilla, etc.)
  const rootMatch = xml.match(/<([A-Za-z][A-Za-z0-9]*)[\s>/]/);
  const rootName  = rootMatch?.[1] ?? "ECF";

  // xml-crypto 3.x — API correcta
  const sig = new SignedXml({
    privateKey:                privateKeyPem,
    signatureAlgorithm:        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    // KeyInfo con X509Certificate según ejemplo oficial DGII
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
  });

  // Referencia al documento completo con transformación enveloped-signature
  sig.addReference({
    xpath:           `//*[local-name(.)='${rootName}']`,
    transforms:      ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri:             "",
    isEmptyUri:      true,
  });

  sig.computeSignature(xml);
  return sig.getSignedXml();
}

// Alias para firmar la semilla de autenticación
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}