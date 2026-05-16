// Implementación EXACTA del algoritmo de firmado TypeScript de la DGII
// Fuente: "Firmado Comprobantes Fiscales Electrónicos (e-CF)" — Impuestos Internos
// Usa xmldom + node-forge tal como el documento oficial indica
// NO usa xml-crypto para evitar diferencias de canonicalización

import * as forge  from "node-forge";
import { DOMParser } from "xmldom";

// ─── Carga del certificado P12 ────────────────────────────────────────────────
// Soporta dos modos:
// 1. DGII_CERT_PATH = ruta al archivo .p12 en el VPS (preferido, más confiable)
// 2. DGII_CERT_BASE64 = certificado en base64 (fallback)
function loadP12(): { privateKey: forge.pki.rsa.PrivateKey; certBase64: string } {
  const pass     = process.env.DGII_CERT_PASSWORD ?? "";
  const certPath = process.env.DGII_CERT_PATH;
  const b64      = process.env.DGII_CERT_BASE64;

  let derBytes: string;

  if (certPath) {
    // Leer el .p12 directamente del sistema de archivos
    const fs  = require("fs");
    const buf = fs.readFileSync(certPath) as Buffer;
    // Convertir Buffer a binary string para forge
    derBytes = buf.toString("binary");
  } else if (b64) {
    derBytes = forge.util.decode64(b64);
  } else {
    throw new Error("Configurar DGII_CERT_PATH o DGII_CERT_BASE64");
  }

  const asn1 = forge.asn1.fromDer(derBytes);
  const p12  = forge.pkcs12.pkcs12FromAsn1(asn1, false, pass);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let   keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    const kb2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = kb2[forge.pki.oids.keyBag]?.[0] as typeof keyBag;
  }
  if (!keyBag?.key) throw new Error("No se pudo extraer la clave privada del .p12");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("No se pudo extraer el certificado del .p12");

  // Igual que el ejemplo DGII: quitar \r\n del PEM del certificado
  let certPem = forge.pki.certificateToPem(certBag.cert);
  certPem = certPem.replace(/\r\n/g, "");
  const certBase64 = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "");

  return { privateKey: keyBag.key as forge.pki.rsa.PrivateKey, certBase64 };
}

