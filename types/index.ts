// ── Empresa ───────────────────────────────────────────────────────
export interface Empresa {
  nombre:    string;
  rnc:       string;
  direccion: string;
  telefono:  string;
  email?:    string;
}

// ── Cliente ───────────────────────────────────────────────────────
export type TipoPersona     = "fisica" | "juridica" | "consumidor";
export type SubtipoJuridica = "regular" | "gobierno" | "zona_franca" | "exportacion";

export interface Cliente {
  id:        string;
  rnc:       string;
  nombre:    string;
  direccion: string;
  ciudad:    string;
  contacto:  string;
  telefono:  string;
  tipo:      TipoPersona;
  subtipo?:  SubtipoJuridica;
  email?:    string;
  creadoEn?: string;
}

// ── Servicio de Excursión ─────────────────────────────────────────
export type ModalidadServicio = "por_persona" | "por_grupo" | "ambas";

export interface Servicio {
  id:                string;
  codigo:            string;
  nombre:            string;
  descripcion?:      string;
  modalidad:         ModalidadServicio;
  // Precios por tramos de grupo (tarifa plana por grupo)
  precioTramo1_2?:   number;   // 1–2 personas: precio total plano
  precioTramo3_5?:   number;   // 3–5 personas: precio total plano
  precioTramo6_8?:   number;   // 6–8 personas: precio total plano
  precioPorPersona?: number;   // 9+ personas O modo por_persona: precio × persona
  itbis:             number;
  activo:            boolean;
  creadoEn?:         string;
}

// ── Helper: obtener precio y tramo según cantidad ─────────────────
export interface TierResult {
  precio:         number;
  modoResultante: ModoLinea;
  tramoLabel:     string;
  autoCambiado:   boolean; // true si se cambió a por_persona por ser 9+
}

export function getTierPrice(servicio: Servicio, cant: number, modoSolicitado: ModoLinea): TierResult {
  // Si el modo es por_persona (explícito), siempre precio por persona
  if (modoSolicitado === "por_persona") {
    return {
      precio:         servicio.precioPorPersona ?? 0,
      modoResultante: "por_persona",
      tramoLabel:     "por persona",
      autoCambiado:   false,
    };
  }

  // Modo por_grupo: seleccionar tramo según cantidad
  if (cant <= 0) {
    return {
      precio:         servicio.precioTramo1_2 ?? 0,
      modoResultante: "por_grupo",
      tramoLabel:     "1–2 personas",
      autoCambiado:   false,
    };
  }
  if (cant <= 2) {
    return {
      precio:         servicio.precioTramo1_2 ?? 0,
      modoResultante: "por_grupo",
      tramoLabel:     "1–2 personas",
      autoCambiado:   false,
    };
  }
  if (cant <= 5) {
    return {
      precio:         servicio.precioTramo3_5 ?? servicio.precioTramo1_2 ?? 0,
      modoResultante: "por_grupo",
      tramoLabel:     "3–5 personas",
      autoCambiado:   false,
    };
  }
  if (cant <= 8) {
    return {
      precio:         servicio.precioTramo6_8 ?? servicio.precioTramo3_5 ?? servicio.precioTramo1_2 ?? 0,
      modoResultante: "por_grupo",
      tramoLabel:     "6–8 personas",
      autoCambiado:   false,
    };
  }
  // 9+ → automáticamente por persona
  return {
    precio:         servicio.precioPorPersona ?? 0,
    modoResultante: "por_persona",
    tramoLabel:     "9+ personas (por persona)",
    autoCambiado:   true,
  };
}

// ── e-CF ──────────────────────────────────────────────────────────
export type TipoECF =
  | "E31" | "E32" | "E33" | "E34"
  | "E41" | "E43" | "E44" | "E45"
  | "E46" | "E47";

