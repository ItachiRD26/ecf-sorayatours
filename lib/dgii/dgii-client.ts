// Cliente DGII — URLs corregidas según Swagger oficial certecf
// Recepción: /CerteCF/Recepcion/api/FacturasElectronicas  ← era /api/ecf (incorrecto)
// RFCE:      /certecf/recepcionfc/api/recepcion/ecf       ← era /api/rfce (incorrecto)
// Consulta:  /CerteCF/ConsultaResultado/api/Consultas/Estado

const ECF_HOST = "https://ecf.dgii.gov.do";
const FC_HOST  = "https://fc.dgii.gov.do";

function getAmb(): string { return process.env.DGII_AMBIENTE ?? "testecf"; }

// Rutas según Swagger oficial
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
  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");
  const res  = await fetch(urls().validarSemilla, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Validar semilla: ${res.status} ${await res.text()}`);
  const data = await res.json();
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
export async function enviarECF(xmlFirmado: string, tokenExterno?: string): Promise<string> {
  const token = tokenExterno || await getToken();
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "ecf.xml");

  const res  = await fetch(urls().recepcion, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío eCF: ${res.status} — ${text}`);

  // Respuesta: { trackId, error, mensaje }
  try {
    const data = JSON.parse(text);
    if (data.trackId) return data.trackId;
    if (data.error)   throw new Error(data.error);
  } catch { /* si no es JSON, buscar trackId en texto */ }

  const match = text.match(/"trackId"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  throw new Error(`DGII no devolvió trackId. Respuesta: ${text.substring(0, 300)}`);
}

// ─── Enviar RFCE ──────────────────────────────────────────────────────────────
export async function enviarRFCE(xmlFirmado: string, tokenExterno?: string): Promise<{ trackId: string; estado: string }> {
  const token = tokenExterno || await getToken();
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "rfce.xml");

  const res  = await fetch(urls().rfce, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío RFCE: ${res.status} — ${text}`);

  try {
    const data = JSON.parse(text);
    return {
      trackId: data.encf  ?? data.trackId ?? "",
      estado:  data.estado ?? "",
    };
  } catch {
    return { trackId: "", estado: text };
  }
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
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "anulacion.xml");
  const res = await fetch(`${ECF_HOST}/${getAmb()}/anulacion/api/Anulacion`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) throw new Error(`Anulación: ${res.status} — ${await res.text()}`);
}