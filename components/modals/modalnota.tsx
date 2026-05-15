"use client";

import { useState } from "react";
import type { Factura, LineaServicio, Cliente } from "@/types";
import { fmt, today, calcLinea, calcTotales, genECF } from "@/types";
import { nextSecuencia } from "@/hooks/usesecuencias";
import Modal from "@/components/modals/modal";
import Icon from "@/components/ui/icon";

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#374151",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: sans,
};

const MOTIVOS_CREDITO = ["Anulacion de operacion","Devolucion de servicio","Descuento posterior","Error en precio","Error en cantidad","Otro"];
const MOTIVOS_DEBITO  = ["Intereses por mora","Gastos adicionales","Diferencia de precio","Otro"];

const ITEM_VACIO: LineaServicio = {
  codigo: "", descripcion: "", modo: "por_persona",
  cant: 1, pax: 0, precio: 0, descuentoMonto: 0, itbis: 0,
};

function clean<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) { if (v !== undefined) (out as Record<string, unknown>)[k] = v; }
  return out;
}

interface Props {
  tipo:        "E33" | "E34";
  facturaRef:  Factura;
  clientes:    Cliente[];
  facturas:    Factura[];
  onSave:      (data: Omit<Factura, "id">) => Promise<void>;
  onClose:     () => void;
  saving:      boolean;
}

export default function ModalNota({ tipo, facturaRef, clientes, facturas, onSave, onClose, saving }: Props) {
  const esCredito = tipo === "E34";
  const motivos   = esCredito ? MOTIVOS_CREDITO : MOTIVOS_DEBITO;
  const [motivo,  setMotivo]  = useState(motivos[0]);
  const [notas,   setNotas]   = useState("");
  const [items,   setItems]   = useState<LineaServicio[]>([{ ...ITEM_VACIO }]);

  const cliente    = clientes.find((c) => c.id === facturaRef.clienteId);
  const t          = calcTotales(items);
  const eCFPreview = genECF(tipo, facturas.filter((f) => f.tipoECF === tipo).length + 1);

  const setItem = <K extends keyof LineaServicio>(i: number, k: K, v: LineaServicio[K]) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.every((i) => !i.descripcion)) return alert("Agrega al menos un concepto");
    const seq = await nextSecuencia(tipo);
    const eCF = genECF(tipo, seq);
    await onSave(clean({
      noFactura: String(seq), eCF, tipoECF: tipo,
      fecha: today(), vencimientoECF: facturaRef.vencimientoECF,
      terminos: facturaRef.terminos, clienteId: facturaRef.clienteId,
      eCFRef: facturaRef.eCF, motivoNota: motivo, estado: "pagada" as const,
      items: items.filter((i) => i.descripcion), notas: notas || undefined,
      esConsumidorFinal: facturaRef.esConsumidorFinal,
      nombreConsumidor:  facturaRef.nombreConsumidor,
    }) as Omit<Factura, "id">);
  };

  const accentBg     = esCredito ? "#f0faf4" : "#fffbeb";
  const accentBorder = esCredito ? "#bbf7d0" : "#fde68a";
  const accentColor  = esCredito ? "#166534" : "#92400e";
  const accentBtn    = esCredito ? "#166534" : "#92400e";

  return (
    <Modal title={esCredito ? "Nota de Credito (E34)" : "Nota de Debito (E33)"} onClose={onClose} width={760}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          <div style={{ background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 4, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {esCredito ? "Nota de Credito (E34)" : "Nota de Debito (E33)"}
            </div>
            <div style={{ fontSize: 12, color: "#374151", fontFamily: sans, lineHeight: 1.7 }}>
              <div><strong>e-CF a emitir:</strong> <span style={{ fontFamily: mono }}>{eCFPreview}</span></div>
              <div><strong>Ref. e-CF original:</strong> <span style={{ fontFamily: mono }}>{facturaRef.eCF}</span></div>
              <div><strong>Cliente:</strong> {facturaRef.esConsumidorFinal ? (facturaRef.nombreConsumidor ?? "Consumidor Final") : (cliente?.nombre ?? "---")}</div>
            </div>
          </div>

          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "10px 14px", fontSize: 12, color: "#1d4ed8", fontFamily: sans }}>
            {esCredito ? "La nota de credito reduce el monto de la factura original." : "La nota de debito anade cargos adicionales a la factura original."}
          </div>

          <div>
            <label style={labelStyle}>Motivo</label>
            <select style={inputStyle} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontFamily: sans }}>
              {esCredito ? "Conceptos a acreditar" : "Cargos adicionales"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item, i) => {
                const c = calcLinea(item);
                return (
                  <div key={i} style={{ border: `1px solid ${accentBorder}`, borderRadius: 4, padding: 12, background: accentBg }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px auto", gap: 8, alignItems: "end" }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Descripcion</label>
                        <input style={{ ...inputStyle, fontSize: 12 }} value={item.descripcion}
                          placeholder={esCredito ? "Ej: Devolucion de servicio" : "Ej: Interes por mora"}
                          onChange={(e) => setItem(i, "descripcion", e.target.value)} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Cant.</label>
                        <input type="number" min="0" style={{ ...inputStyle, fontSize: 12 }}
                          value={item.cant || ""} onChange={(e) => setItem(i, "cant", parseFloat(e.target.value) || 1)} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Monto Unit.</label>
                        <input type="number" min="0" step="0.01" style={{ ...inputStyle, fontSize: 12 }}
                          value={item.precio || ""} onChange={(e) => setItem(i, "precio", parseFloat(e.target.value) || 0)} />
                      </div>
                      <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} disabled={items.length === 1}
                        style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "6px 8px", cursor: items.length === 1 ? "not-allowed" : "pointer", color: "#dc2626", display: "flex", alignItems: "center", opacity: items.length === 1 ? 0.4 : 1 }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                    {item.descripcion && (
                      <div style={{ marginTop: 6, textAlign: "right", fontFamily: mono, fontSize: 12, color: accentColor }}>
                        {esCredito ? "Credito" : "Debito"}: <strong>RD$ {fmt(c.total)}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setItems((p) => [...p, { ...ITEM_VACIO }])}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans }}>
              <Icon name="plus" size={13} /> Agregar Concepto
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: 260, background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 4, overflow: "hidden" }}>
              {[["Sub Total", fmt(t.sub)], ["ITBIS", fmt(t.itbis)]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: `1px solid ${accentBorder}`, fontFamily: sans, fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>{l}</span>
                  <span style={{ fontFamily: mono }}>RD$ {v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: accentBtn }}>
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 12, color: "#fff" }}>Total {esCredito ? "Credito" : "Debito"} RD$</span>
                <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: "#fff" }}>{fmt(t.total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <textarea style={{ ...inputStyle, height: 64, resize: "vertical" } as React.CSSProperties}
              value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans }}>Cancelar</button>
          <button type="submit" disabled={saving}
            style={{ padding: "9px 18px", background: saving ? "#d1d5db" : accentBtn, color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
            {saving ? "Emitiendo..." : ("Emitir " + (esCredito ? "Nota de Credito" : "Nota de Debito"))}
          </button>
        </div>
      </form>
    </Modal>
  );
}