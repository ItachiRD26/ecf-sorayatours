"use client";

import { useState, useRef, useEffect } from "react";
import type { Cliente } from "@/types";

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";

const TIPO_COLOR: Record<string, { color: string; bg: string; border: string; label: string }> = {
  juridica:   { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", label: "Jurídica"   },
  fisica:     { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", label: "Física"      },
  consumidor: { color: "#374151", bg: "#f9fafb", border: "#e5e7eb", label: "Consumidor" },
};

interface Props {
  clientes: Cliente[];
  onSelect: (cliente: Cliente) => void;
  onClose:  () => void;
}

export function ClienteSearchModal({ clientes, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const filtered = clientes
    .filter((c) =>
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      c.rnc?.includes(q) ||
      c.telefono?.includes(q)
    )
    .slice(0, 30);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.4)", zIndex: 700,
        display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "60px 16px 20px",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 4,
        width: "100%", maxWidth: 460,
        maxHeight: "calc(100vh - 88px)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        border: "1px solid #e5e7eb",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid #e5e7eb",
          display: "flex", gap: 10, alignItems: "center",
          position: "sticky", top: 0, background: "#fff", zIndex: 10,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }}>
            <circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 13, fontFamily: sans, color: "#111", background: "transparent",
            }}
            placeholder="Buscar por nombre, RNC o teléfono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 2 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style={{
          padding: "5px 16px", fontSize: 10, color: "#9ca3af",
          fontFamily: sans, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.05em", background: "#fafafa", borderBottom: "1px solid #f3f4f6",
        }}>
          {q
            ? `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`
            : `${clientes.length} cliente${clientes.length !== 1 ? "s" : ""}`
          }
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 12, fontFamily: sans }}>
              Sin resultados para &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((c) => {
              const tc = TIPO_COLOR[c.tipo] ?? TIPO_COLOR.consumidor;
              return (
                <button key={c.id} onClick={() => onSelect(c)}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 16px",
                    background: "none", border: "none",
                    borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontFamily: sans, fontWeight: 600, color: "#111", flex: 1 }}>
                      {c.nombre}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`,
                      padding: "2px 6px", borderRadius: 3,
                      textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: sans,
                    }}>
                      {tc.label}
                    </span>
                  </div>
                  {(c.rnc || c.telefono) && (
                    <div style={{ marginTop: 2, fontSize: 11, color: "#6b7280", fontFamily: mono, display: "flex", gap: 16 }}>
                      {c.rnc      && <span>RNC: {c.rnc}</span>}
                      {c.telefono && <span>{c.telefono}</span>}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}