"use client";

import { useState } from "react";
import type { Cotizacion, LineaServicio, Cliente, Servicio, ModoLinea } from "@/types";
import { fmt, today, localDate, calcLinea, calcTotales, genCOT, labelModo, getTierPrice } from "@/types";
import Modal               from "@/components/modals/modal";
import ModalServicios      from "@/components/modals/modalservicios";
import { ClienteSearchModal } from "@/components/ui/clientesearchmodal";
import Icon                from "@/components/ui/icon";

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

const ITEM_VACIO: LineaServicio = {
  codigo: "", descripcion: "", modo: "por_grupo",
  cant: 1, pax: 0, precio: 0, descuentoMonto: 0, itbis: 0,
};

interface Props {
  clientes:     Cliente[];
  servicios:    Servicio[];
  cotizaciones: Cotizacion[];
  onSave:       (data: Omit<Cotizacion, "id">) => Promise<void>;
  onClose:      () => void;
  saving:       boolean;
}

export default function ModalNuevaCotizacion({ clientes, servicios, cotizaciones, onSave, onClose, saving }: Props) {
  const [clienteId,        setClienteId]        = useState("");
  const [validez,          setValidez]          = useState("30");
  const [items,            setItems]            = useState<LineaServicio[]>([{ ...ITEM_VACIO }]);
  const [notas,            setNotas]            = useState("");
  const [showServicios,    setShowServicios]    = useState<number | null>(null);
  const [showClienteModal, setShowClienteModal] = useState(false);

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const t = calcTotales(items);

  const updateItem = (i: number) => <K extends keyof LineaServicio>(k: K, v: LineaServicio[K]) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  const handlePaxChange = (i: number, val: string) => {
    const pax    = val === "" ? 0 : parseInt(val) || 0;
    const item   = items[i];
    if (item.fromCatalog && item.servicioId) {
      const servicio = servicios.find((s) => s.id === item.servicioId);
      if (servicio) {
        const tier = getTierPrice(servicio, pax, item.modo === "por_persona" ? "por_persona" : "por_grupo");
        setItems((prev) => prev.map((it, idx) =>
          idx === i ? { ...it, pax, precio: tier.precio, modo: tier.modoResultante, tramoLabel: tier.tramoLabel } : it
        ));
        return;
      }
    }
    updateItem(i)("pax", pax);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId)                         return alert("Selecciona un cliente");
    if (items.every((i) => !i.descripcion)) return alert("Agrega al menos un servicio");
    const vencDate = new Date();
    vencDate.setDate(vencDate.getDate() + parseInt(validez || "30"));
    const seq = cotizaciones.length + 1;
    await onSave({
      noCotizacion: genCOT(seq),
      fecha:        today(),
      vencimiento:  localDate(vencDate),
      validez:      (validez + " dias"),
      clienteId,
      estado:       "vigente",
      items:        items.filter((i) => i.descripcion),
      notas:        notas || undefined,
    });
  };

  const lockedStyle: React.CSSProperties = {
    ...inputStyle, background: "#f3f4f6", color: "#374151", cursor: "not-allowed",
  };

  return (
    <Modal title="Nueva Cotizacion" onClose={onClose} width={1100}>
      <form onSubmit={handleSubmit}>
        <div className="factura-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>

          {/* Izquierda */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>Cliente *</label>
              <button type="button" onClick={() => setShowClienteModal(true)}
                style={{ width: "100%", textAlign: "left", ...inputStyle, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <span style={{ color: clienteSeleccionado ? "#111" : "#9ca3af" }}>
                  {clienteSeleccionado ? clienteSeleccionado.nombre : "--- Buscar cliente ---"}
                </span>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
              </button>
            </div>
            <div>
              <label style={labelStyle}>Validez (dias)</label>
              <select style={{ ...inputStyle, fontSize: 12 }} value={validez} onChange={(e) => setValidez(e.target.value)}>
                {["7","15","30","45","60"].map((d) => <option key={d} value={d}>{d + " dias"}</option>)}
              </select>
            </div>
            <textarea style={{ ...inputStyle, fontSize: 12, height: 80, resize: "none" } as React.CSSProperties}
              placeholder="Notas o condiciones (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
            <div style={{ padding: "8px 12px", background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 4, fontSize: 11, fontFamily: sans, color: "#0e7490" }}>
              Validez de <strong>{validez} dias</strong>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: "9px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, color: "#374151" }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: "9px", background: saving ? "#d1d5db" : "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: sans }}>
                {saving ? "Guardando..." : "Crear Cotizacion"}
              </button>
            </div>
          </div>

          {/* Derecha */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans }}>
                Servicios / Excursiones
              </div>
              <span style={{ fontSize: 11, background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", padding: "2px 8px", borderRadius: 3, fontFamily: sans, fontWeight: 600 }}>
                PAX = personas | Cant. = 1 excursion
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(80vh - 200px)", overflowY: "auto" }}>
              {items.map((item, i) => {
                const c      = calcLinea(item);
                const locked = !!item.fromCatalog;
                return (
                  <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "12px 14px", background: locked ? "#fafffe" : "#fafafa", borderLeft: locked ? "3px solid #0e7490" : "3px solid #e5e7eb" }}>

                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 70px 80px 90px auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
                      {/* Codigo */}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Codigo</label>
                        <div style={{ display: "flex", gap: 3 }}>
                          <input style={{ ...(locked ? lockedStyle : inputStyle), fontSize: 12 }}
                            value={item.codigo} readOnly={locked} placeholder="---"
                            onClick={locked ? undefined : () => setShowServicios(i)}
                            onChange={locked ? () => {} : (e) => updateItem(i)("codigo", e.target.value)} />
                          {!locked && (
                            <button type="button" onClick={() => setShowServicios(i)}
                              style={{ padding: "0 7px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                              <Icon name="search" size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Descripcion */}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Descripcion</label>
                        <input style={{ ...(locked ? lockedStyle : inputStyle), fontSize: 12 }}
                          value={item.descripcion} readOnly={locked} placeholder="Descripcion"
                          onChange={locked ? () => {} : (e) => {
                            updateItem(i)("descripcion", e.target.value);
                            if (e.target.value && i === items.length - 1)
                              setItems((prev) => [...prev, { ...ITEM_VACIO }]);
                          }} />
                      </div>

                      {/* Cant siempre 1 */}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Cant.</label>
                        <div style={{ ...inputStyle, fontSize: 12, background: "#f3f4f6", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                          1
                        </div>
                      </div>

                      {/* PAX */}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10, color: "#0e7490" }}>PAX</label>
                        <input type="number" min="0" style={{ ...inputStyle, fontSize: 13, fontWeight: 700, textAlign: "center", borderColor: "#a5f3fc", background: "#ecfeff" }}
                          value={item.pax === 0 ? "" : item.pax} placeholder="0"
                          onChange={(e) => handlePaxChange(i, e.target.value)} />
                      </div>

                      {/* Descuento */}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Desc. RD$</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9ca3af", fontFamily: mono }}>$</span>
                          <input type="number" min="0" step="0.01"
                            style={{ ...inputStyle, fontSize: 12, paddingLeft: 20, fontFamily: mono }}
                            value={item.descuentoMonto === 0 ? "" : item.descuentoMonto} placeholder="0"
                            onChange={(e) => { const val = e.target.value; updateItem(i)("descuentoMonto", val === "" ? 0 : parseFloat(val) || 0); }} />
                        </div>
                      </div>

                      {/* Eliminar */}
                      <button type="button" onClick={() => { if (items.length > 1) setItems((p) => p.filter((_, idx) => idx !== i)); }} disabled={items.length === 1}
                        style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "6px 8px", cursor: items.length === 1 ? "not-allowed" : "pointer", color: "#dc2626", display: "flex", alignItems: "center", opacity: items.length === 1 ? 0.4 : 1 }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>

                    {/* Info linea */}
                    {item.descripcion && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, fontFamily: sans, fontWeight: 600, background: item.modo === "por_grupo" ? "#ecfeff" : "#f0faf4", color: item.modo === "por_grupo" ? "#0e7490" : "#166534", border: "1px solid " + (item.modo === "por_grupo" ? "#a5f3fc" : "#bbf7d0") }}>
                          {item.modo === "por_grupo" ? "Grupo" : "Por Persona"}
                        </span>
                        {locked && item.tramoLabel && (
                          <span style={{ fontSize: 11, color: "#6b7280", fontFamily: sans }}>
                            Tramo: <strong style={{ color: "#374151" }}>{item.tramoLabel}</strong>
                          </span>
                        )}
                        {item.descuentoMonto > 0 && (
                          <span style={{ fontSize: 11, color: "#dc2626", fontFamily: sans }}>{"-RD$ " + fmt(item.descuentoMonto)}</span>
                        )}
                        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 14, fontWeight: 700, color: "#111" }}>
                          RD$ {fmt(c.total)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button type="button" onClick={() => setItems((p) => [...p, { ...ITEM_VACIO }])}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans, alignSelf: "flex-start" }}>
              <Icon name="plus" size={13} /> Agregar Linea
            </button>

            {/* Totales */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 260, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                {[["Subtotal", fmt(t.sub), "#374151"], ["Descuentos", fmt(t.desc), "#dc2626"], ["ITBIS", fmt(t.itbis), "#1d4ed8"]].map(([l, v, col]) => (
                  <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #e5e7eb", fontFamily: sans, fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>{l as string}</span>
                    <span style={{ fontFamily: mono, color: col as string }}>RD$ {v as string}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0e7490" }}>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: "#fff" }}>Total RD$</span>
                  <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: "#fff" }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {showServicios !== null && (
        <ModalServicios servicios={servicios}
          onSelect={(s, modo) => {
            const pax  = items[showServicios]?.pax || 0;
            const tier = getTierPrice(s, pax, modo);
            setItems((prev) => {
              const updated = prev.map((item, idx) =>
                idx === showServicios
                  ? { ...item, servicioId: s.id, fromCatalog: true, codigo: s.codigo, descripcion: s.nombre, modo: tier.modoResultante, precio: tier.precio, tramoLabel: tier.tramoLabel, itbis: s.itbis, incluyeITBIS: s.incluyeITBIS, cant: 1, pax }
                  : item
              );
              if (showServicios === prev.length - 1) updated.push({ ...ITEM_VACIO });
              return updated;
            });
            setShowServicios(null);
          }}
          onClose={() => setShowServicios(null)} />
      )}
      {showClienteModal && (
        <ClienteSearchModal clientes={clientes}
          onSelect={(c) => { setClienteId(c.id); setShowClienteModal(false); }}
          onClose={() => setShowClienteModal(false)} />
      )}
    </Modal>
  );
}