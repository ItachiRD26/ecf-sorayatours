"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { db }       from "@/lib/firebase";
import { useAuth }  from "@/contexts/AuthContext";
import Icon         from "@/components/ui/icon";
import type { TipoECF } from "@/types";

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
  rnc:            "131-21765-6",
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

const ECF_TIPOS: TipoECF[] = ["E31","E32","E33","E34","E41","E43","E44","E45","E46","E47"];

export default function ConfiguracionPage() {
  const { perfil }                  = useAuth();
  const [config,   setConfig]       = useState<EmpresaConfig>(DEFAULTS);
  const [loading,  setLoading]      = useState(true);
  const [saving,   setSaving]       = useState(false);
  const [saved,    setSaved]        = useState(false);
  const [showWarn, setShowWarn]     = useState(false);

  // Sequence management state
  const [seqs,      setSeqs]        = useState<Record<string, number>>({});
  const [seqInputs, setSeqInputs]   = useState<Record<string, string>>({});
  const [seqSaving, setSeqSaving]   = useState<Record<string, boolean>>({});
  const [seqSaved,  setSeqSaved]    = useState<Record<string, boolean>>({});
  const [seqError,  setSeqError]    = useState<Record<string, string>>({});

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setConfig({ ...DEFAULTS, ...snap.data() as EmpresaConfig });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getDoc(doc(db, "config", "secuencias")).then((snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, number>) : {};
      setSeqs(data);
      const inputs: Record<string, string> = {};
      ECF_TIPOS.forEach((t) => { inputs[t] = String(data[t] ?? 0); });
      setSeqInputs(inputs);
    });
  }, []);

  const handleSeqSave = async (tipo: TipoECF) => {
    const val = parseInt(seqInputs[tipo] ?? "0", 10);
    if (isNaN(val) || val < 0) {
      setSeqError((p) => ({ ...p, [tipo]: "Valor inválido" }));
      return;
    }
    const current = seqs[tipo] ?? 0;
    if (val < current) {
      setSeqError((p) => ({ ...p, [tipo]: `No puede retroceder (actual: ${current})` }));
      return;
    }
    setSeqError((p) => ({ ...p, [tipo]: "" }));
    setSeqSaving((p) => ({ ...p, [tipo]: true }));
    try {
      await runTransaction(db, async (tx) => {
        const ref  = doc(db, "config", "secuencias");
        const snap = await tx.get(ref);
        const data = snap.exists() ? (snap.data() as Record<string, number>) : {};
        const live = data[tipo] ?? 0;
        if (val < live) throw new Error(`Conflicto: el valor actual ya es ${live}`);
        tx.set(ref, { [tipo]: val }, { merge: true });
      });
      setSeqs((p) => ({ ...p, [tipo]: val }));
      setSeqSaved((p) => ({ ...p, [tipo]: true }));
      setTimeout(() => setSeqSaved((p) => ({ ...p, [tipo]: false })), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setSeqError((p) => ({ ...p, [tipo]: msg }));
    } finally {
      setSeqSaving((p) => ({ ...p, [tipo]: false }));
    }
  };

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

      {/* Secuencias e-CF */}
      {perfil?.rol === "admin" && (
        <Seccion titulo="Secuencias e-CF (Numeración)">
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#92400e", fontFamily: sans, lineHeight: 1.6 }}>
            ⚠ Estos contadores determinan el próximo número de secuencia (eNCF) para cada tipo de comprobante. Solo puedes <strong>avanzar</strong> el contador, nunca retrocederlo. Úsalo para saltar números ya utilizados en intentos anteriores de certificación.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            {ECF_TIPOS.map((tipo) => {
              const current = seqs[tipo] ?? 0;
              const inputVal = seqInputs[tipo] ?? String(current);
              const isSaving = seqSaving[tipo] ?? false;
              const isSaved  = seqSaved[tipo]  ?? false;
              const err      = seqError[tipo]  ?? "";
              return (
                <div key={tipo} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111", fontFamily: mono }}>{tipo}</span>
                    <span style={{ fontSize: 10, color: "#6b7280", fontFamily: sans }}>actual: <strong>{current}</strong></span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number" min={current} step={1}
                      style={{ ...inputStyle, fontFamily: mono, flex: 1, padding: "6px 8px", borderColor: err ? "#ef4444" : "#d1d5db" }}
                      value={inputVal}
                      onChange={(e) => {
                        setSeqInputs((p) => ({ ...p, [tipo]: e.target.value }));
                        setSeqError((p) => ({ ...p, [tipo]: "" }));
                      }}
                    />
                    <button
                      onClick={() => handleSeqSave(tipo)}
                      disabled={isSaving || String(current) === inputVal}
                      style={{
                        padding: "6px 10px", fontSize: 12, border: "none", borderRadius: 4, cursor: (isSaving || String(current) === inputVal) ? "not-allowed" : "pointer",
                        background: isSaved ? "#166534" : (isSaving || String(current) === inputVal) ? "#d1d5db" : "#111",
                        color: "#fff", fontFamily: sans, whiteSpace: "nowrap",
                      }}
                    >
                      {isSaved ? "✓" : isSaving ? "..." : "Guardar"}
                    </button>
                  </div>
                  {err && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4, fontFamily: sans }}>{err}</div>}
                </div>
              );
            })}
          </div>
        </Seccion>
      )}

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