export const TIPOS_ECF: { codigo: TipoECF; label: string; soloB2B?: boolean }[] = [
  { codigo: "E31", label: "E31 — Crédito Fiscal Electrónica",       soloB2B: true  },
  { codigo: "E32", label: "E32 — Consumo Electrónica",              soloB2B: false },
  { codigo: "E33", label: "E33 — Nota de Débito Electrónica",       soloB2B: true  },
  { codigo: "E34", label: "E34 — Nota de Crédito Electrónica",      soloB2B: true  },
  { codigo: "E41", label: "E41 — Compras Electrónica",              soloB2B: true  },
  { codigo: "E43", label: "E43 — Gastos Menores Electrónica",       soloB2B: true  },
  { codigo: "E44", label: "E44 — Regímenes Especiales Electrónica", soloB2B: true  },
  { codigo: "E45", label: "E45 — Gubernamental Electrónica",        soloB2B: true  },
  { codigo: "E46", label: "E46 — Exportaciones Electrónica",        soloB2B: true  },
  { codigo: "E47", label: "E47 — Pagos al Exterior Electrónica",    soloB2B: true  },
];

export const ITBIS_RATES = [
  { val: 0,    label: "Exento (E)" },
  { val: 0.16, label: "16%"        },
  { val: 0.18, label: "18%"        },
] as const;

export const TERMINOS_PAGO  = ["Contado", "Crédito"] as const;
export const PLAZOS_CREDITO = ["15 Días", "30 Días", "45 Días", "60 Días", "90 Días"] as const;

// ── Línea de Servicio ─────────────────────────────────────────────
export type ModoLinea = "por_persona" | "por_grupo";

export interface LineaServicio {
  servicioId?:    string;     // ref al catálogo (si viene de catálogo)
  fromCatalog?:   boolean;    // true → codigo, descripcion, precio son de solo lectura
  tramoLabel?:    string;     // "1–2 personas", "3–5 personas", etc.
  codigo:         string;
  descripcion:    string;
  modo:           ModoLinea;
  cant:           number;     // siempre 1 — cantidad de excursiones
  pax:            number;     // número de personas (determina tramo y cálculo)
  precio:         number;     // precio plano del tramo (grupo) o precio × pax (persona)
  descuentoMonto: number;     // RD$ de descuento fijo sobre el total
  itbis:          number;
  fechaTour?:     string;
}

// ── Totales ───────────────────────────────────────────────────────
export interface Totales {
  bruto: number;
  desc:  number;
  sub:   number;
  itbis: number;
  total: number;
}

// ── Factura ───────────────────────────────────────────────────────
export type EstadoFactura = "pendiente" | "pagada" | "anulada";

export interface Factura {
  id:                    string;
  idTransaccion?:        string;
  noFactura:             string;
  eCF:                   string;
  tipoECF:               TipoECF;
  fecha:                 string;
  hora?:                 string;
  vencimientoECF:        string;
  abonoInicialMonto?:    number;
  abonoInicialMetodo?:   string;
  abonoInicialRef?:      string;
  terminos:              string;
  metodoPago?:           string;
  clienteId:             string;
  cotizacionRef?:        string;
  eCFRef?:               string;
  motivoNota?:           string;
  codigoModificacion?:   string;
  esConsumidorFinal?:    boolean;
  nombreConsumidor?:     string;
  telefonoConsumidor?:   string;
  estado:                EstadoFactura;
  items:                 LineaServicio[];
  notas?:                string;
  creadoEn?:             string;
  creadoPor?:            string;
  modalidadPago?:        "unico" | "plazo";
  fechaVencimientoPago?: string;
  // ── Identificación comprador ocasional E32 >= 250k ──
  rncCompradorOcasional?:  string;   // cédula (11 dígitos) o RNC (9 dígitos)
  esExtranjeroComprador?:  boolean;  // true → va en IdentificadorExtranjero
  // ── Campos DGII (se llenan al emitir) ──
  estadoDGII?:           "pendiente" | "Enviado" | "Aceptado" | "AceptadoCondicional" | "Rechazado" | "Anulada";
  trackIdDGII?:          string;
  urlQR?:                string;
  xmlFirmado?:           string;
  signatureValue?:       string;   // primeros+últimos chars del SignatureValue — para regenerar QR sin parsear XML
  codigoSeguridad?:      string;
  fechaEnvioDGII?:       string;
  fechaConsultaDGII?:    string;
  mensajesDGII?:         string[];
  fechaAnulacion?:       string;
}

