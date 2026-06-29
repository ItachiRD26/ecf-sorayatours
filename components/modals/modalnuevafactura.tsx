"use client";

import { useState, useEffect } from "react";
import type { Factura, LineaServicio, Cliente, Servicio, ModoLinea } from "@/types";
import {
  fmt, today, localDate, calcLinea, calcTotales,
  genECF, TIPOS_ECF, TERMINOS_PAGO, PLAZOS_CREDITO,
  resolverECFConfig, labelModo, getTierPrice, computeTourPrice,
} from "@/types";
import { nextSecuencia }      from "@/hooks/usesecuencias";
import Modal                  from "@/components/modals/modal";
import ModalServicios         from "@/components/modals/modalservicios";
import { ClienteSearchModal } from "@/components/ui/clientesearchmodal";
import { useAlerta }          from "@/hooks/usealerta";
import Icon                   from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#374151",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: sans,
};
const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
  background: "#0e7490", color: "#fff", border: "none", borderRadius: 4,
  cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans,
};
const btnSecondary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
  background: "#fff", color: "#374151", border: "1px solid #d1d5db",
  borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans,
};

const METODOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Cheque"] as const;
type MetodoPago = typeof METODOS_PAGO[number];

const REFERENCIA_CONFIG: Record<string, { label: string; placeholder: string } | null> = {
  Efectivo:      null,
  Tarjeta:       { label: "No. de Aprobacion", placeholder: "Ej: 123456" },
  Transferencia: { label: "Ref. Transferencia", placeholder: "Ej: TRF-001" },
  Cheque:        { label: "No. de Cheque",      placeholder: "Ej: 00123456" },
};

// cant = 1 siempre, pax = personas (o cantidad en modo compra)
const ITEM_VACIO: LineaServicio = {
  codigo: "", descripcion: "", modo: "por_grupo",
  cant: 1, pax: 0, precio: 0, descuentoMonto: 0, itbis: 0,
};

// Tipos donde los items son solo exentos (itbis=0 forzado)
const TIPOS_SOLO_EXENTO = new Set(["E43", "E47"]);

function clean<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

interface Props {
  clientes:       Cliente[];
  servicios:      Servicio[];
  facturas:       Factura[];
  onSave:         (data: Omit<Factura, "id">) => Promise<void>;
  onClose:        () => void;
  saving:         boolean;
  vencimientoECF?: string;
}

