// ── RNC Jurídica: 9 dígitos → 1-3162202-1 ────────────────────────
export function maskRNC(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 1) return d;
  if (d.length <= 8) return `${d.slice(0, 1)}-${d.slice(1)}`;
  return `${d.slice(0, 1)}-${d.slice(1, 8)}-${d.slice(8)}`;
}

// ── Cédula / RNC Físico: 11 dígitos → 402-1217139-7 ──────────────
export function maskCedula(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
}

// ── Teléfono: 10 dígitos → 809-962-2259 ──────────────────────────
export function maskTelefono(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

// ── Validador RNC Jurídica (9 dígitos, módulo 11 DGII) ────────────
export function validarRNC(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 9) return false;
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2] as const;
  let suma = 0;
  for (let i = 0; i < 8; i++) {
    suma += Number(d.charAt(i)) * pesos[i];
  }
  const mod = suma % 11;
  const verificador = mod === 0 ? 0 : mod === 1 ? 1 : 11 - mod;
  return verificador === Number(d.charAt(8));
}

// ── Validador Cédula dominicana (11 dígitos, módulo 10) ───────────
export function validarCedula(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesos = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2] as const;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let prod = Number(d.charAt(i)) * pesos[i];
    if (prod >= 10) prod -= 9;
    suma += prod;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(d.charAt(10));
}

// ── Tipos ─────────────────────────────────────────────────────────
export type TipoCliente = "juridica" | "fisica" | "consumidor";

export interface IdentificadorInfo {
  label:       string;
  placeholder: string;
  mask:        (value: string) => string;
  validar:     (value: string) => boolean;
  hint:        string;
}

// ── Info según tipo de cliente ────────────────────────────────────
export function getIdentificadorInfo(tipo: TipoCliente): IdentificadorInfo {
  if (tipo === "juridica") {
    return {
      label:       "RNC",
      placeholder: "1-3162202-1",
      mask:        maskRNC,
      validar:     validarRNC,
      hint:        "9 dígitos · Registro Nacional de Contribuyentes",
    };
  }
  if (tipo === "fisica") {
    return {
      label:       "RNC (Cédula)",
      placeholder: "402-1217139-7",
      mask:        maskCedula,
      validar:     validarCedula,
      hint:        "11 dígitos · Su cédula es su RNC como persona física",
    };
  }
  return {
    label:       "Cédula",
    placeholder: "402-1217139-7",
    mask:        maskCedula,
    validar:     validarCedula,
    hint:        "11 dígitos · Cédula de identidad y electoral (opcional)",
  };
}