"use client";

import { useState } from "react";
import type { Cotizacion, Factura, Cliente } from "@/types";
import { fmt, calcTotales, PLAZOS_CREDITO } from "@/types";
import Modal from "@/components/modals/modal";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#374151",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6, fontFamily: sans,
};

const METODOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Cheque"] as const;
type MetodoPago = typeof METODOS_PAGO[number];

const REFERENCIA_CONFIG: Record<string, { label: string; placeholder: string } | null> = {
  Efectivo:      null,
  Tarjeta:       { label: "No. de Aprobacion", placeholder: "Ej: 123456" },
  Transferencia: { label: "Ref. Transferencia", placeholder: "Ej: TRF-20260601-001" },
  Cheque:        { label: "No. de Cheque",      placeholder: "Ej: 00123456" },
};

interface Props {
  cotizacion: Cotizacion;
  cliente:    Cliente | undefined;
  onConfirmar: (pago: {
    terminos:    string;
    metodoPago?: string;
    referencia?: string;
    plazo?:      string;
  }) => Promise<void>;
  onClose:    () => void;
  saving:     boolean;
}

export default function ModalConvertirCotizacion({ cotizacion, cliente, onConfirmar, onClose, saving }: Props) {
  const [terminos,   setTerminos]   = useState<"Contado" | "Credito">("Contado");
  const [metodo,     setMetodo]     = useState<MetodoPago>("Efectivo");
  const [plazo,      setPlazo]      = useState<typeof PLAZOS_CREDITO[number]>("30 Días");
  const [referencia, setReferencia] = useState("");

  const t          = calcTotales(cotizacion.items);
  const esContado  = terminos === "Contado";
  const refConfig  = esContado ? REFERENCIA_CONFIG[metodo] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (refConfig && !referencia.trim()) return alert("Ingresa " + refConfig.label);
    await onConfirmar({
      terminos:   esContado ? "Contado" : plazo,
      metodoPago: esContado ? metodo : undefined,
      referencia: (esContado && referencia) ? referencia : undefined,
      plazo:      esContado ? undefined : plazo,
    });
  };

  return (
    <Modal title="Convertir Cotizacion a Factura" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Resumen de la cotizacion */}
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontFamily: sans }}>
            Resumen de la Cotizacion
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontFamily: sans }}>
              <div style={{ fontWeight: 700, color: "#111", marginBottom: 2 }}>{cliente?.nombre ?? "Cliente"}</div>
              {cliente?.rnc && <div style={{ fontSize: 11, color: "#6b7280", fontFamily: mono }}>{cliente.rnc}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans, marginBottom: 2 }}>{cotizacion.noCotizacion}</div>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "#0e7490" }}>RD$ {fmt(t.total)}</div>
            </div>
          </div>

          {/* Items de la cotizacion */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
            {cotizacion.items.map((item, i) => {
              const c = calcTotales([item]);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: sans }}>
                  <div style={{ color: "#374151" }}>
                    {item.descripcion}
                    {item.tramoLabel && <span style={{ color: "#9ca3af", fontSize: 10 }}> ({item.tramoLabel})</span>}
                    {item.pax > 0 && <span style={{ color: "#0e7490", fontSize: 11, marginLeft: 6 }}>PAX: <strong>{item.pax}</strong></span>}
                  </div>
                  <div style={{ fontFamily: mono, color: "#111", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                    RD$ {fmt(c.total)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini totales */}
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 10, paddingTop: 10, display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontFamily: sans }}>
            {t.desc > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>Descuentos</span>
                <span style={{ fontFamily: mono, color: "#dc2626" }}>{"-RD$ " + fmt(t.desc)}</span>
              </div>
            )}
            {t.itbis > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>ITBIS</span>
                <span style={{ fontFamily: mono, color: "#1d4ed8" }}>{"RD$ " + fmt(t.itbis)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: 4, borderTop: "1px dashed #e5e7eb", marginTop: 4 }}>
              <span style={{ color: "#111" }}>Total a Facturar</span>
              <span style={{ fontFamily: mono, color: "#0e7490", fontSize: 14 }}>{"RD$ " + fmt(t.total)}</span>
            </div>
          </div>
        </div>

        {/* Terminos de pago */}
        <div>
          <label style={labelStyle}>Terminos de Pago</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["Contado", "Credito"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setTerminos(t); setReferencia(""); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, fontWeight: 600, border: "2px solid " + (terminos === t ? "#111" : "#e5e7eb"), background: terminos === t ? "#111" : "#fff", color: terminos === t ? "#fff" : "#374151", transition: "all 0.1s" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Contado: metodo de pago */}
        {esContado && (
          <div>
            <label style={labelStyle}>Metodo de Pago</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {METODOS_PAGO.map((m) => (
                <button key={m} type="button" onClick={() => { setMetodo(m); setReferencia(""); }}
                  style={{ padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, border: "2px solid " + (metodo === m ? "#0e7490" : "#e5e7eb"), background: metodo === m ? "#ecfeff" : "#fff", color: metodo === m ? "#0e7490" : "#374151", fontWeight: metodo === m ? 700 : 400, transition: "all 0.1s" }}>
                  {m}
                </button>
              ))}
            </div>
            {refConfig && (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>{refConfig.label} <span style={{ color: "#dc2626" }}>*</span></label>
                <input required style={{ ...inputStyle, fontFamily: mono }}
                  placeholder={refConfig.placeholder} value={referencia}
                  onChange={(e) => setReferencia(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {/* Credito: plazo */}
        {!esContado && (
          <div>
            <label style={labelStyle}>Plazo de Credito</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLAZOS_CREDITO.map((p) => (
                <button key={p} type="button" onClick={() => setPlazo(p)}
                  style={{ flex: 1, minWidth: 80, padding: "9px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans, border: "2px solid " + (plazo === p ? "#1d4ed8" : "#e5e7eb"), background: plazo === p ? "#eff6ff" : "#fff", color: plazo === p ? "#1d4ed8" : "#374151", fontWeight: plazo === p ? 700 : 400 }}>
                  {p}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, fontSize: 11, color: "#1d4ed8", fontFamily: sans }}>
              La factura ira a Cuentas por Cobrar con vencimiento en {plazo}
            </div>
          </div>
        )}

        {/* Resumen final */}
        <div style={{ padding: "12px 16px", background: esContado ? "#f0faf4" : "#eff6ff", border: "1px solid " + (esContado ? "#bbf7d0" : "#bfdbfe"), borderRadius: 6, fontSize: 12, fontFamily: sans }}>
          {esContado ? (
            <div style={{ color: "#166534" }}>
              <strong>Pago de contado</strong> via {metodo}. La factura quedara como <strong>Pagada</strong>.
            </div>
          ) : (
            <div style={{ color: "#1d4ed8" }}>
              <strong>Credito a {plazo}</strong>. La factura quedara como <strong>Pendiente</strong> en Cuentas por Cobrar.
            </div>
          )}
        </div>

        {/* Botones */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: "1px solid #e5e7eb" }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: "10px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, color: "#374151" }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ flex: 2, padding: "10px", background: saving ? "#d1d5db" : "#166534", color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: sans }}>
            {saving ? "Emitiendo..." : "Confirmar y Emitir Factura"}
          </button>
        </div>
      </form>
    </Modal>
  );
}