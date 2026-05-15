"use client";

import { useState, useEffect } from "react";
import { doc, getDoc }          from "firebase/firestore";
import { db }                   from "@/lib/firebase";
import { useCuentasPorCobrar }  from "@/hooks/usecuentasporcobrar";
import { useClientes }          from "@/hooks/useclientes";
import { useFacturas }          from "@/hooks/usefacturas";
import { useConfirm }           from "@/hooks/useconfirm";
import PrintModal               from "@/components/print/PrintModal";
import ModalDetalleCuenta       from "@/components/modals/modaldetallecuenta";
import type { CuentaPorCobrar, Abono, Factura, Cliente } from "@/types";
import { fmt, fmtDate, calcPendiente } from "@/types";
import Icon  from "@/components/ui/icon";
import Badge from "@/components/ui/badge";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

interface EmpresaConfig { nombre: string; rnc: string; direccion: string; telefono: string; }

export default function CuentasPorCobrarPage() {
  const { cuentas, loading, registrarAbono, cambiarEstado } = useCuentasPorCobrar();
  const { clientes }    = useClientes();
  const { facturas }    = useFacturas();
  const { confirm, ConfirmUI } = useConfirm();

  const [search,       setSearch]       = useState("");
  const [filtroEstado, setFiltroEstado] = useState("vigente");
  const [detalle,      setDetalle]      = useState<CuentaPorCobrar | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [printData,    setPrintData]    = useState<{ factura: Factura; cliente: Cliente | undefined } | null>(null);
  const [empresa,      setEmpresa]      = useState<EmpresaConfig | null>(null);

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setEmpresa(snap.data() as EmpresaConfig);
    });
  }, []);

  const filtered = cuentas.filter((c) => {
    const cliente    = clientes.find((cl) => cl.id === c.clienteId);
    const matchSearch = !search || c.numeroFactura.toLowerCase().includes(search.toLowerCase()) || (cliente?.nombre ?? "").toLowerCase().includes(search.toLowerCase());
    const matchEstado = !filtroEstado || c.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const totalPendiente = filtered.reduce((s, c) => s + calcPendiente(c), 0);

  const handleAbono = async (cuenta: CuentaPorCobrar, abono: Omit<Abono, "id">) => {
    setSaving(true);
    try { await registrarAbono(cuenta.id, abono); setDetalle(null); }
    finally { setSaving(false); }
  };

  const handleAnular = async (c: CuentaPorCobrar) => {
    const ok = await confirm({ titulo: "Anular cuenta", mensaje: `¿Anular la cuenta ${c.numeroFactura}?`, btnOk: "Anular", peligro: true });
    if (ok) await cambiarEstado(c.id, "anulada");
  };

  const estadoBadge = (estado: string) => {
    if (estado === "pagada")  return <Badge tipo="success">Pagada</Badge>;
    if (estado === "vigente") return <Badge tipo="info">Vigente</Badge>;
    if (estado === "vencida") return <Badge tipo="danger">Vencida</Badge>;
    return <Badge tipo="neutral">Anulada</Badge>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: "#111" }}>Cuentas por Cobrar</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 3, fontFamily: sans }}>
            Pendiente total: <strong style={{ fontFamily: mono, color: "#b45309" }}>RD$ {fmt(totalPendiente)}</strong>
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Vigentes",  val: cuentas.filter((c) => c.estado === "vigente").length,  color: "#1d4ed8" },
          { label: "Vencidas",  val: cuentas.filter((c) => c.estado === "vencida").length,  color: "#991b1b" },
          { label: "Pagadas",   val: cuentas.filter((c) => c.estado === "pagada").length,   color: "#166534" },
          { label: "Por cobrar", val: `RD$ ${fmt(cuentas.filter((c) => ["vigente","vencida"].includes(c.estado)).reduce((s, c) => s + calcPendiente(c), 0))}`, color: "#b45309" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><Icon name="search" size={14} /></div>
          <input style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
            placeholder="Buscar por factura o cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="vigente">Vigentes</option>
          <option value="vencida">Vencidas</option>
          <option value="pagada">Pagadas</option>
          <option value="anulada">Anuladas</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontFamily: sans }}>Cargando cuentas...</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Factura #", "Cliente", "Fecha", "Vence", "Total", "Cobrado", "Pendiente", "Estado", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const cliente   = clientes.find((cl) => cl.id === c.clienteId);
                const pendiente = calcPendiente(c);
                const factura   = facturas.find((f) => f.eCF === c.numeroFactura);
                const hoy       = new Date(); hoy.setHours(0,0,0,0);
                const vence     = c.fechaVencimiento ? new Date(c.fechaVencimiento + "T00:00:00") : null;
                if (vence) vence.setHours(0,0,0,0);
                const vencida   = vence !== null && vence < hoy && pendiente > 0;

                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6", background: vencida ? "#fef2f2" : "transparent" }}
                    onMouseEnter={(e) => { if (!vencida) e.currentTarget.style.background = "#fafafa"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = vencida ? "#fef2f2" : ""; }}>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 13, fontWeight: 700 }}>
                      {factura ? (
                        <button onClick={() => setPrintData({ factura, cliente })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontFamily: mono, fontSize: 13, fontWeight: 700, padding: 0, textDecoration: "underline", textDecorationStyle: "dotted" }}>
                          {c.numeroFactura}
                        </button>
                      ) : <span style={{ color: "#1d4ed8" }}>{c.numeroFactura}</span>}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: "#111", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliente?.nombre ?? "—"}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtDate(c.fecha)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
                      {c.fechaVencimiento ? <span style={{ color: vencida ? "#991b1b" : "#374151", fontWeight: vencida ? 600 : 400 }}>{vencida ? "⚠ " : ""}{fmtDate(c.fechaVencimiento)}</span> : "—"}
                    </td>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 12 }}>RD$ {fmt(c.monto)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 12, color: "#166534" }}>RD$ {fmt(c.pagado)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 13, fontWeight: 700, color: pendiente > 0 ? "#b45309" : "#166534" }}>
                      {pendiente > 0 ? `RD$ ${fmt(pendiente)}` : "✓ Pagada"}
                    </td>
                    <td style={{ padding: "11px 14px" }}>{estadoBadge(c.estado)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => setDetalle(c)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#374151", display: "flex" }}><Icon name="eye" size={13} /></button>
                        {c.estado !== "anulada" && c.estado !== "pagada" && (
                          <button onClick={() => handleAnular(c)} style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#dc2626", display: "flex" }}><Icon name="x" size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
              {search ? "No se encontraron cuentas" : "No hay cuentas por cobrar registradas"}
            </div>
          )}
        </div>
      )}

      {detalle && (
        <ModalDetalleCuenta cuenta={detalle} cliente={clientes.find((c) => c.id === detalle.clienteId)}
          onClose={() => setDetalle(null)} onAbono={(abono) => handleAbono(detalle, abono)} saving={saving} />
      )}
      {printData && empresa && (
        <PrintModal factura={printData.factura} cliente={printData.cliente} empresa={empresa} onClose={() => setPrintData(null)} />
      )}
      {ConfirmUI}
    </div>
  );
}