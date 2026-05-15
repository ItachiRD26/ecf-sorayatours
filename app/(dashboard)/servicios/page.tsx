"use client";

import { useState } from "react";
import { useServicios } from "@/hooks/useservicios";
import { useToast }     from "@/hooks/usetoast";
import { useConfirm }   from "@/hooks/useconfirm";
import ModalServicioForm from "@/components/modals/modalservicioform";
import type { Servicio, ModalidadServicio } from "@/types";
import { fmt } from "@/types";
import Badge  from "@/components/ui/badge";
import Icon   from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const MODALIDAD_LABELS: Record<ModalidadServicio, string> = {
  por_persona: "Por Persona",
  por_grupo:   "Por Grupo",
  ambas:       "Ambas",
};

export default function ServiciosPage() {
  const { servicios, loading, agregar, actualizar, eliminar } = useServicios();
  const { push, ToastContainer } = useToast();
  const { confirm, ConfirmUI }   = useConfirm();
  const [showForm,     setShowForm]     = useState(false);
  const [editando,     setEditando]     = useState<Servicio | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroMod,    setFiltroMod]    = useState<ModalidadServicio | "">("");
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "activos" | "inactivos">("todos");

  const filtrados = servicios.filter((s) => {
    const q           = busqueda.toLowerCase();
    const matchBusq   = !q || s.nombre.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q);
    const matchMod    = !filtroMod || s.modalidad === filtroMod;
    const matchActivo = filtroActivo === "todos" || (filtroActivo === "activos" ? s.activo : !s.activo);
    return matchBusq && matchMod && matchActivo;
  });

  const handleSave = async (data: Omit<Servicio, "id">) => {
    setSaving(true);
    try {
      if (editando) { await actualizar(editando.id, data); push({ tipo: "success", mensaje: "Servicio actualizado" }); }
      else          { await agregar(data);                  push({ tipo: "success", mensaje: "Servicio creado" }); }
      setShowForm(false); setEditando(null);
    } catch {
      push({ tipo: "error", mensaje: "Error al guardar el servicio" });
    } finally { setSaving(false); }
  };

  const handleEliminar = async (s: Servicio) => {
    const ok = await confirm({ titulo: "Eliminar servicio", mensaje: `Eliminar "${s.nombre}"? Esta accion no puede deshacerse.`, btnOk: "Eliminar", peligro: true });
    if (!ok) return;
    try { await eliminar(s.id); push({ tipo: "success", mensaje: "Servicio eliminado" }); }
    catch { push({ tipo: "error", mensaje: "Error al eliminar" }); }
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>Catalogo de Servicios</h1>
          <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans }}>Excursiones y servicios disponibles para facturar</div>
        </div>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
          <Icon name="plus" size={14} /> Nuevo Servicio
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
            placeholder="Buscar servicio..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroMod} onChange={(e) => setFiltroMod(e.target.value as ModalidadServicio | "")}>
          <option value="">Todas las modalidades</option>
          <option value="por_persona">Por Persona</option>
          <option value="por_grupo">Por Grupo</option>
          <option value="ambas">Ambas</option>
        </select>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value as "todos" | "activos" | "inactivos")}>
          <option value="todos">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontFamily: sans }}>Cargando servicios...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", fontFamily: sans }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛵</div>
          <div style={{ fontSize: 16, color: "#374151", fontWeight: 600, marginBottom: 6 }}>{servicios.length === 0 ? "No hay servicios aun" : "Sin resultados"}</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{servicios.length === 0 ? "Crea tu primer servicio de excursion" : "Ajusta los filtros"}</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["Codigo", "Servicio", "Modalidad", "Tarifas Grupo", "9+ / Persona", "ITBIS", "Estado", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "12px 14px", fontFamily: mono, fontSize: 12, color: "#6b7280" }}>{s.codigo}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111", fontFamily: sans }}>{s.nombre}</div>
                    {s.descripcion && <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: sans, marginTop: 2 }}>{s.descripcion}</div>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 3, background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", fontFamily: sans, fontWeight: 600 }}>
                      {MODALIDAD_LABELS[s.modalidad]}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#374151" }}>
                    {s.precioTramo1_2 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, fontFamily: mono, fontSize: 11 }}>
                        <span>RD$ {fmt(s.precioTramo1_2)} <span style={{ color: "#9ca3af" }}>1-2p</span></span>
                        {s.precioTramo3_5 && <span>RD$ {fmt(s.precioTramo3_5)} <span style={{ color: "#9ca3af" }}>3-5p</span></span>}
                        {s.precioTramo6_8 && <span>RD$ {fmt(s.precioTramo6_8)} <span style={{ color: "#9ca3af" }}>6-8p</span></span>}
                      </div>
                    ) : "---"}
                  </td>
                  <td style={{ padding: "12px 14px", fontFamily: mono, fontSize: 12, color: "#0e7490" }}>
                    {s.precioPorPersona ? ("RD$ " + fmt(s.precioPorPersona) + "/p.") : "---"}
                  </td>
                  <td style={{ padding: "12px 14px" }}><Badge tipo={s.itbis === 0 ? "success" : "info"}>{s.itbis === 0 ? "Exento" : (s.itbis * 100 + "%")}</Badge></td>
                  <td style={{ padding: "12px 14px" }}><Badge tipo={s.activo ? "success" : "neutral"}>{s.activo ? "Activo" : "Inactivo"}</Badge></td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditando(s); setShowForm(true); }} style={{ padding: "5px 10px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans, color: "#374151" }}>Editar</button>
                      <button onClick={() => handleEliminar(s)} style={{ padding: "5px 10px", background: "#fff", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center" }}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", fontSize: 12, color: "#9ca3af", fontFamily: sans, borderTop: "1px solid #f3f4f6" }}>
            {filtrados.length} de {servicios.length} servicio(s)
          </div>
        </div>
      )}

      {showForm && (
        <ModalServicioForm servicio={editando ?? undefined} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditando(null); }} saving={saving} />
      )}
      {ToastContainer}
      {ConfirmUI}
    </div>
  );
}