"use client";

import { useState } from "react";
import type { Cliente, SubtipoJuridica } from "@/types";
import { maskTelefono, getIdentificadorInfo } from "@/lib/masks";
import Modal from "@/components/modals/modal";

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
const btnPrimary: React.CSSProperties = {
  padding: "9px 18px", background: "#111", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 14px", background: "#fff", color: "#374151",
  border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans,
};

const TIPOS = [
  { val: "juridica"   as const, label: "Persona Jurídica", desc: "Empresa · RNC 9 dígitos"           },
  { val: "fisica"     as const, label: "Persona Física",   desc: "Contribuyente · RNC = Cédula"       },
  { val: "consumidor" as const, label: "Consumidor Final", desc: "Compra ocasional · Cédula opcional" },
];

const SUBTIPOS: { val: SubtipoJuridica; label: string; desc: string; ecf: string }[] = [
  { val: "regular",     label: "Regular",       desc: "Empresa privada",                ecf: "E31" },
  { val: "gobierno",    label: "Gubernamental", desc: "Gobierno / institución pública", ecf: "E45" },
  { val: "zona_franca", label: "Zona Franca",   desc: "Régimen especial",               ecf: "E44" },
  { val: "exportacion", label: "Exportación",   desc: "Empresa exportadora",            ecf: "E46" },
];

const EMPTY: Omit<Cliente, "id"> = {
  rnc: "", nombre: "", direccion: "", ciudad: "",
  contacto: "", telefono: "", tipo: "juridica", subtipo: "regular", email: "",
};

type RncStatus = "idle" | "checking" | "valid" | "invalid" | "error";

interface Props {
  modo:     "nuevo" | "editar";
  inicial?: Partial<Omit<Cliente, "id">>;
  onSave:   (data: Omit<Cliente, "id">) => Promise<void>;
  onClose:  () => void;
  saving:   boolean;
}

