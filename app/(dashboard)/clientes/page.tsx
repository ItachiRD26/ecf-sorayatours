"use client";

import { useState } from "react";
import { useClientes } from "@/hooks/useclientes";
import type { Cliente } from "@/types";
import Icon from "@/components/ui/icon";
import ModalClienteForm from "@/components/modals/modalclienteform";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff", boxSizing: "border-box",
};

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    juridica:   { label: "Jurídica",    bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    fisica:     { label: "Física",      bg: "#f0faf4", color: "#166534", border: "#bbf7d0" },
    consumidor: { label: "Cons. Final", bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  };
  const s = map[tipo] ?? map.juridica;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: sans, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

export default function ClientesPage() {
  const { clientes, loading, error, agregar, actualizar, eliminar } = useClientes();
  const [search,     setSearch]     = useState("");
  const [modal,      setModal]      = useState<"nuevo" | "editar" | null>(null);
  const [selected,   setSelected]   = useState<Cliente | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  const filtered = clientes.filter((c) => {
    const matchSearch = c.nombre.toLowerCase().includes(search.toLowerCase()) || c.rnc.includes(search.replace(/\D/g, "")) || c.ciudad.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (tipoFiltro === "todos" || c.tipo === tipoFiltro);
  });

  const handleNuevo  = async (data: Omit<Cliente, "id">) => { setSaving(true); try { await agregar(data); setModal(null); } finally { setSaving(false); } };
  const handleEditar = async (data: Omit<Cliente, "id">) => {
    if (!selected) return;
    setSaving(true);
    try { await actualizar(selected.id, data); setModal(null); setSelected(null); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: "#111" }}>Clientes</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 3, fontFamily: sans }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""} registrado{clientes.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setModal("nuevo")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
          <Icon name="plus" size={14} /> Nuevo Cliente
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><Icon name="search" size={14} /></div>
          <input style={{ ...inputStyle, paddingLeft: 34 }} placeholder="Buscar por nombre, RNC o ciudad..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ val: "todos", label: "Todos" }, { val: "juridica", label: "Jurídicas" }, { val: "fisica", label: "Físicas" }, { val: "consumidor", label: "Cons. Final" }].map((f) => (
            <button key={f.val} onClick={() => setTipoFiltro(f.val)}
              style={{ padding: "6px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: sans, border: `1px solid ${tipoFiltro === f.val ? "#111" : "#e5e7eb"}`, background: tipoFiltro === f.val ? "#111" : "#fff", color: tipoFiltro === f.val ? "#fff" : "#374151", fontWeight: tipoFiltro === f.val ? 600 : 400 }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontFamily: sans }}>Cargando clientes...</div>}
      {error   && <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, color: "#991b1b", fontSize: 13, fontFamily: sans }}>{error}</div>}

      {!loading && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["RNC / Cédula", "Nombre", "Ciudad", "Contacto", "Teléfono", "Tipo", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                  <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 12, color: "#374151" }}>{c.rnc || <span style={{ color: "#d1d5db", fontStyle: "italic", fontSize: 11 }}>No indicada</span>}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: "#111" }}>
                    <div>{c.nombre}</div>
                    {c.email && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{c.email}</div>}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#374151" }}>{c.ciudad}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#374151" }}>{c.contacto}</td>
                  <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 12 }}>{c.telefono}</td>
                  <td style={{ padding: "11px 14px" }}><TipoBadge tipo={c.tipo} /></td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setSelected(c); setModal("editar"); }} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#374151", display: "flex" }}><Icon name="edit" size={13} /></button>
                      <button onClick={() => setConfirmId(c.id)} style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#dc2626", display: "flex" }}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
              {search || tipoFiltro !== "todos" ? "No se encontraron clientes con ese filtro" : "No hay clientes registrados aún"}
            </div>
          )}
        </div>
      )}

      {modal === "nuevo" && <ModalClienteForm modo="nuevo" onSave={handleNuevo} onClose={() => setModal(null)} saving={saving} />}
      {modal === "editar" && selected && <ModalClienteForm modo="editar" inicial={selected} onSave={handleEditar} onClose={() => { setModal(null); setSelected(null); }} saving={saving} />}

      {confirmId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 400, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ fontFamily: serif, fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 10 }}>Eliminar cliente</div>
            <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 20 }}>Esta acción no se puede deshacer. Las facturas asociadas se mantendrán.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmId(null)} style={{ padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans }}>Cancelar</button>
              <button onClick={async () => { await eliminar(confirmId); setConfirmId(null); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
                <Icon name="trash" size={13} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}