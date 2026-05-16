import * as forge from "node-forge";

function loadP12() {
  const b64  = process.env.DGII_CERT_BASE64;
  const pass = process.env.DGII_CERT_PASSWORD ?? "";
  if (!b64) throw new Error("DGII_CERT_BASE64 no configurado");

  const der   = forge.util.decode64(b64);
  const asn1  = forge.asn1.fromDer(der);
  const p12   = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);

  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag   = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado");

  return {
    privateKey: keyBag.key as forge.pki.rsa.PrivateKey,
    cert:       certBag.cert,
  };
}

// C14N simple — elimina saltos de línea extra, normaliza atributos
function c14n(xml: string): string {
  return xml
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function getCertPem(cert: forge.pki.Certificate): string {
  return forge.pki.certificateToPem(cert)
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\n/g, "")
    .trim();
}

function buildSignatureBlock(
  digestValue:    string,
  signatureValue: string,
  certPem:        string,
): string {
  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>` +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo>` +
    `<X509Data>` +
    `<X509Certificate>${certPem}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>` +
    `</Signature>`
  );
}

export async function firmarXML(xml: string): Promise<string> {
  const { privateKey, cert } = loadP12();
  const certPem = getCertPem(cert);

  // 1. Canonicalizar el XML original
  const xmlC14n = c14n(xml);

  // 2. DigestValue = SHA256(XML canonicalizado)
  const mdDigest = forge.md.sha256.create();
  mdDigest.update(xmlC14n, "utf8");
  const digestValue = forge.util.encode64(mdDigest.digest().bytes());

  // 3. Construir el bloque SignedInfo con el DigestValue
  const signedInfoXml =
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

  // 4. SignatureValue = RSA-SHA256(C14N(SignedInfo))
  const signedInfoC14n = c14n(signedInfoXml);
  const mdSig = forge.md.sha256.create();
  mdSig.update(signedInfoC14n, "utf8");
  const signatureBytes  = privateKey.sign(mdSig);
  const signatureValue  = forge.util.encode64(signatureBytes);

  // 5. Construir bloque Signature completo
  const signatureBlock = buildSignatureBlock(digestValue, signatureValue, certPem);

  // 6. Insertar la firma antes del cierre del elemento raíz
  const lastClose = xml.lastIndexOf("</");
  const closeTag  = xml.substring(lastClose);
  const body      = xml.substring(0, lastClose);

  return body + signatureBlock + closeTag;
}

// Alias — la semilla usa el mismo proceso
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}