"use client";

import { useState } from "react";
import type { Servicio, ModoLinea } from "@/types";
import { fmt } from "@/types";
import Modal from "@/components/modals/modal";

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";

interface Props {
  servicios: Servicio[];
  onSelect:  (s: Servicio, modo: ModoLinea) => void;
  onClose:   () => void;
}

export default function ModalServicios({ servicios, onSelect, onClose }: Props) {
  const [busqueda,  setBusqueda]  = useState("");
  const [pendiente, setPendiente] = useState<Servicio | null>(null);

  const filtrados = servicios.filter((s) =>
    s.activo && (
      s.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.codigo.toLowerCase().includes(busqueda.toLowerCase())
    )
  );

  const handleClick = (s: Servicio) => {
    // Si tiene ambas modalidades, pedir al usuario que elija
    if (s.modalidad === "ambas") { setPendiente(s); return; }
    onSelect(s, s.modalidad === "por_grupo" ? "por_grupo" : "por_persona");
  };

  return (
    <Modal title="Seleccionar Servicio" onClose={onClose} width={600}>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
          width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          placeholder="Buscar por nombre o código..." />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 440, overflowY: "auto" }}>
        {filtrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
            No se encontraron servicios activos
          </div>
        ) : filtrados.map((s) => (
          <div key={s.id} onClick={() => handleClick(s)}
            style={{ padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", background: "#fff", transition: "all 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ecfeff"; e.currentTarget.style.borderColor = "#a5f3fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: "#9ca3af" }}>{s.codigo}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111", fontFamily: sans }}>{s.nombre}</span>
                  {s.itbis === 0 && (
                    <span style={{ fontSize: 10, fontFamily: sans, color: "#166534", background: "#f0faf4", border: "1px solid #bbf7d0", borderRadius: 3, padding: "1px 6px" }}>
                      Exento
                    </span>
                  )}
                </div>
                {s.descripcion && (
                  <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans }}>{s.descripcion}</div>
                )}
              </div>

              {/* Resumen de precios */}
              <div style={{ flexShrink: 0, textAlign: "right", fontSize: 11, fontFamily: sans }}>
                {(s.modalidad === "por_grupo" || s.modalidad === "ambas") && s.precioTramo1_2 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ color: "#9ca3af", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Por Grupo</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {[
                        { label: "1–2 p.", precio: s.precioTramo1_2 },
                        { label: "3–5 p.", precio: s.precioTramo3_5 },
                        { label: "6–8 p.", precio: s.precioTramo6_8 },
                      ].filter(t => t.precio).map(({ label, precio }) => (
                        <div key={label} style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          <span style={{ color: "#9ca3af", fontSize: 10 }}>{label}</span>
                          <span style={{ fontFamily: mono, fontWeight: 600, color: "#374151", fontSize: 12 }}>RD$ {fmt(precio ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {s.precioPorPersona && (
                  <div>
                    <div style={{ color: "#9ca3af", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                      {s.modalidad === "por_grupo" || s.modalidad === "ambas" ? "9+ p." : "Por Persona"}
                    </div>
                    <span style={{ fontFamily: mono, fontWeight: 700, color: "#0e7490", fontSize: 13 }}>
                      RD$ {fmt(s.precioPorPersona)}<span style={{ fontWeight: 400, fontSize: 10, color: "#9ca3af" }}>/p.</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-modal para elegir modo cuando tiene "ambas" */}
      {pendiente && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4 }}>¿Cómo se factura?</div>
            <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 20 }}>
              <strong>{pendiente.nombre}</strong> — elige la modalidad para esta línea:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" onClick={() => { onSelect(pendiente, "por_grupo"); setPendiente(null); }}
                style={{ padding: "14px 16px", border: "2px solid #0e7490", borderRadius: 6, background: "#ecfeff", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0e7490", fontFamily: sans, marginBottom: 4 }}>Por Grupo (tramos)</div>
                <div style={{ fontSize: 11, color: "#374151", fontFamily: sans, display: "flex", gap: 12 }}>
                  {pendiente.precioTramo1_2 && <span>1–2p: RD$ {fmt(pendiente.precioTramo1_2)}</span>}
                  {pendiente.precioTramo3_5 && <span>3–5p: RD$ {fmt(pendiente.precioTramo3_5)}</span>}
                  {pendiente.precioTramo6_8 && <span>6–8p: RD$ {fmt(pendiente.precioTramo6_8)}</span>}
                </div>
              </button>
              <button type="button" onClick={() => { onSelect(pendiente, "por_persona"); setPendiente(null); }}
                style={{ padding: "14px 16px", border: "2px solid #374151", borderRadius: 6, background: "#f9fafb", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", fontFamily: sans, marginBottom: 4 }}>Por Persona</div>
                <div style={{ fontSize: 11, color: "#374151", fontFamily: mono }}>
                  RD$ {fmt(pendiente.precioPorPersona ?? 0)} × nº de personas
                </div>
              </button>
              <button type="button" onClick={() => setPendiente(null)}
                style={{ padding: "9px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#6b7280", fontFamily: sans }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}