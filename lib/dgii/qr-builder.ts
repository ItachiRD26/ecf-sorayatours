// Genera las URLs del Timbre Electrónico DGII
// E31/E45 (con RNC comprador): ecf.dgii.gov.do/ecf/ConsultaTimbre
// E32 < RD$250,000 (RFCE):    fc.dgii.gov.do/eCF/ConsultaTimbreFC

import * as forge from "node-forge";

interface QRParams {
  tipoECF:         string;
  rncEmisor:       string;
  rncComprador?:   string;
  eNCF:            string;
  fechaEmision:    string;   // "dd-MM-yyyy"
  montoTotal:      number;
  fechaFirma:      string;   // "dd-MM-yyyy HH:mm:ss"
  signatureValue:  string;   // El SignatureValue base64 del XML firmado
  esRFCE?:         boolean;  // true si es E32 < RD$250,000
}

// Los primeros 6 caracteres del SHA-256 del SignatureValue
// Exportado porque emitir/route.ts lo necesita para guardarlo en Firestore
export function calcularCodigoSeguridad(signatureValue: string): string {
  const md = forge.md.sha256.create();
  md.update(signatureValue, "utf8");
  return md.digest().toHex().substring(0, 6);
}

// Construye query string con encodeURIComponent (%20 para espacios, no +)
function buildQS(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

export function generarURLQR(params: QRParams): string {
  const codigo = calcularCodigoSeguridad(params.signatureValue);

  if (params.esRFCE) {
    // E32 < RD$250,000 (RFCE) — URL fc.dgii.gov.do sin FechaFirma ni RncComprador
    const base = "https://fc.dgii.gov.do/eCF/ConsultaTimbreFC";
    return `${base}?${buildQS({
      RncEmisor:       params.rncEmisor,
      ENCF:            params.eNCF,
      MontoTotal:      params.montoTotal.toFixed(2),
      CodigoSeguridad: codigo,
    })}`;
  }

  // E31, E32 ≥ 250k, E33, E34, E41-E47 — URL ecf.dgii.gov.do con FechaFirma
  // Orden exacto según Informe Técnico DGII pág. 35:
  // RncEmisor → RncComprador → ENCF → FechaEmision → MontoTotal → FechaFirma → CodigoSeguridad
  const base = "https://ecf.dgii.gov.do/ecf/ConsultaTimbre";
  const ordered: [string, string][] = [
    ["RncEmisor",       params.rncEmisor],
    ...(params.rncComprador ? [["RncComprador", params.rncComprador] as [string, string]] : []),
    ["ENCF",            params.eNCF],
    ["FechaEmision",    params.fechaEmision],
    ["MontoTotal",      params.montoTotal.toFixed(2)],
    ["FechaFirma",      params.fechaFirma],
    ["CodigoSeguridad", codigo],
  ];
  const qs = ordered.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${base}?${qs}`;
}

// ── Formatos de fecha para la URL del QR (Informe Técnico DGII pág. 35-36) ──
// FechaEmision en URL: ddMMyyyy   (sin guiones — obligatorio según ejemplo del informe)
// FechaFirma   en URL: ddMMyyyy HH:mm:ss (sin guiones en la fecha)
// Para mostrar en la representación impresa usar fmtFechaFirma en FacturaA4/FacturaTermica

export function formatFechaQR(dateStr: string): string {
  // Input: "2026-05-15" → Output: "15052026"  (ddMMyyyy, sin separadores)
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}${m}${y}`;
}

export function formatFechaHoraQR(isoString: string): string {
  // Input ISO → Output: "15052026 14:30:00"  (ddMMyyyy HH:mm:ss, sin guiones en fecha)
  const d   = new Date(isoString);
  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const yy  = d.getFullYear();
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss  = String(d.getSeconds()).padStart(2, "0");
  return `${dd}${mm}${yy} ${hh}:${min}:${ss}`;
}