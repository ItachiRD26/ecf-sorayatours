// Firmado de e-CF — implementación manual con node-forge + xmldom
// Sigue exactamente el ejemplo TypeScript oficial de DGII (Firmado_de_eCF.pdf)
// Algoritmos: RSA-SHA256 + C14N 2001 + SHA256 digest + enveloped-signature

import * as forge   from "node-forge";
import * as fs      from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DOMParser } = require("xmldom") as typeof import("@xmldom/xmldom");

// ── Carga del certificado P12 ─────────────────────────────────────────────────
function loadCertAndKey(): { privateKey: forge.pki.rsa.PrivateKey; certBase64: string } {
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

  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

  // Extraer certificado → base64 limpio (sin headers, sin saltos de línea)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  const certPem    = forge.pki.certificateToPem(certBag.cert);
  const certBase64 = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/[\r\n]/g, "");

  return { privateKey, certBase64 };
}

// ── Canonicalización C14N 2001 (compatible con validador DGII) ─────────────────
// Basada en el ejemplo TypeScript de DGII + spec W3C C14N
function c14nNode(node: Node, inheritedNs: Record<string, string> = {}): string {
  // Text / CDATA node
  if (node.nodeType === 3 || node.nodeType === 4) {
    return (node.nodeValue ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r/g, "&#xD;");
  }
  // Comment → ignorar (C14N sin comentarios)
  if (node.nodeType === 8) return "";
  // Solo elementos
  if (node.nodeType !== 1) return "";

  const el    = node as Element;
  const tag   = el.tagName;
  const nsNow = { ...inheritedNs };

  const nsDecls: Array<{ prefix: string; uri: string }> = [];
  const attrs:   Array<{ name: string; value: string }> = [];

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name === "xmlns") {
      if (nsNow[""] !== attr.value) {
        nsDecls.push({ prefix: "", uri: attr.value });
        nsNow[""] = attr.value;
      }
    } else if (attr.name.startsWith("xmlns:")) {
      const prefix = attr.name.slice(6);
      if (nsNow[prefix] !== attr.value) {
        nsDecls.push({ prefix, uri: attr.value });
        nsNow[prefix] = attr.value;
      }
    } else {
      attrs.push({ name: attr.name, value: attr.value });
    }
  }

  // Ordenar ns: default primero, luego por prefix
  nsDecls.sort((a, b) => {
    if (a.prefix === "" && b.prefix !== "") return -1;
    if (a.prefix !== "" && b.prefix === "") return 1;
    return a.prefix.localeCompare(b.prefix);
  });
  // Ordenar atributos lexicográficamente
  attrs.sort((a, b) => a.name.localeCompare(b.name));

  let out = "<" + tag;

  for (const ns of nsDecls) {
    out += ns.prefix === "" ? ` xmlns="${ns.uri}"` : ` xmlns:${ns.prefix}="${ns.uri}"`;
  }
  for (const a of attrs) {
    const v = a.value
      .replace(/&/g,  "&amp;")
      .replace(/</g,  "&lt;")
      .replace(/"/g,  "&quot;")
      .replace(/\r/g, "&#xD;")
      .replace(/\n/g, "&#xA;")
      .replace(/\t/g, "&#x9;");
    out += ` ${a.name}="${v}"`;
  }
  out += ">";

  for (let i = 0; i < el.childNodes.length; i++) {
    out += c14nNode(el.childNodes[i] as Node, nsNow);
  }

  out += "</" + tag + ">";
  return out;
}

function canonicalize(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return c14nNode(doc.documentElement as unknown as Node);
}

// ── Firmado principal ─────────────────────────────────────────────────────────
export async function firmarXML(xmlOriginal: string): Promise<string> {
  const { privateKey, certBase64 } = loadCertAndKey();

  // Detectar tag raíz (ECF, RFCE, Semilla, ANECF…)
  const rootMatch = xmlOriginal.match(/<([A-Za-z][A-Za-z0-9]*)/);
  const rootName  = rootMatch?.[1] ?? "ECF";

  // PASO 1: Canonicalizar el documento original → DigestValue
  const canon1 = canonicalize(xmlOriginal);
  const md1    = forge.md.sha256.create();
  md1.update(canon1, "utf8");
  const digestValue = forge.util.encode64(md1.digest().data);

  // PASO 2: Construir <SignedInfo>
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

  // PASO 3: Canonicalizar <SignedInfo> y firmar con RSA-SHA256
  const canon2       = canonicalize(signedInfoXml);
  const md2          = forge.md.sha256.create();
  md2.update(canon2, "utf8");
  const sigBytes     = privateKey.sign(md2);
  const signatureVal = forge.util.encode64(sigBytes);

  // PASO 4: Ensamblar bloque <Signature>
  const signatureBlock =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      signedInfoXml +
      `<SignatureValue>${signatureVal}</SignatureValue>` +
      `<KeyInfo>` +
        `<X509Data>` +
          `<X509Certificate>${certBase64}</X509Certificate>` +
        `</X509Data>` +
      `</KeyInfo>` +
    `</Signature>`;

  // PASO 5: Insertar firma antes del tag de cierre raíz (igual que ejemplo DGII)
  const closingTag = `</${rootName}>`;
  const idx        = xmlOriginal.lastIndexOf(closingTag);
  if (idx === -1) throw new Error(`Tag de cierre </${rootName}> no encontrado`);

  return xmlOriginal.substring(0, idx) + signatureBlock + xmlOriginal.substring(idx);
}

// Alias para firmar la semilla de autenticación
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}