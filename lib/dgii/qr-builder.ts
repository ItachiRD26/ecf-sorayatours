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
function calcularCodigoSeguridad(signatureValue: string): string {
  const md = forge.md.sha256.create();
  md.update(signatureValue, "utf8");
  return md.digest().toHex().substring(0, 6);
}

export function generarURLQR(params: QRParams): string {
  const codigo = calcularCodigoSeguridad(params.signatureValue);

  if (params.esRFCE || params.tipoECF === "E32") {
    // RFCE < RD$250,000 — sin RNC comprador
    const base = "https://fc.dgii.gov.do/eCF/ConsultaTimbreFC";
    const qs   = new URLSearchParams({
      rncemisor:       params.rncEmisor,
      encf:            params.eNCF.toLowerCase(),
      montototal:      params.montoTotal.toFixed(2),
      codigoseguridad: codigo,
    });
    return `${base}?${qs.toString()}`;
  }

  // E31, E45 y otros — con RNC comprador
  const base = "https://ecf.dgii.gov.do/ecf/ConsultaTimbre";
  const qs   = new URLSearchParams({
    RncEmisor:       params.rncEmisor,
    RncComprador:    params.rncComprador ?? "",
    ENCF:            params.eNCF,
    FechaEmision:    params.fechaEmision,
    MontoTotal:      params.montoTotal.toFixed(2),
    FechaFirma:      params.fechaFirma,
    CodigoSeguridad: codigo,
  });
  return `${base}?${qs.toString()}`;
}

// Formatos de fecha requeridos por DGII
export function formatFechaQR(dateStr: string): string {
  // Input: "2026-05-15" → Output: "15-05-2026"
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

export function formatFechaHoraQR(isoString: string): string {
  // Input ISO → Output: "15-05-2026 14:30:00"
  const d   = new Date(isoString);
  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const yy  = d.getFullYear();
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss  = String(d.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yy} ${hh}:${min}:${ss}`;
}