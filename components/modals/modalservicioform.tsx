"use client";

import { useState, useEffect } from "react";
import type { Servicio, ModalidadServicio } from "@/types";
import { ITBIS_RATES, fmt } from "@/types";
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

const MODALIDADES: { val: ModalidadServicio; label: string; hint: string }[] = [
  { val: "por_grupo",   label: "Por Grupo",  hint: "Tarifas por tramos (1-2, 3-5, 6-8, 9+)" },
  { val: "por_persona", label: "Por Persona", hint: "Un solo precio por persona"              },
  { val: "ambas",       label: "Ambas",       hint: "El operador elige al facturar"           },
];

const EMPTY: Omit<Servicio, "id"> = {
  codigo: "", nombre: "", descripcion: "",
  modalidad: "por_grupo",
  precioTramo1_2:   0,
  precioTramo3_5:   0,
  precioTramo6_8:   0,
  precioPorPersona: 0,
  itbis: 0, activo: true,
};

interface Props {
  servicio?: Servicio;
  onSave:   (data: Omit<Servicio, "id">) => Promise<void>;
  onClose:  () => void;
  saving:   boolean;
}

export default function ModalServicioForm({ servicio, onSave, onClose, saving }: Props) {
  const [form, setForm] = useState<Omit<Servicio, "id">>(
    servicio ? { ...EMPTY, ...servicio } : { ...EMPTY }
  );

  useEffect(() => {
    if (servicio) setForm({ ...EMPTY, ...servicio });
  }, [servicio]);

  const setF = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const showGrupo = form.modalidad === "por_grupo" || form.modalidad === "ambas";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim()) return alert("El codigo es obligatorio");
    if (!form.nombre.trim()) return alert("El nombre es obligatorio");
    if (showGrupo) {
      if (!form.precioTramo1_2 || form.precioTramo1_2 <= 0) return alert("Ingresa el precio para 1-2 personas");
      if (!form.precioTramo3_5 || form.precioTramo3_5 <= 0) return alert("Ingresa el precio para 3-5 personas");
      if (!form.precioTramo6_8 || form.precioTramo6_8 <= 0) return alert("Ingresa el precio para 6-8 personas");
    }
    if (!form.precioPorPersona || form.precioPorPersona <= 0)
      return alert("Ingresa el precio por persona (9+ o modo individual)");

    await onSave({
      codigo:           form.codigo.toUpperCase().trim(),
      nombre:           form.nombre.trim(),
      descripcion:      form.descripcion?.trim() || "",
      modalidad:        form.modalidad,
      precioTramo1_2:   showGrupo ? form.precioTramo1_2 : undefined,
      precioTramo3_5:   showGrupo ? form.precioTramo3_5 : undefined,
      precioTramo6_8:   showGrupo ? form.precioTramo6_8 : undefined,
      precioPorPersona: form.precioPorPersona,
      itbis:  form.itbis,
      activo: form.activo,
    });
  };

  const numField = (label: string, key: keyof typeof form, hint?: string) => {
    const val = form[key] as number;
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9ca3af", fontFamily: mono }}>RD$</span>
          <input
            type="number" min="0" step="0.01" required
            style={{ width: "100%", padding: "8px 12px 8px 36px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111", outline: "none", fontFamily: mono, background: "#fff", textAlign: "right" }}
            value={val === 0 ? "" : val}
            placeholder="0.00"
            onChange={(e) => {
              const v = e.target.value;
              setF(key, (v === "" ? 0 : parseFloat(v) || 0) as typeof form[typeof key]);
            }}
          />
        </div>
        {hint && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontFamily: sans }}>{hint}</div>}
      </div>
    );
  };

  const t1 = form.precioTramo1_2 ?? 0;
  const t3 = form.precioTramo3_5 ?? 0;
  const t6 = form.precioTramo6_8 ?? 0;
  const pp = form.precioPorPersona ?? 0;

  return (
    <Modal title={servicio ? "Editar Servicio" : "Nuevo Servicio"} onClose={onClose} width={600}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Codigo *</label>
            <input required style={{ ...inputStyle, fontFamily: mono, textTransform: "uppercase" }}
              placeholder="TOUR-CAY" value={form.codigo}
              onChange={(e) => setF("codigo", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label style={labelStyle}>Nombre del Servicio *</label>
            <input required style={inputStyle} placeholder="Ej: Tour Cayo Arena" value={form.nombre}
              onChange={(e) => setF("nombre", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Descripcion</label>
          <textarea rows={2} style={{ ...inputStyle, resize: "none" } as React.CSSProperties}
            placeholder="Que incluye? horario, punto de salida, etc."
            value={form.descripcion || ""}
            onChange={(e) => setF("descripcion", e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Modalidad de Precio *</label>
          <div style={{ display: "flex", gap: 8 }}>
            {MODALIDADES.map(({ val, label, hint }) => {
              const active = form.modalidad === val;
              return (
                <button key={val} type="button" onClick={() => setF("modalidad", val)}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 4, cursor: "pointer", textAlign: "center",
                    border: ("2px solid " + (active ? "#0e7490" : "#e5e7eb")),
                    background: active ? "#ecfeff" : "#fff", transition: "all 0.1s",
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? "#0e7490" : "#374151", fontFamily: sans }}>{label}</div>
                  <div style={{ fontSize: 10, color: active ? "#0e7490" : "#9ca3af", marginTop: 3, fontFamily: sans, lineHeight: 1.3 }}>{hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {showGrupo && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 14 }}>
              Tarifas por Tramos de Grupo (precio plano total)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              {numField("1-2 Personas *", "precioTramo1_2", "Tarifa plana para grupos pequeños")}
              {numField("3-5 Personas *", "precioTramo3_5", "Tarifa plana para grupos medianos")}
              {numField("6-8 Personas *", "precioTramo6_8", "Tarifa plana para grupos grandes")}
            </div>

            {t1 > 0 && t3 > 0 && t6 > 0 && (
              <div style={{ background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 4, padding: "10px 12px", fontSize: 11, fontFamily: sans }}>
                <div style={{ fontWeight: 700, color: "#0e7490", marginBottom: 6 }}>Vista previa de tramos:</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {[
                    { label: "1-2 p.", precio: t1, pp: false },
                    { label: "3-5 p.", precio: t3, pp: false },
                    { label: "6-8 p.", precio: t6, pp: false },
                    { label: "9+ p.",  precio: pp, pp: true  },
                  ].map(({ label, precio, pp: ispp }) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ color: "#374151", fontSize: 10 }}>{label}</span>
                      <span style={{ fontFamily: mono, fontWeight: 700, color: "#0e7490", fontSize: 13 }}>
                        {"RD$ " + fmt(precio) + (ispp ? "/p." : "")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ background: showGrupo ? "#fffbeb" : "#f9fafb", border: ("1px solid " + (showGrupo ? "#fde68a" : "#e5e7eb")), borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 14 }}>
            {showGrupo ? "Precio para 9+ personas (por persona)" : "Precio por Persona"}
          </div>
          <div style={{ maxWidth: 200 }}>
            {numField(
              showGrupo ? "Precio / Persona (9+) *" : "Precio por Persona *",
              "precioPorPersona",
              showGrupo ? "9+ personas se cobra este precio x cantidad" : "Precio unitario por turista"
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>ITBIS</label>
          <div style={{ display: "flex", gap: 8 }}>
            {ITBIS_RATES.map(({ val, label }) => {
              const active = form.itbis === val;
              return (
                <button key={val} type="button" onClick={() => setF("itbis", val)}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 4, cursor: "pointer",
                    border: ("2px solid " + (active ? "#111" : "#e5e7eb")),
                    background: active ? "#111" : "#fff", color: active ? "#fff" : "#374151",
                    fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: sans, transition: "all 0.1s",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
          {form.itbis === 0 && (
            <div style={{ fontSize: 10, color: "#166534", marginTop: 4, fontFamily: sans }}>
              Los servicios turisticos generalmente estan exentos de ITBIS.
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
          <div onClick={() => setF("activo", !form.activo)}
            style={{
              width: 18, height: 18, border: ("2px solid " + (form.activo ? "#0e7490" : "#d1d5db")),
              borderRadius: 4, background: form.activo ? "#0e7490" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer",
            }}>
            {form.activo && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: sans, color: "#374151" }}>Servicio activo</div>
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: sans }}>Solo los servicios activos aparecen al facturar</div>
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