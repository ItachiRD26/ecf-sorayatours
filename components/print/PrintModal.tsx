"use client";

import { useState, useEffect } from "react";
import { createPortal }        from "react-dom";
import type { Factura, Cliente } from "@/types";
import FacturaA4      from "./FacturaA4";
import FacturaTermica from "./FacturaTermica";

const sans  = "var(--font-sans)";
const serif = "var(--font-serif)";

interface EmpresaConfig {
  nombre:         string;
  rnc:            string;
  direccion:      string;
  telefono:       string;
  firmaVendedor?: string;
  firmaCliente?:  string;
}

interface Props {
  factura:  Factura;
  cliente:  Cliente | undefined;
  empresa?: EmpresaConfig;
  onClose:  () => void;
}

type Formato = "a4" | "88mm";

const DEFAULT_EMPRESA: EmpresaConfig = {
  nombre:        "SORAYA Y LEONARDO TOURS SRL",
  rnc:           "1-31217656-6",
  direccion:     "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:      "809-961-6343",
  firmaVendedor: "Preparado por",
  firmaCliente:  "Recibido conforme",
};

const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "9px 18px", background: "#111", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer",
  fontSize: 13, fontWeight: 500, fontFamily: sans,
};
const btnSecondary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 14px", background: "#fff", color: "#374151",
  border: "1px solid #d1d5db", borderRadius: 4,
  cursor: "pointer", fontSize: 13, fontFamily: sans,
};

export default function PrintModal({ factura, cliente, empresa = DEFAULT_EMPRESA, onClose }: Props) {
  const esE32 = factura.tipoECF === "E32";
  const [formato,  setFormato]  = useState<Formato>(esE32 ? "88mm" : "a4");
  const [step,     setStep]     = useState<"select" | "preview">(esE32 ? "select" : "preview");
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handlePrint = () => {
    const contenido = document.getElementById("ecf-contenido-impresion");
    if (!contenido) return;
    const esTermica = formato === "88mm";
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { alert("Permite ventanas emergentes para imprimir"); return; }
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>e-CF ${factura.eCF}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; }
  @page { size: ${esTermica ? "88mm auto" : "A4"}; margin: ${esTermica ? "0" : "12mm 15mm"}; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${contenido.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  if (!mounted) return null;

  const maxWidth = step === "preview" && formato === "a4"
    ? 860
    : step === "preview" && formato === "88mm"
    ? 420
    : 480;

  const content = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:   "fixed",
        inset:      0,
        background: "rgba(0,0,0,0.6)",
        zIndex:     9000,
      }} />

      {/* Scroll container */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         9001,
          overflowY:      "auto",
          overflowX:      "hidden",
          display:        "flex",
          justifyContent: "center",
          alignItems:     "flex-start",
          padding:        "32px 16px",
          boxSizing:      "border-box",
        }}
      >
        {/* Panel */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background:   "#fff",
            borderRadius: 6,
            width:        "100%",
            maxWidth:     maxWidth,
            margin:       "auto",
            boxShadow:    "0 24px 80px rgba(0,0,0,0.3)",
            overflow:     "hidden",
            flexShrink:   0,
          }}
        >

          {/* ── PASO 1: Selector de formato (solo E32) ── */}
          {step === "select" && (
            <>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: serif, fontSize: 17, fontWeight: 700, color: "#111" }}>
                  Formato de Impresión
                </div>
                <button onClick={onClose}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22, lineHeight: 1 }}>
                  ×
                </button>
              </div>

              <div style={{ padding: 24 }}>
                <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 20 }}>
                  Factura de Consumo (E32) — elige el formato de impresión:
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
                  {[
                    {
                      val:   "a4" as Formato,
                      label: "Formato A4",
                      desc:  "Impresora de papel carta o A4",
                      icon: (
                        <div style={{ width: 40, height: 54, border: `2px solid ${formato === "a4" ? "#fff" : "#374151"}`, borderRadius: 2, display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center", gap: 4, padding: 4 }}>
                          {[...Array(5)].map((_, i) => <div key={i} style={{ height: 2, width: "80%", background: formato === "a4" ? "rgba(255,255,255,0.7)" : "#d1d5db", borderRadius: 1 }} />)}
                        </div>
                      ),
                    },
                    {
                      val:   "88mm" as Formato,
                      label: "Ticket 88mm",
                      desc:  "Impresora térmica de recibos",
                      icon: (
                        <div style={{ width: 22, height: 54, border: `2px solid ${formato === "88mm" ? "#fff" : "#374151"}`, borderRadius: 2, display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center", gap: 3, padding: 3 }}>
                          {[...Array(7)].map((_, i) => <div key={i} style={{ height: 1.5, width: "80%", background: formato === "88mm" ? "rgba(255,255,255,0.7)" : "#d1d5db", borderRadius: 1 }} />)}
                        </div>
                      ),
                    },
                  ].map(({ val, label, desc, icon }) => (
                    <button key={val} onClick={() => setFormato(val)}
                      style={{
                        padding: 20, border: `2px solid ${formato === val ? "#111" : "#e5e7eb"}`,
                        borderRadius: 8, background: formato === val ? "#111" : "#fff",
                        cursor: "pointer", textAlign: "center", transition: "all 0.15s",
                      }}>
                      <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>{icon}</div>
                      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 14, color: formato === val ? "#fff" : "#111", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: sans, fontSize: 11, color: formato === val ? "rgba(255,255,255,0.7)" : "#6b7280" }}>{desc}</div>
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={onClose} style={btnSecondary}>Cancelar</button>
                  <button onClick={() => setStep("preview")} style={btnPrimary}>Ver Vista Previa →</button>
                </div>
              </div>
            </>
          )}

          {/* ── PASO 2: Vista previa ── */}
          {step === "preview" && (
            <>
              {/* Barra de controles sticky */}
              <div style={{
                padding:       "12px 20px",
                borderBottom:  "1px solid #e5e7eb",
                display:       "flex",
                gap:           8,
                alignItems:    "center",
                justifyContent: "space-between",
                background:    "#f9fafb",
                position:      "sticky",
                top:           0,
                zIndex:        10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {esE32 && (
                    <button onClick={() => setStep("select")} style={{ ...btnSecondary, fontSize: 12 }}>
                      ← Cambiar formato
                    </button>
                  )}
                  <span style={{
                    fontFamily: sans, fontSize: 12, color: "#6b7280",
                    background: "#e5e7eb", padding: "3px 10px", borderRadius: 12,
                  }}>
                    {formato === "a4" ? "Formato A4" : "Ticket 88mm"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handlePrint} style={btnPrimary}>🖨 Imprimir</button>
                  <button onClick={onClose}     style={btnSecondary}>Cerrar</button>
                </div>
              </div>

              {/* Contenido imprimible */}
              <div
                id="ecf-contenido-impresion"
                style={{
                  padding:    formato === "88mm" ? "20px" : "28px 32px",
                  background: "#f3f4f6",
                  display:    "flex",
                  justifyContent: "center",
                }}
              >
                <div style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.1)", borderRadius: 2 }}>
                  {formato === "a4" ? (
                    <FacturaA4 factura={factura} cliente={cliente} empresa={empresa} />
                  ) : (
                    <FacturaTermica factura={factura} cliente={cliente}
                      empresa={{ nombre: empresa.nombre, rnc: empresa.rnc, direccion: empresa.direccion, telefono: empresa.telefono }} />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}