// ── Componente de linea de servicio ───────────────────────────────
function LineaItem({
  item, idx, total, servicios, onChange, onDelete, onSelectServicio, isPurchase,
}: {
  item:             LineaServicio;
  idx:              number;
  total:            number;
  servicios:        Servicio[];
  onChange:         <K extends keyof LineaServicio>(k: K, v: LineaServicio[K]) => void;
  onDelete:         () => void;
  onSelectServicio: () => void;
  isPurchase:       boolean;
}) {
  const c        = calcLinea(item);
  const locked   = !!item.fromCatalog;
  const servicio = servicios.find((s) => s.id === item.servicioId);

  // ¿El servicio usa pricing por tiers? (nuevos tours)
  const hasTiers = !isPurchase && locked && !!servicio?.tiers?.length;

  // Recalcula precio cuando cambian adultos/ninos en servicios con tiers
  const recalcularTiers = (adultos: number, ninos5a7: number, ninos0a4: number) => {
    if (!servicio?.tiers?.length) return;
    const efectivoPax = adultos + ninos5a7 * 0.5;
    const totalDOP    = computeTourPrice(servicio.tiers, efectivoPax);
    const paxTotal    = adultos + ninos5a7 + ninos0a4;
    const precioPP    = paxTotal > 0 ? Math.round(totalDOP / paxTotal) : 0;
    const partes: string[] = [];
    if (adultos  > 0) partes.push(adultos  + " adulto" + (adultos  > 1 ? "s" : ""));
    if (ninos5a7 > 0) partes.push(ninos5a7 + " niño"   + (ninos5a7 > 1 ? "s" : "") + " (5-7, 50%)");
    if (ninos0a4 > 0) partes.push(ninos0a4 + " niño"   + (ninos0a4 > 1 ? "s" : "") + " (0-4, gratis)");
    onChange("adultos",  adultos);
    onChange("ninos5a7", ninos5a7);
    onChange("ninos0a4", ninos0a4);
    onChange("pax",      paxTotal);
    onChange("precio",   precioPP);
    onChange("tramoLabel" as keyof LineaServicio, partes.join(" + ") as LineaServicio[keyof LineaServicio]);
  };

  const handlePaxChange = (val: string) => {
    const pax = val === "" ? 0 : parseInt(val) || 0;
    if (!isPurchase && locked && servicio && !hasTiers) {
      const tier = getTierPrice(servicio, pax, item.modo === "por_persona" ? "por_persona" : "por_grupo");
      onChange("pax",        pax);
      onChange("precio",     tier.precio);
      onChange("modo",       tier.modoResultante);
      onChange("tramoLabel" as keyof LineaServicio, tier.tramoLabel as LineaServicio[keyof LineaServicio]);
    } else {
      onChange("pax", pax);
    }
  };

  const lockedStyle: React.CSSProperties = {
    ...inputStyle, background: "#f3f4f6", color: "#374151", cursor: "not-allowed",
  };

  // En modo compra, "PAX" se convierte en "Cant."
  const paxLabel        = isPurchase ? "Cant." : "PAX";
  const paxBorderColor  = isPurchase ? "#d1d5db" : "#a5f3fc";
  const paxBg           = isPurchase ? "#fff"    : "#ecfeff";
  const paxColor        = isPurchase ? "#111"    : "#0e7490";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "12px 14px", background: locked ? "#fafffe" : "#fafafa", borderLeft: locked ? "3px solid #0e7490" : "3px solid #e5e7eb" }}>

      {/* Fila de código + descripción */}
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Codigo</label>
          <div style={{ display: "flex", gap: 3 }}>
            <input style={{ ...(locked ? lockedStyle : inputStyle), fontSize: 12 }}
              value={item.codigo} readOnly={locked} placeholder="---"
              onClick={locked ? undefined : onSelectServicio}
              onChange={locked ? () => {} : (e) => onChange("codigo", e.target.value)} />
            {!locked && (
              <button type="button" onClick={onSelectServicio}
                style={{ padding: "0 7px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Icon name="search" size={12} />
              </button>
            )}
          </div>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Descripcion</label>
          <input style={{ ...(locked ? lockedStyle : inputStyle), fontSize: 12 }}
            value={item.descripcion} readOnly={locked} placeholder="Descripcion del servicio"
            onChange={locked ? () => {} : (e) => onChange("descripcion", e.target.value)} />
        </div>
        <button type="button" onClick={onDelete} disabled={total === 1}
          style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "6px 8px", cursor: total === 1 ? "not-allowed" : "pointer", color: "#dc2626", display: "flex", alignItems: "center", opacity: total === 1 ? 0.4 : 1 }}>
          <Icon name="trash" size={13} />
        </button>
      </div>

      {/* Fila de personas / PAX */}
      {hasTiers ? (
        /* Tour con tiers dinámicos: inputs de adultos y niños */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 110px", gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 10, color: "#0e7490" }}>Adultos (8+)</label>
            <input type="number" min="0" style={{ ...inputStyle, fontSize: 13, fontWeight: 700, textAlign: "center", borderColor: "#a5f3fc", background: "#ecfeff", color: "#0e7490" }}
              value={(item.adultos ?? 0) === 0 ? "" : item.adultos}
              placeholder="0"
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0;
                recalcularTiers(v, item.ninos5a7 ?? 0, item.ninos0a4 ?? 0);
              }} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10, color: "#7c3aed" }}>Niños 5-7 (50%)</label>
            <input type="number" min="0" style={{ ...inputStyle, fontSize: 13, fontWeight: 700, textAlign: "center", borderColor: "#ddd6fe", background: "#f5f3ff", color: "#7c3aed" }}
              value={(item.ninos5a7 ?? 0) === 0 ? "" : item.ninos5a7}
              placeholder="0"
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0;
                recalcularTiers(item.adultos ?? 0, v, item.ninos0a4 ?? 0);
              }} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10, color: "#166534" }}>Niños 0-4 (gratis)</label>
            <input type="number" min="0" style={{ ...inputStyle, fontSize: 13, fontWeight: 700, textAlign: "center", borderColor: "#bbf7d0", background: "#f0faf4", color: "#166534" }}
              value={(item.ninos0a4 ?? 0) === 0 ? "" : item.ninos0a4}
              placeholder="0"
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0;
                recalcularTiers(item.adultos ?? 0, item.ninos5a7 ?? 0, v);
              }} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10 }}>Desc. RD$</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9ca3af", fontFamily: mono }}>$</span>
              <input type="number" min="0" step="0.01"
                style={{ ...inputStyle, fontSize: 12, paddingLeft: 20, fontFamily: mono }}
                value={item.descuentoMonto === 0 ? "" : item.descuentoMonto} placeholder="0"
                onChange={(e) => onChange("descuentoMonto", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      ) : (
        /* Servicio sin tiers (legacy) o compra */
        <div style={{ display: "grid", gridTemplateColumns: isPurchase ? "80px 90px auto" : "70px 80px 90px auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
          {!isPurchase && (
            <div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Cant.</label>
              <div style={{ ...inputStyle, fontSize: 12, background: "#f3f4f6", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>1</div>
            </div>
          )}
          <div>
            <label style={{ ...labelStyle, fontSize: 10, color: isPurchase ? "#374151" : "#0e7490" }}>{paxLabel}</label>
            <input type="number" min="0" style={{ ...inputStyle, fontSize: 13, fontWeight: 700, textAlign: "center", borderColor: paxBorderColor, background: paxBg, color: paxColor }}
              value={item.pax === 0 ? "" : item.pax} placeholder="0"
              onChange={(e) => handlePaxChange(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10 }}>Desc. RD$</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9ca3af", fontFamily: mono }}>$</span>
              <input type="number" min="0" step="0.01"
                style={{ ...inputStyle, fontSize: 12, paddingLeft: 20, fontFamily: mono }}
                value={item.descuentoMonto === 0 ? "" : item.descuentoMonto} placeholder="0"
                onChange={(e) => onChange("descuentoMonto", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div />
        </div>
      )}

      {/* Info de línea */}
      {item.descripcion && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>

          {hasTiers && item.pax > 0 && item.precio > 0 && (
            <span style={{ fontSize: 11, color: "#374151", fontFamily: sans, fontWeight: 600 }}>
              {item.pax} pax × RD$ {fmt(item.precio)}/p.
            </span>
          )}

          {!isPurchase && !hasTiers && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, fontFamily: sans, fontWeight: 600, background: item.modo === "por_grupo" ? "#ecfeff" : "#f0faf4", color: item.modo === "por_grupo" ? "#0e7490" : "#166534", border: "1px solid " + (item.modo === "por_grupo" ? "#a5f3fc" : "#bbf7d0") }}>
              {item.modo === "por_grupo" ? "Grupo" : "Por Persona"}
            </span>
          )}

          {!hasTiers && locked && item.tramoLabel && (
            <span style={{ fontSize: 11, color: "#6b7280", fontFamily: sans }}>
              Tramo: <strong style={{ color: "#374151" }}>{item.tramoLabel}</strong>
            </span>
          )}

          {hasTiers && item.tramoLabel && (
            <span style={{ fontSize: 10, color: "#6b7280", fontFamily: sans }}>{item.tramoLabel}</span>
          )}

          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, fontFamily: sans, background: item.itbis === 0 ? "#f0faf4" : "#eff6ff", color: item.itbis === 0 ? "#166534" : "#1d4ed8", border: "1px solid " + (item.itbis === 0 ? "#bbf7d0" : "#bfdbfe") }}>
            {item.itbis === 0 ? "Exento" : ("ITBIS " + item.itbis * 100 + "%" + (item.incluyeITBIS ? " incl." : ""))}
          </span>

          {item.descuentoMonto > 0 && (
            <span style={{ fontSize: 11, color: "#dc2626", fontFamily: sans }}>
              {"− RD$ " + fmt(item.descuentoMonto)}
            </span>
          )}

          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 14, fontWeight: 700, color: "#111" }}>
            RD$ {fmt(c.total)}
          </span>
        </div>
      )}

      {/* Fecha del tour — solo ventas */}
      {!isPurchase && item.descripcion && (
        <div style={{ marginTop: 8 }}>
          <input type="date" title="Fecha de la excursion (opcional)"
            style={{ ...inputStyle, fontSize: 11, padding: "5px 10px", maxWidth: 180 }}
            value={item.fechaTour || ""}
            onChange={(e) => onChange("fechaTour", e.target.value || undefined)} />
        </div>
      )}

      {/* Aviso 9+ auto-cambio — solo ventas */}
      {!isPurchase && locked && item.modo === "por_persona" && item.pax >= 9 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#0e7490", fontFamily: sans, background: "#ecfeff", padding: "5px 10px", borderRadius: 4, border: "1px solid #a5f3fc" }}>
          {"ℹ️ " + item.pax + " PAX — cobro por persona (9+ aplica tarifa individual)"}
        </div>
      )}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────
