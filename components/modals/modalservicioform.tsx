"use client";

import { useState, useEffect } from "react";
import type { Servicio, PriceTier } from "@/types";
import { ITBIS_RATES, fmt, computeTourPrice } from "@/types";
import Modal from "@/components/modals/modal";

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#374151",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: sans,
};

const EMPTY_TIER: PriceTier = { upTo: 0, total: 0 };

const EMPTY: Omit<Servicio, "id"> = {
  codigo: "", nombre: "", descripcion: "",
  modalidad: "por_grupo",
  tiers: [
    { upTo: 4,    total: 0 },
    { upTo: 8,    total: 0 },
    { upTo: 9999, total: 0, perPax: true },
  ],
  precioTramo1_2:   0,
  precioTramo3_5:   0,
  precioTramo6_8:   0,
  precioPorPersona: 0,
  itbis: 0.18, incluyeITBIS: false, activo: true,
};

interface Props {
  servicio?: Servicio;
  onSave:   (data: Omit<Servicio, "id">) => Promise<void>;
  onClose:  () => void;
  saving:   boolean;
}

export default function ModalServicioForm({ servicio, onSave, onClose, saving }: Props) {
  const [form,  setForm]  = useState<Omit<Servicio, "id">>(
    servicio ? { ...EMPTY, ...servicio, tiers: servicio.tiers?.length ? servicio.tiers : EMPTY.tiers } : { ...EMPTY }
  );
  const [tiers, setTiers] = useState<PriceTier[]>(
    servicio?.tiers?.length ? servicio.tiers : (EMPTY.tiers ?? [])
  );
  const [preview, setPreview] = useState<number | null>(null); // pax para preview

  useEffect(() => {
    if (servicio) {
      setForm({ ...EMPTY, ...servicio, tiers: servicio.tiers?.length ? servicio.tiers : EMPTY.tiers });
      setTiers(servicio.tiers?.length ? servicio.tiers : (EMPTY.tiers ?? []));
    }
  }, [servicio]);

  const setF = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const updateTier = (i: number, field: keyof PriceTier, val: unknown) => {
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  };
  const addTier    = () => setTiers(prev => [...prev, { ...EMPTY_TIER }]);
  const removeTier = (i: number) => setTiers(prev => prev.filter((_, idx) => idx !== i));

  // Preview del precio para N personas
  const previewPrecio = preview !== null && tiers.length > 0
    ? computeTourPrice(tiers, preview)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim()) return alert("El código es obligatorio");
    if (!form.nombre.trim()) return alert("El nombre es obligatorio");
    if (!tiers.length)        return alert("Agrega al menos un tramo de precio");
    for (const t of tiers) {
      if (!t.upTo || t.upTo <= 0) return alert("Cada tramo debe tener un límite de personas > 0");
      if (!t.total || t.total <= 0) return alert("Cada tramo debe tener un precio > 0");
    }

    // Campos legacy para compatibilidad con código viejo
    const sorted = [...tiers].sort((a, b) => a.upTo - b.upTo);
    const perPaxTier = sorted.find(t => t.perPax);

    await onSave({
      codigo:      form.codigo.toUpperCase().trim(),
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion?.trim() || "",
      modalidad:   "por_grupo",
      tiers:       sorted,
      // Legacy fields para compatibilidad
      precioTramo1_2:   sorted[0]?.total ?? 0,
      precioTramo3_5:   sorted[1]?.total ?? sorted[0]?.total ?? 0,
      precioTramo6_8:   sorted[2]?.total ?? sorted[1]?.total ?? 0,
      precioPorPersona: perPaxTier?.total ?? sorted[sorted.length - 1]?.total ?? 0,
      itbis:        form.itbis,
      incluyeITBIS: form.incluyeITBIS,
      activo:       form.activo,
    });
  };

  return (
    <Modal title={servicio ? "Editar Servicio" : "Nuevo Servicio"} onClose={onClose} width={680}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Código + Nombre */}
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Código *</label>
            <input required style={{ ...inputStyle, fontFamily: mono, textTransform: "uppercase" }}
              placeholder="TOUR-IC" value={form.codigo}
              onChange={(e) => setF("codigo", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input required style={inputStyle} placeholder="Ej: Isla Cabra" value={form.nombre}
              onChange={(e) => setF("nombre", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea rows={2} style={{ ...inputStyle, resize: "none" } as React.CSSProperties}
            value={form.descripcion || ""}
            onChange={(e) => setF("descripcion", e.target.value)} />
        </div>

        {/* Tabla de tramos de precio */}
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans }}>
              Tabla de precios por personas
            </div>
            <button type="button" onClick={addTier}
              style={{ padding: "4px 12px", background: "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: sans, fontWeight: 600 }}>
              + Tramo
            </button>
          </div>

          {/* Cabecera */}
          <div style={{ display: "grid", gridTemplateColumns: "80px 110px 90px 90px 32px", gap: 6, marginBottom: 6 }}>
            {["Hasta pax", "Total RD$", "Por persona", "Incr/pax", ""].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</div>
            ))}
          </div>

          {tiers.map((tier, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 110px 90px 90px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              {/* Hasta X pax */}
              <input type="number" min="1" style={{ ...inputStyle, fontSize: 12, textAlign: "center", fontFamily: mono }}
                value={tier.upTo === 9999 ? "" : tier.upTo}
                placeholder="9999"
                onChange={(e) => updateTier(i, "upTo", parseInt(e.target.value) || 9999)} />
              {/* Total RD$ */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9ca3af", fontFamily: mono }}>$</span>
                <input type="number" min="0" style={{ ...inputStyle, fontSize: 12, paddingLeft: 18, fontFamily: mono, textAlign: "right" }}
                  value={tier.total === 0 ? "" : tier.total} placeholder="0"
                  onChange={(e) => updateTier(i, "total", parseFloat(e.target.value) || 0)} />
              </div>
              {/* Por persona checkbox */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                <input type="checkbox" checked={!!tier.perPax}
                  onChange={(e) => updateTier(i, "perPax", e.target.checked)} />
                <span style={{ fontSize: 11, fontFamily: sans, color: "#374151" }}>/persona</span>
              </label>
              {/* Incremento */}
              <input type="number" min="0" style={{ ...inputStyle, fontSize: 12, fontFamily: mono, textAlign: "right" }}
                value={tier.incr ?? ""} placeholder="—"
                onChange={(e) => updateTier(i, "incr", e.target.value ? parseFloat(e.target.value) : undefined)} />
              {/* Eliminar */}
              <button type="button" onClick={() => removeTier(i)} disabled={tiers.length <= 1}
                style={{ background: "none", border: "1px solid #fecaca", borderRadius: 3, padding: "3px 6px", cursor: tiers.length <= 1 ? "not-allowed" : "pointer", color: "#dc2626", fontSize: 12, opacity: tiers.length <= 1 ? 0.4 : 1 }}>
                ✕
              </button>
            </div>
          ))}

          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans, marginTop: 8 }}>
            <strong>Hasta pax:</strong> límite inclusive. <strong>Total:</strong> precio plano (o por-persona si está marcado).
            <strong> Incr:</strong> RD$ extra por persona en zona lineal (ej: para pax 7-29 con base $10,030 + $1,357/persona extra).
          </div>

          {/* Preview de precio */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 11, fontFamily: sans, color: "#374151" }}>Simular precio para</label>
            <input type="number" min="1" max="200"
              style={{ ...inputStyle, width: 70, fontSize: 12, textAlign: "center", fontFamily: mono }}
              value={preview ?? ""} placeholder="pax"
              onChange={(e) => setPreview(parseInt(e.target.value) || null)} />
            <label style={{ fontSize: 11, fontFamily: sans, color: "#374151" }}>personas →</label>
            {previewPrecio !== null && (
              <span style={{ fontFamily: mono, fontWeight: 700, color: "#0e7490", fontSize: 14 }}>
                RD$ {fmt(previewPrecio)}
                {preview && preview > 0 ? (
                  <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>
                    (RD$ {fmt(Math.round(previewPrecio / preview))}/p.)
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        {/* ITBIS */}
        <div>
          <label style={labelStyle}>ITBIS</label>
          <div style={{ display: "flex", gap: 8 }}>
            {ITBIS_RATES.map(({ val, label }) => {
              const active = form.itbis === val;
              return (
                <button key={val} type="button" onClick={() => setF("itbis", val)}
                  style={{ flex: 1, padding: "8px 6px", borderRadius: 4, cursor: "pointer", border: ("2px solid " + (active ? "#111" : "#e5e7eb")), background: active ? "#111" : "#fff", color: active ? "#fff" : "#374151", fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: sans }}>
                  {label}
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginTop: 10 }}>
            <div onClick={() => setF("incluyeITBIS", !form.incluyeITBIS)}
              style={{ width: 18, height: 18, border: ("2px solid " + (form.incluyeITBIS ? "#0e7490" : "#d1d5db")), borderRadius: 4, background: form.incluyeITBIS ? "#0e7490" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
              {form.incluyeITBIS && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, fontFamily: sans, color: "#374151" }}>Precio incluye ITBIS</div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: sans }}>
                Los montos de la tabla de arriba son el total final a cobrar (el ITBIS se calcula hacia atrás, no se suma encima)
              </div>
            </div>
          </label>
        </div>

        {/* Activo */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
          <div onClick={() => setF("activo", !form.activo)}
            style={{ width: 18, height: 18, border: ("2px solid " + (form.activo ? "#0e7490" : "#d1d5db")), borderRadius: 4, background: form.activo ? "#0e7490" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
            {form.activo && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: sans, color: "#374151" }}>Servicio activo</div>
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: sans }}>Solo los activos aparecen al facturar</div>
          </div>
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid #e5e7eb" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "9px 18px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, color: "#374151" }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: "9px 22px", background: saving ? "#d1d5db" : "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: sans }}>
            {saving ? "Guardando..." : (servicio ? "Actualizar" : "Crear Servicio")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
