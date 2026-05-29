// Genera las URLs del Timbre Electrónico DGII
// El formato varía según el entorno (DGII_AMBIENTE):
//
//  certecf / testecf (certificación):
//    ECF:  ecf.dgii.gov.do/CerteCF/consultatimbre  — params minúsculas, fechas dd-MM-yyyy
//    RFCE: ecf.dgii.gov.do/CerteCF/consultatimbre  — misma URL, sin rnccomprador/fechas
//
//  ecf (producción):
//    ECF:  ecf.dgii.gov.do/ecf/ConsultaTimbre      — params PascalCase, fechas ddMMyyyy
//    RFCE: fc.dgii.gov.do/eCF/ConsultaTimbreFC     — params PascalCase, sin fechas

import * as forge from "node-forge";

interface QRParams {
  tipoECF:        string;
  rncEmisor:      string;
  rncComprador?:  string;
  eNCF:           string;
  fechaEmision:   string;   // ya formateado por formatFechaQR()
  montoTotal:     number;
  fechaFirma:     string;   // ya formateado por formatFechaHoraQR()
  signatureValue: string;
  esRFCE?:        boolean;  // true si es E32 < RD$250,000
}

function getAmb(): string {
  return (process.env.DGII_AMBIENTE ?? "certecf").toLowerCase();
}

function esProduccion(): boolean {
  return getAmb() === "ecf";
}

// Los primeros 6 caracteres del SHA-256 del SignatureValue
export function calcularCodigoSeguridad(signatureValue: string): string {
  const md = forge.md.sha256.create();
  md.update(signatureValue, "utf8");
  return md.digest().toHex().substring(0, 6);
}

// Construye query string con encodeURIComponent (%20 para espacios — RFC 3986)
function buildQS(pairs: [string, string][]): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

export function generarURLQR(params: QRParams): string {
  const codigo = calcularCodigoSeguridad(params.signatureValue);
  const prod   = esProduccion();

  if (params.esRFCE) {
    if (prod) {
      // Producción RFCE → fc.dgii.gov.do — PascalCase, sin fechas
      const qs = buildQS([
        ["RncEmisor",       params.rncEmisor],
        ["ENCF",            params.eNCF],
        ["MontoTotal",      params.montoTotal.toFixed(2)],
        ["CodigoSeguridad", codigo],
      ]);
      return `https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?${qs}`;
    } else {
      // CerteCF RFCE → misma URL certecf, minúsculas, sin fechas ni rnccomprador
      const qs = buildQS([
        ["rncemisor",       params.rncEmisor],
        ["encf",            params.eNCF],
        ["montototal",      params.montoTotal.toFixed(2)],
        ["codigoseguridad", codigo],
      ]);
      return `https://ecf.dgii.gov.do/CerteCF/consultatimbre?${qs}`;
    }
  }

  if (prod) {
    // Producción ECF → PascalCase, fechas ddMMyyyy, RncComprador 2.º
    const qs = buildQS([
      ["RncEmisor",       params.rncEmisor],
      ...(params.rncComprador ? [["RncComprador", params.rncComprador] as [string, string]] : []),
      ["ENCF",            params.eNCF],
      ["FechaEmision",    params.fechaEmision],
      ["MontoTotal",      params.montoTotal.toFixed(2)],
      ["FechaFirma",      params.fechaFirma],
      ["CodigoSeguridad", codigo],
    ]);
    return `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?${qs}`;
  } else {
    // CerteCF ECF → todo minúsculas, fechas dd-MM-yyyy, rnccomprador 2.º
    const qs = buildQS([
      ["rncemisor",       params.rncEmisor],
      ...(params.rncComprador ? [["rnccomprador", params.rncComprador] as [string, string]] : []),
      ["encf",            params.eNCF],
      ["fechaemision",    params.fechaEmision],
      ["montototal",      params.montoTotal.toFixed(2)],
      ["fechafirma",      params.fechaFirma],
      ["codigoseguridad", codigo],
    ]);
    return `https://ecf.dgii.gov.do/CerteCF/consultatimbre?${qs}`;
  }
}

// ── Formatos de fecha para la URL del QR ────────────────────────────────────
// Certificación (certecf/testecf): dd-MM-yyyy  (con guiones)
// Producción    (ecf):             ddMMyyyy     (sin guiones)

export function formatFechaQR(dateStr: string): string {
  // Input: "2026-05-27"
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return esProduccion() ? `${d}${m}${y}` : `${d}-${m}-${y}`;
}

export function formatFechaHoraQR(isoString: string): string {
  // Input: ISO → Output según entorno: "dd-MM-yyyy HH:mm:ss" o "ddMMyyyy HH:mm:ss"
  const dt  = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dd  = pad(dt.getDate());
  const mm  = pad(dt.getMonth() + 1);
  const yy  = dt.getFullYear();
  const hh  = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  const ss  = pad(dt.getSeconds());
  const fecha = esProduccion() ? `${dd}${mm}${yy}` : `${dd}-${mm}-${yy}`;
  return `${fecha} ${hh}:${min}:${ss}`;
}
