// Cliente REST para todos los endpoints de la DGII
// Maneja token JWT con cache automático

const AMBIENTES = {
  testecf:  "https://ecf.dgii.gov.do/testecf",
  certecf:  "https://ecf.dgii.gov.do/certecf",
  ecf:      "https://ecf.dgii.gov.do/ecf",
} as const;

type Ambiente = keyof typeof AMBIENTES;

interface TokenCache {
  token:   string;
  expira:  Date;
}

// Cache en memoria del servidor (se renueva automáticamente)
let tokenCache: TokenCache | null = null;

function getBaseUrl(): string {
  const amb = (process.env.DGII_AMBIENTE ?? "testecf") as Ambiente;
  return AMBIENTES[amb] ?? AMBIENTES.testecf;
}

// ── Obtener semilla ───────────────────────────────────────────────
export async function obtenerSemilla(): Promise<string> {
  const url = `${getBaseUrl()}/autenticacion/api/autenticacion/semilla`;
  const res  = await fetch(url, { method: "GET", headers: { accept: "*/*" } });
  if (!res.ok) throw new Error(`Error obteniendo semilla: ${res.status}`);
  const xml = await res.text();
  // Extraer valor de <valor>...</valor>
  const match = xml.match(/<valor>(.*?)<\/valor>/);
  if (!match) throw new Error("No se pudo extraer el valor de la semilla");
  return xml; // Retorna el XML completo para firmarlo
}

// ── Validar semilla firmada → obtener token ───────────────────────
export async function validarSemilla(xmlFirmado: string): Promise<string> {
  const url  = `${getBaseUrl()}/autenticacion/api/autenticacion/validarsemilla`;
  const form = new FormData();
  const blob = new Blob([xmlFirmado], { type: "text/xml" });
  form.append("xml", blob, "semilla.xml");

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error validando semilla: ${res.status} — ${err}`);
  }

  const data = await res.json();
  if (!data.token) throw new Error("La DGII no devolvió token");

  // Cachear el token
  tokenCache = {
    token:  data.token,
    expira: new Date(data.expira),
  };

  return data.token;
}

// ── Obtener token válido (usa cache si no expiró) ─────────────────
export async function getToken(): Promise<string> {
  const margen = 5 * 60 * 1000; // 5 min antes de que expire
  if (tokenCache && tokenCache.expira.getTime() - Date.now() > margen) {
    return tokenCache.token;
  }
  // Necesita renovar: importamos el signer dinámicamente para evitar
  // dependencias circulares
  const { firmarSemilla } = await import("./xml-signer");
  const semillaXml = await obtenerSemilla();
  const semillaFirmada = await firmarSemilla(semillaXml);
  return await validarSemilla(semillaFirmada);
}

// ── Enviar e-CF a DGII → retorna TrackId ─────────────────────────
export async function enviarECF(xmlFirmado: string): Promise<string> {
  const token = await getToken();
  const url   = `${getBaseUrl()}/recepcion/api/ecf`;
  const form  = new FormData();
  const blob  = new Blob([xmlFirmado], { type: "text/xml" });
  form.append("xml", blob, "ecf.xml");

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Error enviando e-CF: ${res.status} — ${text}`);

  // Extraer trackId del XML de respuesta
  const match = text.match(/<trackId>(.*?)<\/trackId>/);
  if (!match) throw new Error(`DGII no devolvió trackId. Respuesta: ${text}`);
  return match[1];
}

// ── Enviar RFCE (resumen E32 < RD$250,000) ────────────────────────
export async function enviarRFCE(xmlFirmado: string): Promise<{ trackId: string; estado: string }> {
  const token = await getToken();
  const url   = `${getBaseUrl()}/recepcion/api/rfce`;
  const form  = new FormData();
  const blob  = new Blob([xmlFirmado], { type: "text/xml" });
  form.append("xml", blob, "rfce.xml");

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Error enviando RFCE: ${res.status} — ${text}`);

  // Parsear respuesta
  const trackId = text.match(/<trackId>(.*?)<\/trackId>/)?.[1] ?? "";
  const estado  = text.match(/<estado>(.*?)<\/estado>/)?.[1]  ?? "";
  return { trackId, estado };
}

// ── Consultar estado por TrackId ──────────────────────────────────
export async function consultarEstado(trackId: string): Promise<{
  estado:   string;
  mensajes: string[];
  eCF?:     string;
}> {
  const token = await getToken();
  const url   = `${getBaseUrl()}/consultatrackeids/api/Consulta/TrackId/${trackId}`;

  const res = await fetch(url, {
    method:  "GET",
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });

  if (!res.ok) throw new Error(`Error consultando TrackId: ${res.status}`);
  const data = await res.json();

  return {
    estado:   data.estado   ?? "Desconocido",
    mensajes: data.mensajes ?? [],
    eCF:      data.eNCF,
  };
}

// ── Anular e-NCF ──────────────────────────────────────────────────
export async function anularENCF(xmlFirmado: string): Promise<void> {
  const token = await getToken();
  const url   = `${getBaseUrl()}/anulacion/api/anulacion`;
  const form  = new FormData();
  const blob  = new Blob([xmlFirmado], { type: "text/xml" });
  form.append("xml", blob, "anulacion.xml");

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error anulando e-NCF: ${res.status} — ${err}`);
  }
}