export default function ModalNuevaFactura({ clientes, servicios, facturas, onSave, onClose, saving, vencimientoECF }: Props) {
  const vencimientoDefault = vencimientoECF || "2027-12-31";
  const [esCompra,           setEsCompra]           = useState(false);
  const [esWalkIn,           setEsWalkIn]           = useState(false);
  const [nombreWalkIn,       setNombreWalkIn]       = useState("");
  const [telefonoWalkIn,     setTelefonoWalkIn]     = useState("");
  const [idExtranjero,       setIdExtranjero]       = useState("");  // para E47
  const [items,              setItems]              = useState<LineaServicio[]>([{ ...ITEM_VACIO }]);
  const [form, setForm] = useState({
    tipoECF:        "E31" as import("@/types").TipoECF,
    clienteId:      "",
    fecha:          today(),
    vencimientoECF: vencimientoDefault,
    terminos:       "Contado" as typeof TERMINOS_PAGO[number],
    metodoPago:     "Efectivo" as MetodoPago,
    cotizacionRef:  "",
  });
  const [plazoCredito, setPlazoCredito] = useState<typeof PLAZOS_CREDITO[number]>("30 Días");
  const [referencia,         setReferencia]         = useState("");
  const [notas,              setNotas]              = useState("");
  const [tieneAbonoInicial,  setTieneAbonoInicial]  = useState(false);
  const [montoAbonoInicial,  setMontoAbonoInicial]  = useState(0);
  const [metodoAbonoInicial, setMetodoAbonoInicial] = useState<MetodoPago>("Efectivo");
  const [refAbonoInicial,    setRefAbonoInicial]    = useState("");
  const [showServicios,        setShowServicios]        = useState<number | null>(null);
  const [showClienteModal,     setShowClienteModal]     = useState(false);
  const [showConfirmacion,     setShowConfirmacion]     = useState(false);
  const [rncOcasional,         setRncOcasional]         = useState("");
  const [esExtranjeroOcasional,setEsExtranjeroOcasional]= useState(false);
  const { mostrar: alertaDuplicado, AlertaUI }          = useAlerta();

  const clienteSeleccionado = clientes.find((c) => c.id === form.clienteId);
  const ecfConfig           = resolverECFConfig(esWalkIn ? undefined : clienteSeleccionado, esWalkIn, esCompra);
  const esContado           = form.terminos === "Contado";
  const diasPlazo           = parseInt(plazoCredito) || 30;
  const refConfig           = esContado ? REFERENCIA_CONFIG[form.metodoPago] : null;
  const requiereReferencia  = esContado && !!refConfig;

  // Tipos de compras — no usan PAX ni modo tour
  const isPurchase = ["E41", "E43", "E47"].includes(form.tipoECF);

  // Ajustar tipo cuando cambia modo compra/venta o cliente
  useEffect(() => {
    const cfg = resolverECFConfig(esWalkIn ? undefined : clientes.find((c) => c.id === form.clienteId), esWalkIn, esCompra);
    if (!cfg.tiposDisponibles.includes(form.tipoECF))
      setForm((p) => ({ ...p, tipoECF: cfg.tipoDefault }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clienteId, esWalkIn, esCompra]);

  const t          = calcTotales(items);
  const eCFPreview = genECF(form.tipoECF, facturas.filter((f) => f.tipoECF === form.tipoECF).length + 1);
  const setF       = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((p) => ({ ...p, [k]: v }));

  // E32 >= 250k sin RNC registrado → exigir cédula/RNC
  const necesitaIdentificacion =
    form.tipoECF === "E32" &&
    t.total >= 250_000 &&
    !clienteSeleccionado?.rnc?.trim();

  const vencimientoPorTipo = (tipo: string): string =>
    tipo === "E32" ? "2099-12-31" : vencimientoDefault;

  const updateItem = (i: number) => <K extends keyof LineaServicio>(k: K, v: LineaServicio[K]) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  // Cuando cambia al modo compra → reset estado del formulario
  const handleToggleCompra = (v: boolean) => {
    setEsCompra(v);
    setEsWalkIn(false);
    setNombreWalkIn("");
    setTelefonoWalkIn("");
    setIdExtranjero("");
    setForm((p) => ({ ...p, clienteId: "", tipoECF: v ? "E43" : "E31", vencimientoECF: vencimientoDefault }));
    setItems([{ ...ITEM_VACIO }]);
    setRncOcasional("");
    setEsExtranjeroOcasional(false);
  };

  const handleValidar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!esWalkIn && !form.clienteId && form.tipoECF !== "E43") return alert(esCompra ? "Selecciona un proveedor" : "Selecciona un cliente");
    if (esWalkIn && !nombreWalkIn.trim())   return alert("El nombre es obligatorio");
    if (items.every((i) => !i.descripcion)) return alert("Agrega al menos un item");
    if (requiereReferencia && !referencia.trim()) return alert("Ingresa el " + refConfig?.label);
    if (necesitaIdentificacion && !rncOcasional.trim())
      return alert("E32 ≥ RD$250,000 requiere cédula o RNC del comprador");
    const digits = rncOcasional.replace(/\D/g, "");
    if (necesitaIdentificacion && !esExtranjeroOcasional && digits.length !== 9 && digits.length !== 11)
      return alert("La cédula debe tener 11 dígitos y el RNC empresarial 9 dígitos");
    // E47 requiere ID extranjero
    if (form.tipoECF === "E47" && !idExtranjero.trim())
      return alert("E47 requiere el ID o pasaporte del beneficiario exterior");
    setShowConfirmacion(true);
  };

  const handleEmitir = async () => {
    const fechaVencPago = !esContado
      ? (() => { const d = new Date(); d.setDate(d.getDate() + diasPlazo); return localDate(d); })()
      : undefined;
    const seq = await nextSecuencia(form.tipoECF);
    const eCF = genECF(form.tipoECF, seq);

    // idTransaccion: E47 → ID extranjero del beneficiario; demás → ref de pago
    const idTransaccionValue = form.tipoECF === "E47" && idExtranjero
      ? idExtranjero
      : (esContado && referencia) ? referencia : undefined;

    await onSave(clean({
      noFactura: String(seq), eCF, tipoECF: form.tipoECF,
      fecha: form.fecha, vencimientoECF: form.vencimientoECF,
      terminos: esContado ? "Contado" : plazoCredito,
      clienteId: esWalkIn ? "walk-in" : (form.clienteId || "walk-in"),
      cotizacionRef: form.cotizacionRef || undefined,
      estado: esContado ? "pagada" : "pendiente",
      metodoPago: esContado ? form.metodoPago : undefined,
      idTransaccion: idTransaccionValue,
      modalidadPago: esContado ? "unico" : "plazo",
      fechaVencimientoPago: fechaVencPago,
      esConsumidorFinal: esWalkIn,
      nombreConsumidor:  esWalkIn ? (nombreWalkIn || (esCompra ? "BENEFICIARIO EXTERIOR" : "Consumidor Final")) : undefined,
      telefonoConsumidor: (!esCompra && esWalkIn) ? (telefonoWalkIn || undefined) : undefined,
      rncCompradorOcasional: (necesitaIdentificacion && rncOcasional.trim()) ? rncOcasional.trim() : undefined,
      esExtranjeroComprador: (necesitaIdentificacion && esExtranjeroOcasional) ? true : undefined,
      items: items.filter((i) => i.descripcion),
      notas: notas || undefined,
      abonoInicialMonto:  (!esContado && tieneAbonoInicial && montoAbonoInicial > 0) ? montoAbonoInicial  : undefined,
      abonoInicialMetodo: (!esContado && tieneAbonoInicial && montoAbonoInicial > 0) ? metodoAbonoInicial : undefined,
      abonoInicialRef:    (!esContado && tieneAbonoInicial && refAbonoInicial)        ? refAbonoInicial    : undefined,
    }) as Omit<Factura, "id">);
  };

  // Label según modo
  const labelEntidad = esCompra
    ? (esWalkIn ? (form.tipoECF === "E47" ? "Beneficiario Exterior" : "Sin Proveedor (E43)") : "Proveedor")
    : "Cliente";
  const labelSinRNC  = esCompra
    ? (form.tipoECF === "E47" ? "Pago al exterior — E47" : "Gasto sin proveedor — E43")
    : "Sin RNC -- emite E32";
  const labelWalkIn  = esCompra
    ? (form.tipoECF === "E47" ? "Beneficiario exterior / E47" : "Sin proveedor (E43)")
    : "Consumidor Final / Turista";

  return (
    <Modal title="Nueva Factura" onClose={onClose} width={1200}>
      <form onSubmit={handleValidar}>
        <div className="factura-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── COLUMNA IZQUIERDA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Toggle Venta / Compra */}
            <div style={{ display: "flex", gap: 0, borderRadius: 4, overflow: "hidden", border: "1px solid #d1d5db" }}>
              {[
                { v: false, label: "Venta / Servicio", icon: "📤" },
                { v: true,  label: "Compra / Gasto",   icon: "📥" },
              ].map(({ v, label, icon }) => (
                <button key={String(v)} type="button"
                  onClick={() => handleToggleCompra(v)}
                  style={{ flex: 1, padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 11, fontFamily: sans, fontWeight: 600,
                    background: esCompra === v ? (v ? "#7c3aed" : "#0e7490") : "#fff",
                    color: esCompra === v ? "#fff" : "#6b7280" }}>
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* eCF Preview */}
            <div style={{ background: "#111", borderRadius: 4, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em" }}>e-CF</span>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: "#fff" }}>{eCFPreview}</span>
            </div>

            {/* Tipo eCF + Fecha */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Tipo e-CF</label>
                {ecfConfig.locked ? (
                  <div style={{ ...inputStyle, fontSize: 12, display: "flex", alignItems: "center", background: "#f9fafb", cursor: "default" }}>
                    <span style={{ fontFamily: mono, fontWeight: 700 }}>{ecfConfig.tipoDefault}</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    {ecfConfig.tiposDisponibles.map((codigo) => {
                      const meta   = TIPOS_ECF.find((t) => t.codigo === codigo);
                      const activo = form.tipoECF === codigo;
                      return (
                        <button key={codigo} type="button" onClick={() => setForm((p) => ({ ...p, tipoECF: codigo, vencimientoECF: vencimientoPorTipo(codigo) }))}
                          style={{ flex: 1, padding: "7px 8px", textAlign: "center", border: "2px solid " + (activo ? (esCompra ? "#7c3aed" : "#0e7490") : "#e5e7eb"), borderRadius: 4, cursor: "pointer", background: activo ? (esCompra ? "#7c3aed" : "#0e7490") : "#fff", color: activo ? "#fff" : "#374151" }}>
                          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{codigo}</div>
                          <div style={{ fontSize: 9, color: activo ? "rgba(255,255,255,0.6)" : "#9ca3af", fontFamily: sans }}>{meta?.label.split("---")[1]?.trim() ?? meta?.label}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontFamily: sans }}>{ecfConfig.motivo}</div>
              </div>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" style={{ ...inputStyle, fontSize: 12 }} value={form.fecha} onChange={(e) => setF("fecha", e.target.value)} />
              </div>
            </div>

            {/* Cliente / Proveedor */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>{labelEntidad}</div>

              {/* Walk-in / Sin proveedor toggle — no aplica cuando tipo está locked con proveedor */}
              {!(esCompra && ecfConfig.locked) && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 12px", background: esWalkIn ? "#fffbeb" : "#f9fafb", border: "1px solid " + (esWalkIn ? "#fde68a" : "#e5e7eb"), borderRadius: 4, marginBottom: 8, userSelect: "none" }}>
                  <div onClick={() => { setEsWalkIn((v) => !v); if (!esWalkIn) setForm((p) => ({ ...p, clienteId: "" })); }}
                    style={{ width: 16, height: 16, border: "2px solid " + (esWalkIn ? "#92400e" : "#d1d5db"), borderRadius: 3, background: esWalkIn ? "#92400e" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                    {esWalkIn && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: sans, color: esWalkIn ? "#92400e" : "#374151" }}>{labelWalkIn}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans }}>{labelSinRNC}</div>
                  </div>
                </label>
              )}

              {esWalkIn ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input style={{ ...inputStyle, fontSize: 12 }}
                    placeholder={esCompra ? (form.tipoECF === "E47" ? "Nombre del beneficiario / empresa exterior *" : "Descripción del gasto (opcional)") : "Nombre del turista / grupo *"}
                    value={nombreWalkIn}
                    onChange={(e) => setNombreWalkIn(e.target.value)} />
                  {/* Teléfono — solo en ventas walk-in */}
                  {!esCompra && (
                    <input style={{ ...inputStyle, fontSize: 12, fontFamily: mono }} placeholder="Telefono (opcional)"
                      value={telefonoWalkIn} type="tel" maxLength={12}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 10);
                        let f = d;
                        if (d.length > 6) f = d.slice(0,3) + "-" + d.slice(3,6) + "-" + d.slice(6);
                        else if (d.length > 3) f = d.slice(0,3) + "-" + d.slice(3);
                        setTelefonoWalkIn(f);
                      }} />
                  )}
                  {/* ID Extranjero — E47 */}
                  {form.tipoECF === "E47" && (
                    <div>
                      <label style={{ ...labelStyle, fontSize: 10 }}>ID / Pasaporte Extranjero <span style={{ color: "#dc2626" }}>*</span></label>
                      <input style={{ ...inputStyle, fontSize: 12, fontFamily: mono, borderColor: "#f59e0b" }}
                        placeholder="Ej: 350555123"
                        value={idExtranjero}
                        onChange={(e) => setIdExtranjero(e.target.value)} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => setShowClienteModal(true)}
                    style={{ width: "100%", textAlign: "left", ...inputStyle, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <span style={{ color: clienteSeleccionado ? "#111" : "#9ca3af" }}>
                      {clienteSeleccionado ? clienteSeleccionado.nombre : (esCompra ? "--- Buscar proveedor ---" : "--- Buscar cliente ---")}
                    </span>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
                  </button>
                  {clienteSeleccionado && (
                    <div style={{ marginTop: 6, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "7px 12px", fontSize: 11, fontFamily: sans, lineHeight: 1.8 }}>
                      <span style={{ color: "#6b7280" }}>e-CF: </span><strong>{ecfConfig.motivo}</strong>
                      {clienteSeleccionado.rnc && <><br/><span style={{ color: "#6b7280" }}>RNC: </span><strong>{clienteSeleccionado.rnc}</strong></>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Identificacion comprador E32 >= 250k — solo ventas */}
            {!esCompra && necesitaIdentificacion && (
              <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
                  ⚠ Identificación requerida — E32 ≥ RD$250,000
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}>
                  <input type="checkbox" checked={esExtranjeroOcasional}
                    onChange={(e) => { setEsExtranjeroOcasional(e.target.checked); setRncOcasional(""); }} />
                  <span style={{ fontSize: 12, color: "#374151", fontFamily: sans }}>Comprador extranjero / diplomático</span>
                </label>
                <label style={{ ...labelStyle, fontSize: 10 }}>
                  {esExtranjeroOcasional ? "Identificador Extranjero" : "Cédula (11 díg.) o RNC (9 díg.)"}
                  <span style={{ color: "#dc2626" }}> *</span>
                </label>
                <input
                  style={{ ...inputStyle, fontSize: 13, fontFamily: mono, borderColor: "#f59e0b" }}
                  placeholder={esExtranjeroOcasional ? "Ej: P0012345678" : "Ej: 40212345678"}
                  value={rncOcasional}
                  maxLength={esExtranjeroOcasional ? 20 : 11}
                  onChange={(e) => {
                    const v = esExtranjeroOcasional
                      ? e.target.value
                      : e.target.value.replace(/\D/g, "").slice(0, 11);
                    setRncOcasional(v);
                  }}
                />
              </div>
            )}

            {/* Pago */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>Pago</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {TERMINOS_PAGO.map((t) => (
                  <button key={t} type="button"
                    onClick={() => { setF("terminos", t); setReferencia(""); setTieneAbonoInicial(false); setMontoAbonoInicial(0); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans, fontWeight: 500, border: "2px solid " + (form.terminos === t ? "#111" : "#e5e7eb"), background: form.terminos === t ? "#111" : "#fff", color: form.terminos === t ? "#fff" : "#374151" }}>
                    {t}
                  </button>
                ))}
              </div>
              {!esContado && (
                <select style={{ ...inputStyle, fontSize: 12, marginBottom: 8 }} value={plazoCredito}
                  onChange={(e) => setPlazoCredito(e.target.value as typeof PLAZOS_CREDITO[number])}>
                  {PLAZOS_CREDITO.map((p) => <option key={p}>{p}</option>)}
                </select>
              )}
              {esContado && (
                <select style={{ ...inputStyle, fontSize: 12, marginBottom: refConfig ? 8 : 0 }} value={form.metodoPago}
                  onChange={(e) => { setF("metodoPago", e.target.value as MetodoPago); setReferencia(""); }}>
                  {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              {/* Referencia de pago — no para E47 (usa idExtranjero) */}
              {esContado && refConfig && form.tipoECF !== "E47" && (
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>{refConfig.label} <span style={{ color: "#dc2626" }}>*</span></label>
                  <input required style={{ ...inputStyle, fontSize: 12, fontFamily: mono }}
                    placeholder={refConfig.placeholder} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                </div>
              )}
            </div>

            {/* Abono inicial — solo ventas a crédito */}
            {!esCompra && !esContado && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: tieneAbonoInicial ? "#f0faf4" : "#f9fafb", userSelect: "none" }}>
                  <div onClick={() => { setTieneAbonoInicial((v) => !v); setMontoAbonoInicial(0); setRefAbonoInicial(""); }}
                    style={{ width: 16, height: 16, border: "2px solid " + (tieneAbonoInicial ? "#166534" : "#d1d5db"), borderRadius: 3, background: tieneAbonoInicial ? "#166534" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                    {tieneAbonoInicial && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: sans }}>
                    <div style={{ fontWeight: 600, color: tieneAbonoInicial ? "#166534" : "#374151" }}>Abono inicial</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>Pago parcial al emitir</div>
                  </div>
                </label>
                {tieneAbonoInicial && (
                  <div style={{ padding: "10px 12px", background: "#f0faf4", display: "flex", flexDirection: "column", gap: 8 }}>
                    <input type="number" min="0.01" step="0.01"
                      style={{ ...inputStyle, fontSize: 12, fontFamily: mono, textAlign: "right" }}
                      value={montoAbonoInicial || ""} placeholder="0.00"
                      onChange={(e) => { const val = e.target.value; setMontoAbonoInicial(val === "" ? 0 : parseFloat(val) || 0); }} />
                    <select style={{ ...inputStyle, fontSize: 12 }} value={metodoAbonoInicial}
                      onChange={(e) => { setMetodoAbonoInicial(e.target.value as MetodoPago); setRefAbonoInicial(""); }}>
                      {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {REFERENCIA_CONFIG[metodoAbonoInicial] && (
                      <input required style={{ ...inputStyle, fontSize: 12, fontFamily: mono }}
                        placeholder={REFERENCIA_CONFIG[metodoAbonoInicial]?.placeholder}
                        value={refAbonoInicial} onChange={(e) => setRefAbonoInicial(e.target.value)} />
                    )}
                    {montoAbonoInicial > 0 && montoAbonoInicial < t.total && (
                      <div style={{ fontSize: 11, color: "#166534", fontFamily: sans }}>Pendiente: RD$ {fmt(t.total - montoAbonoInicial)}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <input style={{ ...inputStyle, fontSize: 12 }} placeholder="Ref. Cotizacion (opcional)"
              value={form.cotizacionRef} onChange={(e) => setF("cotizacionRef", e.target.value)} />
            <textarea style={{ ...inputStyle, fontSize: 12, height: 54, resize: "none" } as React.CSSProperties}
              placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

            {esContado
              ? <div style={{ padding: "8px 12px", background: "#f0faf4", border: "1px solid #bbf7d0", borderRadius: 4, fontSize: 11, fontFamily: sans, color: "#166534" }}>Contado -- quedara como <strong>Pagada</strong></div>
              : <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, fontSize: 11, fontFamily: sans, color: "#1d4ed8" }}>A {plazoCredito} -- ira a <strong>Cuentas por Cobrar</strong></div>
            }

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1, justifyContent: "center" }}>Cancelar</button>
              <button type="submit" disabled={saving}
                style={{ ...btnPrimary, flex: 1, justifyContent: "center", background: saving ? "#d1d5db" : (esCompra ? "#7c3aed" : "#0e7490"), cursor: saving ? "not-allowed" : "pointer" }}>
                Revisar
              </button>
            </div>
          </div>

          {/* ── COLUMNA DERECHA: ITEMS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans }}>
                {isPurchase ? "Items / Servicios adquiridos" : "Servicios / Excursiones"}
              </div>
              {!isPurchase && (
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280", fontFamily: sans }}>
                  <span style={{ background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", padding: "2px 8px", borderRadius: 3, fontWeight: 600 }}>PAX = personas</span>
                  <span>Cant. = 1 excursion siempre</span>
                </div>
              )}
              {isPurchase && (
                <div style={{ fontSize: 11, color: "#7c3aed", fontFamily: sans, background: "#f5f3ff", border: "1px solid #ddd6fe", padding: "2px 10px", borderRadius: 3, fontWeight: 600 }}>
                  {form.tipoECF === "E43" ? "E43 — todo exento de ITBIS" : form.tipoECF === "E47" ? "E47 — retención ISR 27%" : "E41 — retención ITBIS + ISR 10%"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(90vh - 200px)", overflowY: "auto", paddingRight: 2 }}>
              {items.map((item, i) => (
                <LineaItem key={i} item={item} idx={i} total={items.length} servicios={servicios}
                  isPurchase={isPurchase}
                  onChange={updateItem(i)}
                  onDelete={() => { if (items.length > 1) setItems((p) => p.filter((_, idx) => idx !== i)); }}
                  onSelectServicio={() => setShowServicios(i)} />
              ))}
            </div>

            <button type="button" onClick={() => setItems((p) => [...p, { ...ITEM_VACIO }])} style={{ ...btnSecondary, fontSize: 12, alignSelf: "flex-start" }}>
              <Icon name="plus" size={13} /> Agregar Linea
            </button>

            {/* Totales */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 280, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                {[
                  ["Total Bruto", fmt(t.bruto), "#374151"],
                  ["Descuentos",  fmt(t.desc),  "#dc2626"],
                  ["Sub Total",   fmt(t.sub),   "#374151"],
                  ["ITBIS",       fmt(t.itbis), "#1d4ed8"],
                ].map(([l, v, col]) => (
                  <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #e5e7eb", fontFamily: sans, fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>{l as string}</span>
                    <span style={{ fontFamily: mono, color: col as string, fontWeight: 500 }}>RD$ {v as string}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: esCompra ? "#7c3aed" : "#0e7490" }}>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: "#fff" }}>Total Neto RD$</span>
                  <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: "#fff" }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Selector de servicio */}
      {showServicios !== null && (
        <ModalServicios servicios={servicios}
          onSelect={(s, modo) => {
            const itbisOverride = TIPOS_SOLO_EXENTO.has(form.tipoECF) ? 0 : s.itbis;
            const hasTiersS     = !isPurchase && !!s.tiers?.length;

            setItems((prev) => {
              const existIdx = prev.findIndex((it) => it.servicioId === s.id);
              if (existIdx >= 0) {
                alertaDuplicado({ titulo: "Item ya agregado", mensaje: ("\"" + s.nombre + "\" ya esta en la linea " + (existIdx + 1) + ".") });
                return prev;
              }

              let nuevaLinea: LineaServicio;
              if (isPurchase) {
                // Compra: por persona simple
                nuevaLinea = { ...ITEM_VACIO, servicioId: s.id, fromCatalog: true, codigo: s.codigo, descripcion: s.nombre, modo: "por_persona", precio: s.precioPorPersona ?? 0, tramoLabel: "", itbis: itbisOverride, incluyeITBIS: s.incluyeITBIS, cant: 1, pax: 1 };
              } else if (hasTiersS) {
                // Tour con tiers: inicializar vacío, el usuario ingresará adultos/niños
                nuevaLinea = { ...ITEM_VACIO, servicioId: s.id, fromCatalog: true, codigo: s.codigo, descripcion: s.nombre, modo: "por_persona", precio: 0, tramoLabel: "", itbis: itbisOverride, incluyeITBIS: s.incluyeITBIS, cant: 1, pax: 0, adultos: 0, ninos5a7: 0, ninos0a4: 0 };
              } else {
                // Tour legacy con tramos fijos
                const pax  = prev[showServicios!]?.pax || 0;
                const tier = getTierPrice(s, pax, modo === "por_persona" ? "por_persona" : "por_grupo");
                nuevaLinea = { ...ITEM_VACIO, servicioId: s.id, fromCatalog: true, codigo: s.codigo, descripcion: s.nombre, modo: tier.modoResultante, precio: tier.precio, tramoLabel: tier.tramoLabel, itbis: itbisOverride, incluyeITBIS: s.incluyeITBIS, cant: 1, pax };
              }

              const updated = prev.map((item, idx) => idx === showServicios ? nuevaLinea : item);
              if (showServicios === prev.length - 1) updated.push({ ...ITEM_VACIO });
              return updated;
            });
            setShowServicios(null);
          }}
          onClose={() => setShowServicios(null)} />
      )}

      {/* Busqueda de cliente / proveedor */}
      {showClienteModal && (
        <ClienteSearchModal clientes={clientes}
          onSelect={(c) => { setF("clienteId", c.id); setShowClienteModal(false); }}
          onClose={() => setShowClienteModal(false)} />
      )}

      {/* Confirmacion */}
      {showConfirmacion && (() => {
        const itemsFiltrados = items.filter((i) => i.descripcion);
        const totales        = calcTotales(itemsFiltrados);
        const nombreEntidad  = esWalkIn
          ? (nombreWalkIn || (esCompra ? "Sin proveedor" : "Consumidor Final"))
          : (clienteSeleccionado?.nombre ?? "---");
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 580, maxHeight: "92vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
              <div style={{ padding: "18px 24px", background: esCompra ? "#7c3aed" : "#0e7490", borderRadius: "4px 4px 0 0" }}>
                <div style={{ fontFamily: serif, fontSize: 16, fontWeight: 700, color: "#fff" }}>Confirmar emision</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: sans }}>Revisa los datos antes de emitir el comprobante fiscal</div>
              </div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "12px 16px", fontSize: 12, fontFamily: sans, lineHeight: 1.9 }}>
                  <div><span style={{ color: "#6b7280" }}>{esCompra ? "Proveedor: " : "Cliente: "}</span><strong>{nombreEntidad}</strong></div>
                  <div><span style={{ color: "#6b7280" }}>Tipo e-CF: </span><strong style={{ fontFamily: mono }}>{form.tipoECF}</strong></div>
                  <div><span style={{ color: "#6b7280" }}>Fecha: </span><strong>{form.fecha}</strong></div>
                  <div><span style={{ color: "#6b7280" }}>Pago: </span><strong style={{ color: esContado ? "#166534" : "#1d4ed8" }}>{esContado ? ("Contado -- " + form.metodoPago) : ("Credito -- " + plazoCredito)}</strong></div>
                  {form.tipoECF === "E47" && idExtranjero && <div><span style={{ color: "#6b7280" }}>ID Extranjero: </span><strong style={{ fontFamily: mono }}>{idExtranjero}</strong></div>}
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {isPurchase
                          ? ["Descripción", "Cant.", "Precio Unit.", "Desc.", "Total"].map((h) => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                            ))
                          : ["Servicio", "Modo", "PAX", "Precio", "Desc.", "Total"].map((h) => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                            ))
                        }
                      </tr>
                    </thead>
                    <tbody>
                      {itemsFiltrados.map((item, i) => {
                        const c = calcLinea(item);
                        if (isPurchase) {
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "9px 10px", fontSize: 12, color: "#111" }}>{item.descripcion}</td>
                              <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{item.pax || 1}</td>
                              <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12 }}>RD$ {fmt(item.precio)}</td>
                              <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12, color: "#dc2626" }}>
                                {item.descuentoMonto > 0 ? ("-" + fmt(item.descuentoMonto)) : "---"}
                              </td>
                              <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12, fontWeight: 700 }}>RD$ {fmt(c.total)}</td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "9px 10px", fontSize: 12, color: "#111" }}>
                              <div>{item.descripcion}</div>
                              {item.tramoLabel && <div style={{ fontSize: 10, color: "#9ca3af" }}>{item.tramoLabel}</div>}
                            </td>
                            <td style={{ padding: "9px 10px", fontSize: 11, color: "#6b7280" }}>{labelModo(item.modo)}</td>
                            <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#0e7490" }}>{item.pax}</td>
                            <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12 }}>
                              {item.modo === "por_grupo" ? ("RD$ " + fmt(item.precio) + " (plano)") : ("RD$ " + fmt(item.precio) + "/p.")}
                            </td>
                            <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12, color: "#dc2626" }}>
                              {item.descuentoMonto > 0 ? ("-" + fmt(item.descuentoMonto)) : "---"}
                            </td>
                            <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 12, fontWeight: 700 }}>RD$ {fmt(c.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ width: 280, border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                    {[{ l: "Subtotal", v: fmt(totales.sub), col: "#374151" }, { l: "ITBIS", v: fmt(totales.itbis), col: "#1d4ed8" }].map(({ l, v, col }) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontFamily: sans }}>
                        <span style={{ color: "#6b7280" }}>{l}</span>
                        <span style={{ fontFamily: mono, color: col }}>RD$ {v}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: esCompra ? "#7c3aed" : "#0e7490" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: sans }}>TOTAL RD$</span>
                      <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmt(totales.total)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", fontSize: 12, color: "#92400e", fontFamily: sans }}>
                  Una vez emitido, el comprobante fiscal no puede modificarse.
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowConfirmacion(false)} style={btnSecondary}>Volver a editar</button>
                  <button type="button" onClick={handleEmitir} disabled={saving}
                    style={{ ...btnPrimary, background: saving ? "#d1d5db" : "#166534", cursor: saving ? "not-allowed" : "pointer" }}>
                    {saving ? "Emitiendo..." : "Confirmar y Emitir"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {AlertaUI}
    </Modal>
  );
}