// ─── C14N — Canonicalización XML (igual que el ejemplo TypeScript de DGII) ───
function attrCompare(a: Attr, b: Attr): number {
  // Atributos sin namespace van primero, luego por namespace, luego por nombre local
  const aNs = a.namespaceURI || "";
  const bNs = b.namespaceURI || "";
  if (aNs !== bNs) return aNs < bNs ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function nsCompare(a: {prefix:string}, b: {prefix:string}): number {
  return a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0;
}

function encodeText(text: string): string {
  return text.replace(/([&<>\r])/g, (_, c) => {
    const map: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\r":"" };
    return map[c] ?? c;
  });
}

function encodeAttr(val: string): string {
  return val.replace(/([&<"\r\n\t])/g, (_, c) => {
    const map: Record<string,string> = {
      "&":"&amp;", "<":"&lt;", '"':"&quot;", "\r":"", "\n":"", "\t":"&#x9;"
    };
    return map[c] ?? c;
  });
}

function renderAttrs(node: Element): string {
  const attrs: Attr[] = [];
  for (let i = 0; i < (node.attributes?.length ?? 0); i++) {
    const a = node.attributes[i];
    if (a.name.indexOf("xmlns") === 0) continue;
    attrs.push(a);
  }
  attrs.sort(attrCompare);
  return attrs.map((a) => ` ${a.name}="${encodeAttr(a.value)}"`).join("");
}

interface NsResult { rendered: string; newDefaultNs: string }

function renderNs(
  node: Element,
  prefixesInScope: string[],
  defaultNs: string,
  defaultNsForPrefix: Record<string, string>,
  ancestorNamespaces: {prefix:string; namespaceURI:string}[]
): NsResult {
  const res: string[] = [];
  let newDefaultNs = defaultNs;
  const nsListToRender: {prefix:string; namespaceURI:string}[] = [];
  const currNs = (node as any).namespaceURI || "";

  if ((node as any).prefix) {
    const pfx = (node as any).prefix;
    if (!prefixesInScope.includes(pfx)) {
      nsListToRender.push({ prefix: pfx, namespaceURI: currNs || defaultNsForPrefix[pfx] || "" });
      prefixesInScope.push(pfx);
    }
  } else if (defaultNs !== currNs) {
    newDefaultNs = currNs;
    res.push(` xmlns="${newDefaultNs}"`);
  }

  for (let i = 0; i < (node.attributes?.length ?? 0); i++) {
    const a = node.attributes[i];
    if (a.prefix === "xmlns" && !prefixesInScope.includes(a.localName)) {
      nsListToRender.push({ prefix: a.localName, namespaceURI: a.value });
      prefixesInScope.push(a.localName);
    }
    if (a.prefix && !prefixesInScope.includes(a.prefix) && a.prefix !== "xmlns" && a.prefix !== "xml") {
      nsListToRender.push({ prefix: a.prefix, namespaceURI: (a as any).namespaceURI || "" });
      prefixesInScope.push(a.prefix);
    }
  }

  for (const anc of ancestorNamespaces) {
    const already = nsListToRender.some(
      (n) => n.prefix === anc.prefix && n.namespaceURI === anc.namespaceURI
    );
    if (!already) nsListToRender.push(anc);
  }

  nsListToRender.sort(nsCompare);
  for (const n of nsListToRender) {
    res.push(` xmlns:${n.prefix}="${n.namespaceURI}"`);
  }

  return { rendered: res.join(""), newDefaultNs };
}

function c14nInterno(
  node: Node,
  prefixesInScope: string[],
  defaultNs: string,
  defaultNsForPrefix: Record<string,string>,
  ancestorNamespaces: {prefix:string;namespaceURI:string}[]
): string {
  if (node.nodeType === 8) return ""; // comentarios ignorados
  if ((node as any).data !== undefined && node.nodeType !== 1) {
    return encodeText((node as any).data as string);
  }
  const el   = node as Element;
  const ns   = renderNs(el, prefixesInScope, defaultNs, defaultNsForPrefix, ancestorNamespaces);
  const res  = [`<${el.tagName}${ns.rendered}${renderAttrs(el)}>`];
  for (let i = 0; i < el.childNodes.length; i++) {
    res.push(c14nInterno(el.childNodes[i], [...prefixesInScope], ns.newDefaultNs, defaultNsForPrefix, []));
  }
  res.push(`</${el.tagName}>`);
  return res.join("");
}

function c14n(node: Node, options?: { defaultNsForPrefix?: Record<string,string> }): string {
  const opts = options || {};
  return c14nInterno(node, [], "", opts.defaultNsForPrefix || {}, []);
}

// ─── Estructura de la firma (igual que agregarEstructuraFirma de DGII) ────────
function buildSignatureStructure(certBase64: string, digestValue: string): string {
  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315" />` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature" />` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>` +
    `<KeyInfo><X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

// ─── Función principal de firmado ─────────────────────────────────────────────
export async function firmarXML(xml: string): Promise<string> {
  const { privateKey, certBase64 } = loadP12();

  // 1. Parsear XML y obtener C14N del elemento raíz
  const xmlDoc  = new DOMParser().parseFromString(xml, "text/xml");
  const rootNode = xmlDoc.documentElement;
  const xmlC14n  = c14n(rootNode, null as any);

  // 2. DigestValue = SHA256(C14N del documento)
  const md1 = forge.md.sha256.create();
  md1.update(xmlC14n, "utf8");
  const digestValue = forge.util.encode64(md1.digest().bytes());

  // 3. Construir estructura de firma (sin SignatureValue aún)
  const signatureBlock = buildSignatureStructure(certBase64, digestValue);

  // 4. Insertar firma ANTES del cierre del elemento raíz (igual que DGII)
  const rootTag      = rootNode.tagName;
  const closeTag     = `</${rootTag}>`;
  const insertIdx    = xmlC14n.lastIndexOf(closeTag);
  const xmlConFirma  = xmlC14n.substring(0, insertIdx) + signatureBlock + xmlC14n.substring(insertIdx);

  // 5. Parsear el XML con la firma e incluida y canonicalizar el <SignedInfo>
  const xmlDoc2    = new DOMParser().parseFromString(xmlConFirma, "text/xml");
  const signedInfo = xmlDoc2.getElementsByTagName("SignedInfo")[0];
  const siC14n     = c14n(signedInfo, { defaultNsForPrefix: { "ds": "http://www.w3.org/2000/09/xmldsig#", "": "http://www.w3.org/2000/09/xmldsig#" } });

  // 6. SignatureValue = RSA-SHA256(C14N del SignedInfo)
  const md2 = forge.md.sha256.create();
  md2.update(siC14n, "utf8");
  const signatureBytes  = privateKey.sign(md2);
  const signatureValue  = forge.util.encode64(signatureBytes);

  // 7. Insertar SignatureValue justo antes de </Signature>
  const insertFirmaIdx = xmlConFirma.search("</Signature>");
  const xmlFirmado = (
    xmlConFirma.substring(0, insertFirmaIdx) +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    xmlConFirma.substring(insertFirmaIdx)
  );

  return xmlFirmado;
}

// Alias — la semilla usa el mismo proceso
export async function firmarSemilla(semillaXml: string): Promise<string> {
  return firmarXML(semillaXml);
}