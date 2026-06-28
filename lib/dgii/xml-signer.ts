// Firmado de e-CF — XMLDSig con node-forge (carga del .p12) + xml-crypto (firma/C14N)
// Algoritmos exigidos por DGII: RSA-SHA256 + C14N 2001 + SHA256 digest + enveloped-signature
// (ver documentacion dgii/Firmado de e-CF.pdf)

import * as forge from "node-forge";
import * as fs    from "fs";
import { SignedXml } from "xml-crypto";

// ── Carga del certificado P12 → PEM ───────────────────────────────────────────
function loadCertAndKey(): { privateKeyPem: string; certPem: string } {
  const pass     = process.env.DGII_CERT_PASSWORD ?? "";
  const certPath = process.env.DGII_CERT_PATH;
  const b64      = process.env.DGII_CERT_BASE64;

  let derBytes: string;
  if (certPath) {
    derBytes = fs.readFileSync(certPath).toString("binary");
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

  // Extraer certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);
  const certPem       = forge.pki.certificateToPem(certBag.cert);

  return { privateKeyPem, certPem };
}

// ── Firmado principal ─────────────────────────────────────────────────────────
// Firma todo el documento (Reference URI="") con transform enveloped-signature,
// igual al ejemplo de referencia oficial de DGII para .net/Java/PHP/TypeScript.
export async function firmarXML(xmlOriginal: string): Promise<string> {
  const { privateKeyPem, certPem } = loadCertAndKey();

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    isEmptyUri: true,
  });

  sig.computeSignature(xmlOriginal, {
    location: { reference: "/*", action: "append" },
  });

  return sig.getSignedXml();
}

// Alias para firmar la semilla de autenticación
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}
