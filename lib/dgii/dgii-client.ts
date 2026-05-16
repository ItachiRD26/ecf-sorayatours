// Cliente REST para todos los endpoints de la DGII
// Maneja token JWT con cache automático en el proceso Node

// ─── Dominios por ambiente ────────────────────────────────────────────────────
// ECF (facturas normales): ecf.dgii.gov.do
// FC  (resúmenes RFCE):    fc.dgii.gov.do   ← dominio DIFERENTE, mismo patrón
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

function getAmbiente(): string {
  return process.env.DGII_AMBIENTE ?? "testecf";
}

function getECFBase(): string {
  return ECF_BASE[getAmbiente()] ?? ECF_BASE.testecf;
}

function getFCBase(): string {
  return FC_BASE[getAmbiente()] ?? FC_BASE.testecf;
}

// ─── Cache del token JWT ──────────────────────────────────────────────────────
interface TokenCache { token: string; expira: Date }
let tokenCache: TokenCache | null = null;

// ─── Semilla ──────────────────────────────────────────────────────────────────
export async function obtenerSemilla(): Promise<string> {
  const url = `${getECFBase()}/autenticacion/api/autenticacion/semilla`;
  const res = await fetch(url, { method: "GET", headers: { accept: "*/*" } });
  if (!res.ok) throw new Error(`Semilla: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  if (!xml.includes("<valor>")) throw new Error("La semilla no contiene <valor>");
  return xml;
}

// ─── Validar semilla firmada → token JWT ──────────────────────────────────────
export async function validarSemilla(xmlFirmado: string): Promise<string> {
  const url  = `${getECFBase()}/autenticacion/api/autenticacion/validarsemilla`;
  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "semilla.xml");

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Validar semilla: ${res.status} ${await res.text()}`);

  const data = await res.json();
  if (!data.token) throw new Error("DGII no devolvió token en la respuesta");

  tokenCache = { token: data.token, expira: new Date(data.expira) };
  return data.token;
}

// ─── Token válido (renueva automáticamente) ───────────────────────────────────
export async function getToken(): Promise<string> {
  const margen = 5 * 60 * 1000;
  if (tokenCache && tokenCache.expira.getTime() - Date.now() > margen) {
    return tokenCache.token;
  }
  const { firmarSemilla } = await import("./xml-signer");
  const semillaXml     = await obtenerSemilla();
  const semillaFirmada = await firmarSemilla(semillaXml);
  return validarSemilla(semillaFirmada);
}

// ─── Enviar e-CF normal → retorna TrackId ────────────────────────────────────
export async function enviarECF(xmlFirmado: string): Promise<string> {
  const token = await getToken();
  const url   = `${getECFBase()}/recepcion/api/ecf`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "ecf.xml");

  const res  = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío eCF: ${res.status} — ${text}`);

  const match = text.match(/<trackId>(.*?)<\/trackId>/);
  if (!match) throw new Error(`DGII no devolvió trackId. Respuesta: ${text.substring(0, 500)}`);
  return match[1];
}

// ─── Enviar RFCE (resumen E32 < RD$250,000) ───────────────────────────────────
// OJO: usa fc.dgii.gov.do — dominio DIFERENTE al de los eCF normales
export async function enviarRFCE(xmlFirmado: string): Promise<{ trackId: string; estado: string }> {
  const token = await getToken();
  const url   = `${getFCBase()}/recepcionfc/api/rfce`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "rfce.xml");

  const res  = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Envío RFCE: ${res.status} — ${text}`);

  const trackId = text.match(/<trackId>(.*?)<\/trackId>/)?.[1] ?? "";
  const estado  = text.match(/<estado>(.*?)<\/estado>/)?.[1]   ?? "";
  return { trackId, estado };
}

// ─── Consultar estado por TrackId ─────────────────────────────────────────────
export async function consultarEstado(trackId: string): Promise<{
  estado:   string;
  mensajes: string[];
  eCF?:     string;
}> {
  const token = await getToken();
  const url   = `${getECFBase()}/consultatrackeids/api/Consulta/TrackId/${trackId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Consulta TrackId: ${res.status}`);

  const data = await res.json();
  return {
    estado:   data.estado   ?? "Desconocido",
    mensajes: data.mensajes ?? [],
    eCF:      data.eNCF,
  };
}

// ─── Anular e-NCF ─────────────────────────────────────────────────────────────
export async function anularENCF(xmlFirmado: string): Promise<void> {
  const token = await getToken();
  const url   = `${getECFBase()}/anulacion/api/anulacion`;
  const form  = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "text/xml" }), "anulacion.xml");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Anulación: ${res.status} — ${await res.text()}`);
}