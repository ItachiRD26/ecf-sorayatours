// Cliente DGII — URLs corregidas según Swagger oficial certecf
// Recepción: /CerteCF/Recepcion/api/FacturasElectronicas
// RFCE:      /certecf/recepcionfc/api/recepcion/ecf
// Consulta:  /CerteCF/ConsultaResultado/api/Consultas/Estado

import FormData from "form-data";
import { Readable } from "stream";
import axios from "axios";

const ECF_HOST = "https://ecf.dgii.gov.do";
const FC_HOST  = "https://fc.dgii.gov.do";

function getAmb(): string { return process.env.DGII_AMBIENTE ?? "testecf"; }

function urls() {
  const amb = getAmb();
  return {
    semilla:        `${ECF_HOST}/${amb}/autenticacion/api/Autenticacion/Semilla`,
    validarSemilla: `${ECF_HOST}/${amb}/autenticacion/api/Autenticacion/ValidarSemilla`,
    recepcion:      `${ECF_HOST}/CerteCF/Recepcion/api/FacturasElectronicas`,
    rfce:           `${FC_HOST}/${amb}/recepcionfc/api/recepcion/ecf`,
    consulta:       `${ECF_HOST}/CerteCF/ConsultaResultado/api/Consultas/Estado`,
  };
}

interface TokenCache { token: string; expira: Date }
let tokenCache: TokenCache | null = null;

export async function obtenerSemilla(): Promise<string> {
  const res = await fetch(urls().semilla, { headers: { accept: "*/*" } });
  if (!res.ok) throw new Error(`Semilla: ${res.status} ${await res.text()}`);
  return res.text();
}

export async function validarSemilla(xmlFirmado: string): Promise<string> {
  const buf  = Buffer.from(xmlFirmado, "utf8");
  const form = new FormData();
  form.append("xml", Readable.from(buf), {
    filename:    "semilla.xml",
    contentType: "text/xml",
    knownLength: buf.length,
  });

  const res = await axios.post(urls().validarSemilla, form, {
    headers: {
      ...form.getHeaders(),
      "Content-Length": String(form.getLengthSync()),
    },
    validateStatus: () => true,
  });

  if (res.status >= 400) throw new Error(`Validar semilla: ${res.status} ${JSON.stringify(res.data)}`);
  const data = res.data;
  if (!data.token) throw new Error("DGII no devolvió token");
  tokenCache = { token: data.token, expira: new Date(data.expira) };
  return data.token;
}

