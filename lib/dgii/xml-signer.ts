// Firmado de e-CF — XMLDSig con node-forge (carga del .p12) + xml-crypto (firma)
// Algoritmos exigidos por DGII: RSA-SHA256 + C14N 2001 + SHA256 digest + enveloped-signature
// (ver documentacion dgii/Firmado de e-CF.pdf)
//
// El digest se calcula con un paso adicional (DgiiDigest) porque el validador de
// DGII espera la forma canonicalizada SIN nodos de texto de solo whitespace y con
// los atributos xmlns ordenados alfabéticamente — la canonicalización C14N
// estándar de xml-crypto no hace ninguna de las dos cosas, lo cual descuadra el
// DigestValue. Enfoque confirmado contra una implementación de terceros probada
// en producción (github.com/victors1681/dgii-ecf).

import * as forge      from "node-forge";
import * as fs         from "fs";
import * as crypto     from "crypto";
import { SignedXml }   from "xml-crypto";
import { DOMParser }   from "@xmldom/xmldom";

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

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let   keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    const kb2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag    = kb2[forge.pki.oids.keyBag]?.[0] as typeof keyBag;
  }
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del .p12");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);
  const certPem       = forge.pki.certificateToPem(certBag.cert);

  return { privateKeyPem, certPem };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

// Elimina comentarios y nodos de texto de solo whitespace (recursivo).
function cleanNodes(node: AnyNode): void {
  for (let n = 0; n < node.childNodes.length; n++) {
    const child = node.childNodes[n];
    if (child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue))) {
      node.removeChild(child);
      n--;
    } else if (child.nodeType === 1) {
      cleanNodes(child);
    }
  }
}

// Digest personalizado: re-parsea el XML ya canonicalizado/transformado por
// xml-crypto, ordena alfabéticamente los atributos xmlns del elemento raíz
// (DGII espera xsd antes de xsi, no el orden original del documento) y aplica
// SHA-256 sobre la serialización resultante.
class DgiiDigest {
  getHash(xml: string): string {
    const doc  = new DOMParser().parseFromString(xml, "text/xml") as AnyNode;
    const root = doc.childNodes[0] as AnyNode;
    const sorted = Array.from(root.attributes as ArrayLike<unknown>).sort((a, b) =>
      (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0,
    );
    Object.assign(root.attributes, sorted);
    const shasum = crypto.createHash("sha256");
    shasum.update(doc.toString(), "utf8");
    return shasum.digest("base64");
  }
  getAlgorithmName(): string {
    return "http://www.w3.org/2001/04/xmlenc#sha256";
  }
}

// ── Firmado principal ─────────────────────────────────────────────────────────
export async function firmarXML(xmlOriginal: string): Promise<string> {
  const { privateKeyPem, certPem } = loadCertAndKey();

  const doc = new DOMParser().parseFromString(xmlOriginal, "text/xml") as AnyNode;
  cleanNodes(doc);
  const rootName = doc.documentElement.tagName as string;

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  // Registrado bajo una URI propia para que xml-crypto invoque nuestro
  // DgiiDigest en vez de su SHA-256 nativo — el <DigestMethod> resultante
  // sigue declarando la URI estándar via getAlgorithmName().
  sig.HashAlgorithms["http://dgii-digest"] = DgiiDigest as unknown as new () => InstanceType<typeof DgiiDigest>;

  sig.addReference({
    xpath: `//*[local-name(.)='${rootName}']`,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://dgii-digest",
    isEmptyUri: true,
  });

  sig.computeSignature(doc.toString(), {
    location: { reference: "/*", action: "append" },
  });

  return sig.getSignedXml();
}

// Alias para firmar la semilla de autenticación
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}
