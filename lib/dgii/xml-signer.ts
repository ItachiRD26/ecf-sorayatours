// Firma digital de XML con certificado .p12 usando node-forge
// Implementa el estándar XML Digital Signature (XMLDSig) con RSA-SHA256

import * as forge from "node-forge";

function getCertPassword(): string {
  return process.env.DGII_CERT_PASSWORD ?? "";
}

function getCertBase64(): string {
  const b64 = process.env.DGII_CERT_BASE64;
  if (!b64) throw new Error("DGII_CERT_BASE64 no está configurado en .env.local");
  return b64;
}

// Cargar el certificado .p12 desde la variable de entorno
function loadP12(): { privateKey: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate } {
  const certB64  = getCertBase64();
  const certPass = getCertPassword();
  const certDer  = forge.util.decode64(certB64);
  const certAsn1 = forge.asn1.fromDer(certDer);
  const p12      = forge.pkcs12.pkcs12FromAsn1(certAsn1, false, certPass);

  // Extraer clave privada
  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag   = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del certificado");
  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

  // Extraer certificado X509
  const certBags  = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag   = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado X509");
  const cert = certBag.cert;

  return { privateKey, cert };
}

// Canonicalizar XML (C14N simple — elimina espacios innecesarios)
function canonicalize(xml: string): string {
  return xml
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+xmlns:/g, " xmlns:")
    .trim();
}

// Extraer el PEM del certificado (sin headers)
function getCertPem(cert: forge.pki.Certificate): string {
  const pem = forge.pki.certificateToPem(cert);
  return pem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\n/g, "")
    .trim();
}

// ── Firmar XML del e-CF (estructura XMLDSig con RSA-SHA256) ───────
export async function firmarXML(xmlSinFirma: string): Promise<string> {
  const { privateKey, cert } = loadP12();

  // 1. Canonicalizar el XML
  const xmlCanonical = canonicalize(xmlSinFirma);

  // 2. Calcular DigestValue (SHA-256 del XML canonicalizado)
  const md = forge.md.sha256.create();
  md.update(xmlCanonical, "utf8");
  const digestValue = forge.util.encode64(md.digest().bytes());

  // 3. Construir el bloque SignedInfo
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 4. Firmar el SignedInfo con RSA-SHA256
  const mdSig = forge.md.sha256.create();
  mdSig.update(canonicalize(signedInfo), "utf8");
  const signatureBytes = privateKey.sign(mdSig);
  const signatureValue = forge.util.encode64(signatureBytes);

  // 5. Obtener el PEM del certificado
  const certPem = getCertPem(cert);

  // 6. Construir el bloque Signature completo
  const signatureBlock =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo>` +
    `<X509Data>` +
    `<X509Certificate>${certPem}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>` +
    `</Signature>`;

  // 7. Insertar la firma antes del cierre del elemento raíz
  const closingTag = xmlSinFirma.lastIndexOf("</ECF>");
  if (closingTag === -1) {
    throw new Error("El XML no tiene el elemento raíz </ECF>");
  }

  return (
    xmlSinFirma.substring(0, closingTag) +
    signatureBlock +
    xmlSinFirma.substring(closingTag)
  );
}

// ── Firmar la semilla DGII (XML de semilla) ───────────────────────
export async function firmarSemilla(semillaXml: string): Promise<string> {
  const { privateKey, cert } = loadP12();

  const xmlCanonical = canonicalize(semillaXml);

  // DigestValue del XML de semilla
  const md = forge.md.sha256.create();
  md.update(xmlCanonical, "utf8");
  const digestValue = forge.util.encode64(md.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const mdSig = forge.md.sha256.create();
  mdSig.update(canonicalize(signedInfo), "utf8");
  const signatureBytes = privateKey.sign(mdSig);
  const signatureValue = forge.util.encode64(signatureBytes);
  const certPem        = getCertPem(cert);

  const signatureBlock =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo>` +
    `<X509Data>` +
    `<X509Certificate>${certPem}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>` +
    `</Signature>`;

  // Insertar firma en la semilla antes del cierre del elemento raíz
  const rootClose = semillaXml.lastIndexOf("</SemillaModel>");
  if (rootClose === -1) throw new Error("XML de semilla inválido");

  return (
    semillaXml.substring(0, rootClose) +
    signatureBlock +
    semillaXml.substring(rootClose)
  );
}