export async function getToken(): Promise<string> {
  const margen = 5 * 60 * 1000;

  // 1. Cache en memoria
  if (tokenCache && tokenCache.expira.getTime() - Date.now() > margen) {
    return tokenCache.token;
  }

  // 2. Token guardado en Firestore (obtenido via App Firma Digital)
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.collection("config").doc("dgii_token").get();
    if (snap.exists) {
      const data = snap.data() as { token: string; expira: string };
      const expira = new Date(data.expira);
      if (expira.getTime() - Date.now() > margen) {
        console.log("[DGII] Token de Firestore válido hasta:", data.expira);
        tokenCache = { token: data.token, expira };
        return data.token;
      }
      console.warn("[DGII] Token en Firestore expirado — renovar en /certificacion");
    }
  } catch (e) {
    console.warn("[DGII] No se pudo leer token de Firestore:", e instanceof Error ? e.message : e);
  }

  // 3. Firma automática (puede fallar por cert issue)
  try {
    const { firmarSemilla } = await import("./xml-signer");
    const xml = await obtenerSemilla();
    return await validarSemilla(await firmarSemilla(xml));
  } catch (e) {
    console.warn("[DGII] Auth automática fallida:", e instanceof Error ? e.message : e);
    return "";
  }
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Enviar e-CF → retorna TrackId ───────────────────────────────────────────
export async function enviarECF(xmlFirmado: string, tokenExterno?: string, encf?: string): Promise<string> {
  const token    = tokenExterno || await getToken();
  const rnc      = process.env.DGII_RNC ?? "131217656";
  const filename = encf ? `${rnc}${encf}.xml` : "ecf.xml";

  const buf  = Buffer.from(xmlFirmado, "utf8");
  const form = new FormData();
  form.append("xml", Readable.from(buf), {
    filename,
    contentType: "text/xml",
    knownLength: buf.length,
  });

  const res = await axios.post(urls().recepcion, form, {
    headers: {
      ...authHeaders(token),
      ...form.getHeaders(),
      "Content-Length": String(form.getLengthSync()),
    },
    validateStatus: () => true,
  });

  const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (res.status >= 400) throw new Error(`Envío eCF: ${res.status} — ${text}`);

  const data = typeof res.data === "string"
    ? (() => { try { return JSON.parse(res.data); } catch { return {}; } })()
    : res.data;
  if (data.trackId) return data.trackId;
  if (data.error)   throw new Error(data.error);

  const match = text.match(/"trackId"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  throw new Error(`DGII no devolvió trackId. Respuesta: ${text.substring(0, 300)}`);
}

// ─── Enviar RFCE ──────────────────────────────────────────────────────────────
export async function enviarRFCE(xmlFirmado: string, tokenExterno?: string, encf?: string): Promise<{ trackId: string; estado: string }> {
  const token    = tokenExterno || await getToken();
  const rnc      = process.env.DGII_RNC ?? "131217656";
  const filename = encf ? `${rnc}${encf}.xml` : "rfce.xml";

  const buf  = Buffer.from(xmlFirmado, "utf8");
  const form = new FormData();
  form.append("xml", Readable.from(buf), {
    filename,
    contentType: "text/xml",
    knownLength: buf.length,
  });

  const res = await axios.post(urls().rfce, form, {
    headers: {
      ...authHeaders(token),
      ...form.getHeaders(),
      "Content-Length": String(form.getLengthSync()),
    },
    validateStatus: () => true,
  });

  const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (res.status >= 400) throw new Error(`Envío RFCE: ${res.status} — ${text}`);

  const data = typeof res.data === "string"
    ? (() => { try { return JSON.parse(res.data); } catch { return {}; } })()
    : res.data;
  return {
    trackId: data.encf  ?? data.trackId ?? "",
    estado:  data.estado ?? "",
  };
}

// ─── Consultar estado por TrackId ─────────────────────────────────────────────
export async function consultarEstado(trackId: string): Promise<{
  estado: string; mensajes: string[]; eCF?: string;
}> {
  const token = await getToken();
  const url   = `${urls().consulta}?trackId=${trackId}`;
  const res   = await fetch(url, {
    headers: { ...authHeaders(token), accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Consulta TrackId: ${res.status}`);
  const data = await res.json();
  return {
    estado:   data.estado    ?? "Desconocido",
    mensajes: data.mensajes?.map((m: {valor?: string; codigo?: string}) => m.valor ?? m.codigo ?? "") ?? [],
    eCF:      data.encf      ?? data.eNCF,
  };
}

// ─── Anular e-NCF ─────────────────────────────────────────────────────────────
export async function anularENCF(xmlFirmado: string): Promise<void> {
  const token = await getToken();
  const buf   = Buffer.from(xmlFirmado, "utf8");
  const form  = new FormData();
  form.append("xml", Readable.from(buf), {
    filename:    "anulacion.xml",
    contentType: "text/xml",
    knownLength: buf.length,
  });

  const res = await axios.post(`${ECF_HOST}/${getAmb()}/anulacion/api/Anulacion`, form, {
    headers: {
      ...authHeaders(token),
      ...form.getHeaders(),
      "Content-Length": String(form.getLengthSync()),
    },
    validateStatus: () => true,
  });

  if (res.status >= 400) throw new Error(`Anulación: ${res.status} — ${JSON.stringify(res.data)}`);
}