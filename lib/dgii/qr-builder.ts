// Genera las URLs del Timbre Electrónico DGII
//
// El formato es IGUAL en todos los ambientes — solo cambia el prefijo de la URL:
//   certecf  → ecf.dgii.gov.do/CerteCF/consultatimbre
//   testecf  → ecf.dgii.gov.do/testecf/consultatimbre
//   ecf      → ecf.dgii.gov.do/ecf/consultatimbre
//
// Params: siempre minúsculas
// Fechas:  siempre dd-MM-yyyy (con guiones)
// CodigoSeguridad: primeros 6 chars del SignatureValue (base64), NO SHA-256

interface QRParams {
  tipoECF:        string;
  rncEmisor:      string;
  rncComprador?:  string;
  eNCF:           string;
  fechaEmision:   string;   // ya formateado por formatFechaQR() → "dd-MM-yyyy"
  montoTotal:     number;
  fechaFirma:     string;   // ya formateado por formatFechaHoraQR() → "dd-MM-yyyy HH:mm:ss"
  signatureValue: string;
  esRFCE?:        boolean;  // true si es E32 < RD$250,000
}

function getAmb(): string {
  return (process.env.DGII_AMBIENTE ?? "certecf").toLowerCase();
}

// Construye query string con encodeURIComponent (%20 para espacios — RFC 3986)
function buildQS(pairs: [string, string][]): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

// CodigoSeguridad = primeros 6 chars del SignatureValue base64
// Confirmado con ejemplos DGII certecf (ej: "FFgkKR") — no es SHA-256
export function calcularCodigoSeguridad(signatureValue: string): string {
  return signatureValue.substring(0, 6);
}

export function generarURLQR(params: QRParams): string {
  const codigo = calcularCodigoSeguridad(params.signatureValue);
  const amb    = getAmb();

  if (params.esRFCE) {
    // E32 < RD$250,000 — URL fc.dgii.gov.do — sin rnccomprador ni fechas
    // El ambiente cambia el prefijo (certecf vs ecf)
    const base = amb === "ecf"
      ? "https://fc.dgii.gov.do/eCF/ConsultaTimbreFC"
      : `https://fc.dgii.gov.do/${amb}/ConsultaTimbreFC`;
    return `${base}?${buildQS([
      ["rncemisor",       params.rncEmisor],
      ["encf",            params.eNCF],
      ["montototal",      params.montoTotal.toFixed(2)],
      ["codigoseguridad", codigo],
    ])}`;
  }

  // ECF completo (E31, E32 ≥ 250k, E33, E34, E41-E47)
  // Mismo formato en todos los ambientes — solo cambia el prefijo de la URL
  const base = `https://ecf.dgii.gov.do/${amb === "ecf" ? "ecf" : amb}/consultatimbre`;
  return `${base}?${buildQS([
    ["rncemisor",       params.rncEmisor],
    ...(params.rncComprador ? [["rnccomprador", params.rncComprador] as [string, string]] : []),
    ["encf",            params.eNCF],
    ["fechaemision",    params.fechaEmision],
    ["montototal",      params.montoTotal.toFixed(2)],
    ["fechafirma",      params.fechaFirma],
    ["codigoseguridad", codigo],
  ])}`;
}

// ── Formato de fechas para la URL del QR ────────────────────────────────────
// Siempre dd-MM-yyyy (con guiones) — igual en certecf y producción

export function formatFechaQR(dateStr: string): string {
  // Input: "2026-05-27" (YYYY-MM-DD desde Firestore)
  // Output: "27-05-2026" (dd-MM-yyyy)
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}

export function formatFechaHoraQR(isoString: string): string {
  // Input: ISO string
  // Output: "27-05-2026 01:06:39" (dd-MM-yyyy HH:mm:ss)
  const dt  = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dd  = pad(dt.getDate());
  const mm  = pad(dt.getMonth() + 1);
  const yy  = dt.getFullYear();
  const hh  = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  const ss  = pad(dt.getSeconds());
  return `${dd}-${mm}-${yy} ${hh}:${min}:${ss}`;
}