export default function ModalClienteForm({ modo, inicial, onSave, onClose, saving }: Props) {
  const [form,      setForm]      = useState<Omit<Cliente, "id">>({ ...EMPTY, ...inicial });
  const [sinCedula, setSinCedula] = useState((inicial?.tipo === "consumidor") && !inicial?.rnc);
  const [rncStatus, setRncStatus] = useState<RncStatus>("idle");
  const [rncNombre, setRncNombre] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const idInfo = getIdentificadorInfo(form.tipo as "juridica" | "fisica" | "consumidor");

  const handleTipo = (tipo: typeof form.tipo) => {
    setForm((p) => ({ ...p, tipo, rnc: "", subtipo: tipo === "juridica" ? "regular" : undefined }));
    setRncStatus("idle"); setRncNombre(""); setSinCedula(false);
  };

  const handleRNC = (value: string) => { set("rnc", idInfo.mask(value)); setRncStatus("idle"); setRncNombre(""); };

  const handleBlurRNC = async () => {
    const digits = form.rnc.replace(/\D/g, "");
    if (digits.length !== 9 && digits.length !== 11) { setRncStatus("idle"); return; }
    if (form.tipo === "consumidor") {
      const { validarCedula } = await import("@/lib/masks");
      setRncStatus(validarCedula(form.rnc) ? "valid" : "invalid"); return;
    }
    setRncStatus("checking"); setRncNombre("");
    try {
      const res  = await fetch(`/api/validate-rnc?number=${digits}`);
      const data = await res.json();
      if (data.valid) { setRncStatus("valid"); setRncNombre(data.name); if (!form.nombre) set("nombre", data.name); }
      else setRncStatus("invalid");
    } catch { setRncStatus("error"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rncStatus === "invalid") { alert(`El ${idInfo.label} no está registrado en la DGII.`); return; }
    await onSave(form);
  };

  const tipoColors = {
    juridica:   { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    fisica:     { bg: "#f0faf4", color: "#166534", border: "#bbf7d0" },
    consumidor: { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  }[form.tipo as "juridica" | "fisica" | "consumidor"];

  const f = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#111"; };
  const b = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#d1d5db"; };

  return (
    <Modal title={modo === "nuevo" ? "Nuevo Cliente" : "Editar Cliente"} onClose={onClose} width={600}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo de Cliente</label>
            <div style={{ display: "flex", gap: 8 }}>
              {TIPOS.map((t) => (
                <button key={t.val} type="button" onClick={() => handleTipo(t.val)} style={{
                  flex: 1, padding: "10px 8px", textAlign: "left",
                  border: `1px solid ${form.tipo === t.val ? "#111" : "#d1d5db"}`, borderRadius: 4,
                  cursor: "pointer", background: form.tipo === t.val ? "#111" : "#fff",
                  color: form.tipo === t.val ? "#fff" : "#374151", transition: "all 0.1s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: sans, marginBottom: 2 }}>{t.label}</div>
                  <div style={{ fontSize: 10, fontFamily: sans, color: form.tipo === t.val ? "rgba(255,255,255,0.55)" : "#9ca3af" }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: tipoColors.bg, border: `1px solid ${tipoColors.border}`, borderRadius: 4, padding: "8px 12px" }}>
            <div style={{ fontSize: 12, color: tipoColors.color, fontFamily: sans }}><strong>{idInfo.label}:</strong> {idInfo.hint}</div>
          </div>

          {/* Subtipo jurídica */}
          {form.tipo === "juridica" && (
            <div>
              <label style={labelStyle}>Subtipo de empresa</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SUBTIPOS.map((s) => (
                  <button key={s.val} type="button" onClick={() => set("subtipo", s.val)} style={{
                    padding: "8px 10px", textAlign: "left",
                    border: `1px solid ${form.subtipo === s.val ? "#0e7490" : "#d1d5db"}`, borderRadius: 4,
                    cursor: "pointer", background: form.subtipo === s.val ? "#ecfeff" : "#fff",
                    transition: "all 0.1s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: sans, color: form.subtipo === s.val ? "#0e7490" : "#374151" }}>{s.label}</div>
                      <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, color: form.subtipo === s.val ? "#0e7490" : "#9ca3af" }}>{s.ecf}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans, marginTop: 2 }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RNC/Cédula */}
          <div>
            <label style={labelStyle}>{idInfo.label}{form.tipo !== "consumidor" && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}</label>
            {form.tipo === "consumidor" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", userSelect: "none" }}>
                <div onClick={() => { setSinCedula((v) => !v); if (!sinCedula) { set("rnc", ""); setRncStatus("idle"); } }}
                  style={{ width: 16, height: 16, border: `2px solid ${sinCedula ? "#374151" : "#d1d5db"}`, borderRadius: 3, background: sinCedula ? "#374151" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                  {sinCedula && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <span style={{ fontSize: 11, fontFamily: sans, color: sinCedula ? "#374151" : "#6b7280", fontWeight: sinCedula ? 600 : 400 }}>No aplica / Cliente prefiere no indicar</span>
              </label>
            )}
            {!sinCedula ? (
              <>
                <div style={{ position: "relative" }}>
                  <input required={form.tipo !== "consumidor"} disabled={rncStatus === "checking"}
                    style={{ ...inputStyle, fontFamily: mono, letterSpacing: "0.05em", borderColor: rncStatus === "valid" ? "#bbf7d0" : rncStatus === "invalid" ? "#fecaca" : "#d1d5db", background: rncStatus === "valid" ? "#f0faf4" : rncStatus === "invalid" ? "#fef2f2" : "#fff" }}
                    placeholder={idInfo.placeholder} value={form.rnc}
                    onChange={(e) => handleRNC(e.target.value)} onBlur={handleBlurRNC} onFocus={f} />
                  {rncStatus === "checking" && (
                    <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                      <div style={{ width: 14, height: 14, border: "2px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}
                </div>
                {rncStatus === "checking" && <div style={{ marginTop: 4, fontSize: 11, color: "#1d4ed8", fontFamily: sans }}>Consultando registro DGII...</div>}
                {rncStatus === "valid"    && <div style={{ marginTop: 4, fontSize: 11, color: "#166534", fontFamily: sans }}>✓ Registrado en la DGII{rncNombre ? ` · ${rncNombre}` : ""}</div>}
                {rncStatus === "invalid"  && <div style={{ marginTop: 4, fontSize: 11, color: "#991b1b", fontFamily: sans }}>No encontrado en el registro de la DGII</div>}
                {rncStatus === "error"    && <div style={{ marginTop: 4, fontSize: 11, color: "#92400e", fontFamily: sans }}>No se pudo conectar con la DGII. Verifica manualmente.</div>}
              </>
            ) : (
              <div style={{ padding: "10px 14px", background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, fontSize: 12, color: "#9ca3af", fontFamily: sans, fontStyle: "italic" }}>
                Cliente sin cédula — se emitirá como Consumidor Final
              </div>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>{form.tipo === "juridica" ? "Razón Social" : "Nombre Completo"}<span style={{ color: "#dc2626", marginLeft: 2 }}>*</span></label>
            <input required style={inputStyle}
              placeholder={form.tipo === "juridica" ? "EMPRESA SRL" : form.tipo === "fisica" ? "Juan Pérez" : "Nombre (opcional)"}
              value={form.nombre} onChange={(e) => set("nombre", e.target.value)} onFocus={f} onBlur={b} />
          </div>

          {/* Dirección + Ciudad */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} placeholder="Calle Principal #123" value={form.direccion} onChange={(e) => set("direccion", e.target.value)} onFocus={f} onBlur={b} />
            </div>
            <div>
              <label style={labelStyle}>Ciudad</label>
              <input style={inputStyle} placeholder="Santo Domingo" value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} onFocus={f} onBlur={b} />
            </div>
          </div>

          {/* Contacto + Teléfono */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Persona de Contacto</label>
              <input style={inputStyle} placeholder="Nombre del contacto" value={form.contacto} onChange={(e) => set("contacto", e.target.value)} onFocus={f} onBlur={b} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input style={{ ...inputStyle, fontFamily: mono }} placeholder="809-000-0000" value={form.telefono}
                onChange={(e) => set("telefono", maskTelefono(e.target.value))} onFocus={f} onBlur={b} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email (opcional)</label>
            <input type="email" style={inputStyle} placeholder="contacto@empresa.com" value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)} onFocus={f} onBlur={b} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving || rncStatus === "checking"}
            style={{ ...btnPrimary, background: saving || rncStatus === "checking" ? "#d1d5db" : "#111", cursor: saving || rncStatus === "checking" ? "not-allowed" : "pointer" }}>
            {saving ? "Guardando..." : "Guardar Cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}