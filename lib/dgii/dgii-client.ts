// Cliente REST para los endpoints de la DGII
// Auth es opcional según FAQ DGII pregunta #6 — si falla, intenta sin token

const ECF_BASE: Record<string, string> = {
  testecf: "https://ecf.dgii.gov.do/testecf",
  certecf: "https://ecf.dgii.gov.do/certecf",
  ecf:     "https://ecf.dgii.gov.do/ecf",
};
const FC_BASE: Record<string, string> = {
  testecf: "https://fc.dgii.gov.do/testecf",
  certecf: "https://fc.dgii.gov.do/certecf",
  ecf:     "https://fc.dgii.gov.do/ecf",
};

function getAmbiente(): string { return process.env.DGII_AMBIENTE ?? "testecf"; }
function getECFBase(): string  { return ECF_BASE[getAmbiente()] ?? ECF_BASE.testecf; }
function getFCBase(): string   { return FC_BASE[getAmbiente()]  ?? FC_BASE.testecf;  }

interface TokenCache { token: string; expira: Date }
let tokenCache: TokenCache | null = null;

export async function obtenerSemilla(): Promise<string> {
  const url = `${getECFBase()}/autenticacion/api/autenticacion/semilla`;
  const res = await fetch(url, { headers: { accept: "*/*" } });
  if (!res.ok) throw new Error(`Semilla: ${res.status} ${await res.text()}`);
  return res.text();
}

export async function validarSemilla(xmlFirmado: string): Promise<string> {
  const url  = `${getECFBase()}/autenticacion/api/autenticacion/validarsemilla`;
  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Validar semilla: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.token) throw new Error("DGII no devolvió token");
  tokenCache = { token: data.token, expira: new Date(data.expira) };
  return data.token;
}

// Obtener token — primero busca en Firestore (guardado desde /certificacion)
// Si no hay o está expirado, intenta firmar automáticamente
export async function getToken(): Promise<string> {
  const margen = 5 * 60 * 1000; // 5 min de margen

  // 1. Revisar cache en memoria
  if (tokenCache && tokenCache.expira.getTime() - Date.now() > margen) {
    return tokenCache.token;
  }

  // 2. Buscar token guardado en Firestore (obtenido via App Firma Digital)
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.collection("config").doc("dgii_token").get();
    if (snap.exists) {
      const data = snap.data() as { token: string; expira: string };
      const expira = new Date(data.expira);
      if (expira.getTime() - Date.now() > margen) {
        console.log("[DGII] Token obtenido de Firestore, válido hasta:", data.expira);
        tokenCache = { token: data.token, expira };
        return data.token;
      } else {
        console.warn("[DGII] Token en Firestore expirado, renovar en /certificacion");
      }
    }
  } catch (e) {
    console.warn("[DGII] No se pudo leer token de Firestore:", e instanceof Error ? e.message : e);
  }

  // 3. Intentar firma automática (puede fallar por cert issue)
  try {
    const { firmarSemilla } = await import("./xml-signer");
    const semillaXml     = await obtenerSemilla();
    const semillaFirmada = await firmarSemilla(semillaXml);
    return await validarSemilla(semillaFirmada);
  } catch (e) {
    console.warn("[DGII] Auth automática fallida:", e instanceof Error ? e.message : e);
    return "";
  }
}

// Helper para headers con o sin token
function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Enviar e-CF normal → retorna TrackId ────────────────────────────────────
export async function enviarECF(xmlFirmado: string, tokenExterno?: string): Promise<string> {
  const token = tokenExterno || await getToken();
  const url   = `${getECFBase()}/recepcion/api/ecf`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "ecf.xml");

  const res  = await fetch(url, { method: "POST", headers: authHeaders(token), body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío eCF: ${res.status} — ${text}`);

  const match = text.match(/<trackId>(.*?)<\/trackId>/);
  if (!match) throw new Error(`DGII no devolvió trackId. Respuesta: ${text.substring(0, 500)}`);
  return match[1];
}

// ─── Enviar RFCE (resumen E32 < RD$250,000) — usa fc.dgii.gov.do ─────────────
export async function enviarRFCE(xmlFirmado: string, tokenExterno?: string): Promise<{ trackId: string; estado: string }> {
  const token = tokenExterno || await getToken();
  const url   = `${getFCBase()}/recepcionfc/api/rfce`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "rfce.xml");

  const res  = await fetch(url, { method: "POST", headers: authHeaders(token), body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío RFCE: ${res.status} — ${text}`);

  return {
    trackId: text.match(/<trackId>(.*?)<\/trackId>/)?.[1] ?? "",
    estado:  text.match(/<estado>(.*?)<\/estado>/)?.[1]   ?? "",
  };
}

// ─── Consultar estado por TrackId ─────────────────────────────────────────────
export async function consultarEstado(trackId: string): Promise<{
  estado: string; mensajes: string[]; eCF?: string;
}> {
  const token = await getToken();
  const url   = `${getECFBase()}/consultatrackeids/api/Consulta/TrackId/${trackId}`;
  const res   = await fetch(url, { headers: { ...authHeaders(token), accept: "application/json" } });
  if (!res.ok) throw new Error(`Consulta TrackId: ${res.status}`);
  const data = await res.json();
  return { estado: data.estado ?? "Desconocido", mensajes: data.mensajes ?? [], eCF: data.eNCF };
}

// ─── Anular e-NCF ─────────────────────────────────────────────────────────────
export async function anularENCF(xmlFirmado: string): Promise<void> {
  const token = await getToken();
  const url   = `${getECFBase()}/anulacion/api/anulacion`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "anulacion.xml");
  const res = await fetch(url, { method: "POST", headers: authHeaders(token), body: form });
  if (!res.ok) throw new Error(`Anulación: ${res.status} — ${await res.text()}`);
}