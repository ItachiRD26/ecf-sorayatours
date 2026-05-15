"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db }       from "@/lib/firebase";
import { useAuth }  from "@/contexts/AuthContext";
import Icon         from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const serif = "var(--font-serif)";
const mono  = "var(--font-mono)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#374151",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: sans,
};

interface EmpresaConfig {
  nombre: string; rnc: string; direccion: string; telefono: string;
  email: string; vencimientoECF: string; firmaVendedor: string; firmaCliente: string;
}

const DEFAULTS: EmpresaConfig = {
  nombre:         "Soraya y Leonardo Tours SRL",
  rnc:            "1-31217656-6",
  direccion:      "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:       "809-961-6343",
  email:          "",
  vencimientoECF: "2027-12-31",
  firmaVendedor:  "",
  firmaCliente:   "Recibido conforme",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #f3f4f6", fontFamily: sans }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

export default function ConfiguracionPage() {
  const { perfil }                  = useAuth();
  const [config,   setConfig]       = useState<EmpresaConfig>(DEFAULTS);
  const [loading,  setLoading]      = useState(true);
  const [saving,   setSaving]       = useState(false);
  const [saved,    setSaved]        = useState(false);
  const [showWarn, setShowWarn]     = useState(false);

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setConfig({ ...DEFAULTS, ...snap.data() as EmpresaConfig });
    }).finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof EmpresaConfig>(k: K, v: string) => setConfig((p) => ({ ...p, [k]: v }));
  const f   = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = "#111"; };
  const b   = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = "#d1d5db"; };

  const doSave = async () => {
    setSaving(true); setSaved(false); setShowWarn(false);
    try {
      await setDoc(doc(db, "config", "empresa"), config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { alert("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
      <div style={{ width: 28, height: 28, border: "2px solid #e5e7eb", borderTopColor: "#111", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
      <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
        <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: "#111" }}>Configuración</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 3, fontFamily: sans }}>Datos de la empresa y configuración del sistema</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setShowWarn(true); }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <Seccion titulo="Datos de la Empresa">
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#92400e", fontFamily: sans, lineHeight: 1.6 }}>
            ⚠ Estos datos aparecen en todos los Comprobantes Fiscales Electrónicos (e-CF). Cambios afectan todas las facturas futuras.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Nombre / Razón Social</label>
                <input required style={inputStyle} value={config.nombre} onChange={(e) => set("nombre", e.target.value)} onFocus={f} onBlur={b} />
              </div>
              <div>
                <label style={labelStyle}>RNC</label>
                <div style={{ position: "relative" }}>
                  <input readOnly style={{ ...inputStyle, fontFamily: mono, background: "#f3f4f6", color: "#374151", cursor: "not-allowed", paddingRight: 36 }} value={config.rnc} />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9ca3af" }}>🔒</span>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontFamily: sans }}>Dato fiscal — no modificable desde aquí</div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} value={config.direccion} onChange={(e) => set("direccion", e.target.value)} onFocus={f} onBlur={b} placeholder="Calle, ciudad, provincia" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={{ ...inputStyle, fontFamily: mono }} value={config.telefono} onChange={(e) => set("telefono", e.target.value)} onFocus={f} onBlur={b} placeholder="809-000-0000" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" style={inputStyle} value={config.email} onChange={(e) => set("email", e.target.value)} onFocus={f} onBlur={b} placeholder="contacto@empresa.com" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Vencimiento e-CF por defecto</label>
              <input type="date" style={{ ...inputStyle, fontFamily: mono }} value={config.vencimientoECF} onChange={(e) => set("vencimientoECF", e.target.value)} onFocus={f} onBlur={b} />
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, fontFamily: sans }}>Fecha de vencimiento del e-CF que aparece en las facturas</div>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Firmas del Documento">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Nombre en "Preparado por"</label>
              <input style={inputStyle} placeholder="Ej: María González — Ejecutiva de Ventas" value={config.firmaVendedor} onChange={(e) => set("firmaVendedor", e.target.value)} onFocus={f} onBlur={b} />
              <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af", fontFamily: sans }}>Aparece debajo de la línea de firma del vendedor</div>
            </div>
            <div>
              <label style={labelStyle}>Label "Recibido / Aprobado por"</label>
              <input style={inputStyle} placeholder="Ej: Recibido conforme" value={config.firmaCliente} onChange={(e) => set("firmaCliente", e.target.value)} onFocus={f} onBlur={b} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontFamily: sans }}>Vista previa — Firmas</div>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "20px 28px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  {[config.firmaVendedor || "Preparado por", config.firmaCliente || "Recibido conforme"].map((label) => (
                    <div key={label} style={{ width: "42%" }}>
                      <div style={{ height: 1, background: "#374151", marginBottom: 8 }} />
                      <div style={{ fontSize: 11, color: "#555", textAlign: "center", fontFamily: sans }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Usuario Actual">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[{ label: "Nombre", val: perfil?.nombre ?? "—" }, { label: "Email", val: perfil?.email ?? "—" }, { label: "Rol", val: perfil?.rol ?? "—" }].map(({ label, val }) => (
              <div key={label} style={{ background: "#f9fafb", borderRadius: 4, padding: "12px 14px", border: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#111", fontFamily: sans }}>{val}</div>
              </div>
            ))}
          </div>
        </Seccion>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 24px", background: saving ? "#d1d5db" : "#111", color: "#fff", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
            {saving ? "Guardando..." : <><Icon name="check" size={14} /> Guardar Cambios</>}
          </button>
          {saved && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#166534", fontSize: 13, fontFamily: sans }}>
              <Icon name="check" size={14} /> Cambios guardados correctamente
            </div>
          )}
        </div>
      </form>

      {/* Confirmación */}
      {showWarn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 8, maxWidth: 420, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#111", fontFamily: sans }}>⚠ Confirmar cambios en datos fiscales</div>
            </div>
            <div style={{ padding: "18px 22px", fontSize: 13, color: "#374151", fontFamily: sans, lineHeight: 1.7 }}>
              <p>Estás a punto de guardar cambios en los datos de la empresa. Estos datos aparecen en <strong>todos los e-CF</strong> que se emitan. Asegúrate de que la información sea correcta.</p>
              <div style={{ marginTop: 14, background: "#f9fafb", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>
                <div><strong>Nombre:</strong> {config.nombre}</div>
                <div><strong>RNC:</strong> {config.rnc}</div>
                <div><strong>Dirección:</strong> {config.direccion || "—"}</div>
              </div>
            </div>
            <div style={{ padding: "12px 22px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowWarn(false)} style={{ padding: "8px 16px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans, color: "#374151" }}>Cancelar</button>
              <button onClick={doSave} disabled={saving} style={{ padding: "8px 18px", background: saving ? "#d1d5db" : "#111", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontFamily: sans, color: "#fff", fontWeight: 500 }}>
                {saving ? "Guardando..." : "Sí, guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}