// ── Factura Recibida (receptor DGII) ─────────────────────────────
export type EstadoARECF  = "pendiente" | "Enviado" | "Error";
export type EstadoACECF  = "pendiente" | "Aceptado" | "Rechazado" | "NoAplica";

export interface FacturaRecibida {
  id:                    string;   // = encf (documento único)
  encf:                  string;
  tipoECF:               string;
  rncEmisor:             string;
  razonSocialEmisor?:    string;
  rncComprador:          string;
  fechaEmision:          string;   // YYYY-MM-DD
  montoTotal:            number;
  // Acuse de Recibo
  estadoARECF:           EstadoARECF;
  fechaARECF?:           string;
  xmlARECF?:             string;
  // Aprobación Comercial
  estadoACECF:           EstadoACECF;
  motivoRechazoACECF?:   string;
  fechaACECF?:           string;
  xmlACECF?:             string;
  // Metadatos
  xmlRecibido?:          string;
  recibidoEn:            string;
}

// ── Cotización ────────────────────────────────────────────────────
export type EstadoCotizacion = "vigente" | "vencida" | "convertida" | "anulada";

export interface Cotizacion {
  id:           string;
  noCotizacion: string;
  fecha:        string;
  vencimiento:  string;
  validez?:     string;
  clienteId:    string;
  estado:       EstadoCotizacion;
  items:        LineaServicio[];
  notas?:       string;
  facturaRef?:  string;
  creadoEn?:    string;
}

// ── Usuario ───────────────────────────────────────────────────────
export type RolUsuario = "admin" | "vendedor" | "contador" | "viewer";

export interface UsuarioPerfil {
  uid:           string;
  email:         string;
  nombre:        string;
  rol:           RolUsuario;
  activo:        boolean;
  creadoEn?:     string;
  ultimoAcceso?: string;
}

// ── Abono ─────────────────────────────────────────────────────────
export interface Abono {
  id:            string;
  fecha:         string;
  monto:         number;
  metodoPago:    string;
  nota?:         string;
  registradoEn?: string;
}

// ── Cuenta por Cobrar ─────────────────────────────────────────────
export type EstadoCuenta = "vigente" | "vencida" | "pagada" | "anulada";

export interface CuentaPorCobrar {
  id:               string;
  clienteId:        string;
  numeroFactura:    string;
  fecha:            string;
  fechaVencimiento: string;
  monto:            number;
  pagado:           number;
  devuelto:         number;
  creditos:         number;
  estado:           EstadoCuenta;
  notas?:           string;
  abonos:           Abono[];
  creadoEn?:        string;
  actualizadoEn?:   string;
}

// ── calcLinea ─────────────────────────────────────────────────────
// Por grupo: precio es PLANO (total del grupo, no × cant)
// Por persona: precio × cant
export function calcLinea(item: LineaServicio) {
  // Por grupo: precio es PLANO (tarifa total del grupo según tramo)
  // Por persona: precio × pax (número de personas)
  const bruto   = item.modo === "por_grupo"
    ? item.precio
    : item.precio * (item.pax || 1);
  const descAmt  = Math.min(item.descuentoMonto || 0, bruto);
  const sub      = Math.max(0, bruto - descAmt);
  const itbisAmt = sub * (item.itbis || 0);
  return { bruto, descAmt, sub, itbisAmt, total: sub + itbisAmt };
}

