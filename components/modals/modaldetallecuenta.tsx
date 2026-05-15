"use client";

import { useState } from "react";
import type { Cliente, CuentaPorCobrar, Abono } from "@/types";
import { fmt, fmtDate, today, calcPendiente } from "@/types";
import Modal from "@/components/modals/modal";
import Icon from "@/components/ui/icon";

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

const METODOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Cheque"] as const;

function FormAbono({ cuenta, onSave, onCancel, saving }: {
  cuenta:   CuentaPorCobrar;
  onSave:   (abono: Omit<Abono, "id">) => Promise<void>;
  onCancel: () => void;
  saving:   boolean;
}) {
  const pendiente = calcPendiente(cuenta);
  const [form, setForm] = useState({
    fecha:         today(),
    monto:         0,
    metodoPago:    "Efectivo" as typeof METODOS_PAGO[number],
    idTransaccion: "",
    nota:          "",
  });

  const f = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#111"; };
  const b = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#d1d5db"; };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.monto <= 0)           return alert("El monto debe ser mayor a 0");
    if (form.monto > pendiente)    return alert(`No puede superar RD$ ${fmt(pendiente)}`);
    if (form.metodoPago === "Tarjeta" && !form.idTransaccion.trim())
      return alert("Ingresa el número de aprobación del POS");
    await onSave({
      fecha:      form.fecha,
      monto:      form.monto,
      metodoPago: form.metodoPago,
      nota: form.metodoPago === "Tarjeta"
        ? `Aprobación: ${form.idTransaccion}${form.nota ? ` — ${form.nota}` : ""}`
        : form.nota,
    });
  };

  const nuevoSaldo = pendiente - form.monto;

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#92400e", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Pendiente de cobro</div>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: "#b45309" }}>RD$ {fmt(pendiente)}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#92400e", fontFamily: sans, lineHeight: 1.8 }}>
            <div>Factura: {cuenta.numeroFactura}</div>
            <div>Total: RD$ {fmt(cuenta.monto)}</div>
            <div style={{ color: "#166534" }}>Cobrado: RD$ {fmt(cuenta.pagado)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Fecha del Pago</label>
            <input type="date" style={inputStyle} value={form.fecha}
              onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Método de Pago</label>
            <select style={inputStyle} value={form.metodoPago}
              onChange={(e) => setForm((p) => ({ ...p, metodoPago: e.target.value as typeof METODOS_PAGO[number], idTransaccion: "" }))}>
              {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {form.metodoPago === "Tarjeta" && (
          <div>
            <label style={labelStyle}>No. Aprobación POS <span style={{ color: "#dc2626" }}>*</span></label>
            <input required style={{ ...inputStyle, fontFamily: mono }} placeholder="Número de aprobación del recibo"
              value={form.idTransaccion} onChange={(e) => setForm((p) => ({ ...p, idTransaccion: e.target.value }))}
              onFocus={f} onBlur={b} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Monto del Abono (RD$)</label>
          <input type="number" min="0.01" step="0.01" required
            style={{ ...inputStyle, fontFamily: mono, fontSize: 16, fontWeight: 600, textAlign: "right" }}
            value={form.monto || ""} placeholder="0.00"
            onChange={(e) => setForm((p) => ({ ...p, monto: parseFloat(e.target.value) || 0 }))}
            onFocus={f} onBlur={b} />
          {pendiente > 0 && (
            <button type="button" onClick={() => setForm((p) => ({ ...p, monto: pendiente }))}
              style={{ marginTop: 6, fontSize: 11, color: "#166534", background: "none", border: "none", cursor: "pointer", fontFamily: sans, textDecoration: "underline" }}>
              Pagar total pendiente (RD$ {fmt(pendiente)})
            </button>
          )}
        </div>

        {form.monto > 0 && form.monto <= pendiente && (
          <div style={{ background: "#f0faf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontFamily: sans, fontSize: 12 }}>
            <span style={{ color: "#374151" }}>Saldo después del abono</span>
            <span style={{ fontFamily: mono, fontWeight: 700, color: nuevoSaldo <= 0 ? "#166534" : "#b45309" }}>
              {nuevoSaldo <= 0 ? "PAGADA COMPLETAMENTE" : `RD$ ${fmt(nuevoSaldo)}`}
            </span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Nota adicional (opcional)</label>
          <input style={inputStyle} placeholder="Ej: Cheque #1234, referencia bancaria..."
            value={form.nota} onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))}
            onFocus={f} onBlur={b} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans }}>
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          style={{ padding: "9px 18px", background: saving ? "#d1d5db" : "#166534", color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
          {saving ? "Registrando..." : "Registrar Abono"}
        </button>
      </div>
    </form>
  );
}

interface Props {
  cuenta:  CuentaPorCobrar;
  cliente: Cliente | undefined;
  onClose: () => void;
  onAbono: (abono: Omit<Abono, "id">) => Promise<void>;
  saving:  boolean;
}

export default function ModalDetalleCuenta({ cuenta, cliente, onClose, onAbono, saving }: Props) {
  const [showAbono, setShowAbono] = useState(false);
  const pendiente = calcPendiente(cuenta);

  return (
    <Modal title={`Cuenta — ${cliente?.nombre ?? cuenta.numeroFactura}`} onClose={onClose} width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
          {[
            { label: "Total",     val: fmt(cuenta.monto),    color: "#111"    },
            { label: "Cobrado",   val: fmt(cuenta.pagado),   color: "#166534" },
            { label: "Devuelto",  val: fmt(cuenta.devuelto), color: "#1d4ed8" },
            { label: "Pendiente", val: fmt(pendiente),       color: "#b45309" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color }}>RD$ {val}</div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "#6b7280", fontFamily: sans }}>
            <span>Progreso de cobro</span>
            <span>{Math.min(100, Math.round((cuenta.pagado / cuenta.monto) * 100))}%</span>
          </div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (cuenta.pagado / cuenta.monto) * 100)}%`, background: pendiente <= 0 ? "#166534" : "#b45309", borderRadius: 4, transition: "width 0.3s ease" }} />
          </div>
        </div>

        {pendiente > 0 && cuenta.estado !== "anulada" && !showAbono && (
          <button onClick={() => setShowAbono(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#166534", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans, alignSelf: "flex-start" }}>
            <Icon name="plus" size={14} /> Registrar Abono
          </button>
        )}

        {showAbono && (
          <div style={{ background: "#f0faf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: 20 }}>
            <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 16 }}>Nuevo Abono</div>
            <FormAbono cuenta={cuenta} saving={saving}
              onSave={async (abono) => { await onAbono(abono); setShowAbono(false); }}
              onCancel={() => setShowAbono(false)} />
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontFamily: sans }}>
            Historial de Pagos ({cuenta.abonos.length})
          </div>
          {cuenta.abonos.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13, fontFamily: sans, background: "#f9fafb", borderRadius: 4 }}>
              No hay pagos registrados aún
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Fecha", "Método", "Monto", "Nota"].map((h) => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...cuenta.abonos].reverse().map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 14px", fontFamily: mono, fontSize: 12 }}>{fmtDate(a.fecha)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>{a.metodoPago}</td>
                      <td style={{ padding: "10px 14px", fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#166534" }}>RD$ {fmt(a.monto)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#6b7280" }}>{a.nota || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}