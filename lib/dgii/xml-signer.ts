import * as forge from "node-forge";
import { SignedXml } from "xml-crypto";

function getCertPassword(): string {
  return process.env.DGII_CERT_PASSWORD ?? "";
}

function getCertBase64(): string {
  const b64 = process.env.DGII_CERT_BASE64;
  if (!b64) throw new Error("DGII_CERT_BASE64 no configurado");
  return b64;
}

function loadP12() {
  const certB64  = getCertBase64();
  const certPass = getCertPassword();
  const certDer  = forge.util.decode64(certB64);
  const certAsn1 = forge.asn1.fromDer(certDer);
  const p12      = forge.pkcs12.pkcs12FromAsn1(certAsn1, false, certPass);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada");
  const privateKey = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado");
  const certPem = forge.pki.certificateToPem(certBag.cert);

  return { privateKeyPem: privateKey, certPem };
}

export async function firmarXML(xml: string): Promise<string> {
  const { privateKeyPem, certPem } = loadP12();

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
  });

  sig.addReference({
  uri:                 "",
  digestAlgorithm:     "http://www.w3.org/2001/04/xmlenc#sha256",
  transforms:          ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
  digestValue:         "",
  inclusiveNamespacesPrefixList: [],
  isEmptyUri:          true,
});

  sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  sig.signatureAlgorithm        = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

  sig.computeSignature(xml, {
    location: { reference: "", action: "append" },
  });

  return sig.getSignedXml();
}

export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}