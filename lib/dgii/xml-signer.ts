import { SignedXml } from "xml-crypto";
import * as forge    from "node-forge";

function loadP12(): { privateKeyPem: string; certBase64: string } {
  const b64  = process.env.DGII_CERT_BASE64;
  const pass = process.env.DGII_CERT_PASSWORD ?? "";
  if (!b64) throw new Error("DGII_CERT_BASE64 no configurado en .env");

  const der  = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(der);
  const p12  = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del .p12");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);
  const certBase64    = forge.pki.certificateToPem(certBag.cert)
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");

  return { privateKeyPem, certBase64 };
}

export async function firmarXML(xml: string): Promise<string> {
  const { privateKeyPem, certBase64 } = loadP12();

  // Detectar nombre del elemento raíz (ECF, RFCE, ANECF, semilla, etc.)
  // Se necesita porque xml-crypto usa XPath para ubicar el nodo a firmar
  // y si no hay xpath explícito intenta evaluar uri="" como XPath → error
  const rootName = (xml.match(/<([A-Za-z][A-Za-z0-9]*)[\s>/]/) ?? [, "ECF"])[1]!;
  const rootXPath = `//*[local-name(.)='${rootName}']`;

  const sig = new SignedXml({
    privateKey:                privateKeyPem,
    signatureAlgorithm:        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  sig.addReference({
    // xpath → cómo xml-crypto ENCUENTRA el nodo a firmar internamente
    // uri   → qué va en <Reference URI=""> en el XML de salida (vacío = documento completo)
    xpath:           rootXPath,
    uri:             "",
    isEmptyUri:      true,
    transforms:      ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

  // location.reference → dónde insertar el bloque <Signature> en el XML
  sig.computeSignature(xml, {
    location: { reference: rootXPath, action: "append" },
  });

  return sig.getSignedXml();
}

export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}