export function calcTotales(items: LineaServicio[]): Totales {
  return items.reduce(
    (acc, item) => {
      const c = calcLinea(item);
      return {
        bruto: acc.bruto + c.bruto,
        desc:  acc.desc  + c.descAmt,
        sub:   acc.sub   + c.sub,
        itbis: acc.itbis + c.itbisAmt,
        total: acc.total + c.total,
      };
    },
    { bruto: 0, desc: 0, sub: 0, itbis: 0, total: 0 }
  );
}

// ── Helpers de formato ────────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-DO", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

export const localDate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = () => localDate();

export const genECF = (tipo: TipoECF, seq: number) =>
  `${tipo}${String(seq).padStart(10, "0")}`;

export const genCOT = (seq: number) =>
  `COT-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;

// ── Helpers CxC ──────────────────────────────────────────────────
export function calcPendiente(c: CuentaPorCobrar): number {
  return Math.max(0, c.monto - c.pagado - c.devuelto - c.creditos);
}

export function agingBucket(fechaVencStr: string): string {
  const dias = Math.floor(
    (Date.now() - new Date(fechaVencStr + "T12:00:00").getTime()) / 86400000
  );
  if (dias <= 0)   return "0-30";
  if (dias <= 30)  return "0-30";
  if (dias <= 60)  return "31-60";
  if (dias <= 90)  return "61-90";
  if (dias <= 120) return "91-120";
  return "+120";
}

// ── Resolver tipo e-CF ────────────────────────────────────────────
export interface ECFConfig {
  tipoDefault:      TipoECF;
  tiposDisponibles: TipoECF[];
  locked:           boolean;
  motivo:           string;
}

export function resolverECFConfig(
  cliente: Pick<Cliente, "tipo" | "subtipo" | "rnc"> | undefined,
  esWalkIn: boolean,
  esCompra = false,
): ECFConfig {
  // ── Modo Compra / Gasto ──────────────────────────────────────────
  if (esCompra) {
    if (esWalkIn || !cliente) {
      return {
        tipoDefault:      "E43",
        tiposDisponibles: ["E43", "E47"],
        locked:           false,
        motivo:           "Sin proveedor — E43 gasto menor / E47 pago al exterior",
      };
    }
    return {
      tipoDefault:      "E41",
      tiposDisponibles: ["E41"],
      locked:           true,
      motivo:           "Compra a proveedor local — E41",
    };
  }

  // ── Modo Venta (comportamiento original) ─────────────────────────
  if (esWalkIn || !cliente) {
    return { tipoDefault: "E32", tiposDisponibles: ["E32"], locked: true, motivo: "Consumidor final — E32" };
  }
  if (cliente.tipo === "consumidor" || (cliente.tipo === "fisica" && !cliente.rnc?.trim())) {
    return { tipoDefault: "E32", tiposDisponibles: ["E32"], locked: true, motivo: "Consumidor — solo E32" };
  }
  if (cliente.tipo === "fisica") {
    return { tipoDefault: "E31", tiposDisponibles: ["E31", "E32"], locked: false, motivo: "Persona física con RNC — E31 o E32" };
  }
  const subtipo = cliente.subtipo ?? "regular";
  if (subtipo === "gobierno")    return { tipoDefault: "E45", tiposDisponibles: ["E45", "E31"], locked: false, motivo: "Entidad gubernamental — E45" };
  if (subtipo === "zona_franca") return { tipoDefault: "E44", tiposDisponibles: ["E44", "E31"], locked: false, motivo: "Régimen especial — E44" };
  if (subtipo === "exportacion") return { tipoDefault: "E46", tiposDisponibles: ["E46", "E31"], locked: false, motivo: "Exportación — E46" };
  return { tipoDefault: "E31", tiposDisponibles: ["E31"], locked: true, motivo: "Empresa — E31" };
}

export function labelModo(modo: ModoLinea): string {
  return modo === "por_persona" ? "Por Persona" : "Por Grupo";
}