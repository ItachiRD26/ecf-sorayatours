"use client";

import { useState } from "react";
import { useFacturas }     from "@/hooks/usefacturas";
import { useCotizaciones } from "@/hooks/usecotizaciones";
import { useClientes }     from "@/hooks/useclientes";
import { useServicios }    from "@/hooks/useservicios";
import { fmt, fmtDate, calcTotales } from "@/types";
import Badge from "@/components/ui/badge";
import Icon  from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

function KPICard({ label, valor, sub, accent, icon }: { label: string; valor: string | number; sub: string; accent: string; icon: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: `3px solid ${accent}`, borderRadius: 4, padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans }}>{label}</div>
        <div style={{ color: accent, opacity: 0.7 }}><Icon name={icon} size={16} /></div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: sans }}>{sub}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { facturas,      loading: lf  } = useFacturas();
  const { cotizaciones,  loading: lc  } = useCotizaciones();
  const { clientes,      loading: lcl } = useClientes();
  const { servicios,     loading: ls  } = useServicios();
  const [periodo, setPeriodo] = useState<number | "hoy">(30);

  const loading = lf || lc || lcl || ls;

  const enPeriodo = (fecha: string) => {
    const hoy   = new Date();
    const fDate = new Date(fecha + "T00:00:00");
    if (periodo === "hoy") return fDate.toDateString() === hoy.toDateString();
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - (periodo as number) + 1);
    desde.setHours(0, 0, 0, 0);
    return fDate >= desde;
  };

  const PERIODOS = [
    { label: "Hoy",     val: "hoy" as const },
    { label: "7 dias",  val: 7  },
    { label: "30 dias", val: 30 },
    { label: "90 dias", val: 90 },
  ];

  const facturasPeriodo  = facturas.filter((f) => enPeriodo(f.fecha) && f.estado !== "anulada");
  const ingresos         = facturasPeriodo.filter((f) => f.estado === "pagada").reduce((s, f) => s + calcTotales(f.items).total, 0);
  const porCobrar        = facturasPeriodo.filter((f) => f.estado === "pendiente").reduce((s, f) => s + calcTotales(f.items).total, 0);
  const cotVigentes      = cotizaciones.filter((c) => c.estado === "vigente");
  const serviciosActivos = servicios.filter((s) => s.activo);
  const ultimasFacturas  = facturas.filter((f) => f.estado !== "anulada").slice(0, 5);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh", color: "#9ca3af", fontFamily: sans }}>
        Cargando dashboard...
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>Dashboard</h1>
          <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans }}>Soraya y Leonardo Tours SRL</div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 4, padding: 3 }}>
          {PERIODOS.map(({ label, val }) => (
            <button key={String(val)} type="button" onClick={() => setPeriodo(val)}
              style={{ padding: "5px 12px", borderRadius: 3, border: "none", cursor: "pointer", fontSize: 12, fontFamily: sans, fontWeight: 500, background: periodo === val ? "#fff" : "transparent", color: periodo === val ? "#111" : "#6b7280", boxShadow: periodo === val ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KPICard label="Ingresos cobrados"   valor={"RD$ " + fmt(ingresos)}  sub={facturasPeriodo.filter((f) => f.estado === "pagada").length + " facturas pagadas"}     accent="#0e7490" icon="invoice"  />
        <KPICard label="Por cobrar"           valor={"RD$ " + fmt(porCobrar)} sub={facturasPeriodo.filter((f) => f.estado === "pendiente").length + " pendientes"}         accent="#92400e" icon="alert"    />
        <KPICard label="Cotizaciones activas" valor={cotVigentes.length}      sub="Pendientes de convertir"                                                                accent="#1d4ed8" icon="quotes"   />
        <KPICard label="Servicios activos"    valor={serviciosActivos.length} sub="En catalogo de excursiones"                                                             accent="#166534" icon="products" />
        <KPICard label="Clientes"             valor={clientes.length}         sub="Registrados en el sistema"                                                              accent="#6b7280" icon="clients"  />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111" }}>Facturas Recientes</div>
        </div>
        {ultimasFacturas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
            No hay facturas emitidas aun
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["e-CF", "Cliente", "Fecha", "Total", "Estado"].map((h) => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: sans }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ultimasFacturas.map((f) => {
                const cliente = clientes.find((c) => c.id === f.clienteId);
                const nombre  = f.esConsumidorFinal ? (f.nombreConsumidor ?? "Consumidor Final") : (cliente?.nombre ?? "---");
                const t       = calcTotales(f.items);
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#111" }}>{f.eCF}</td>
                    <td style={{ padding: "11px 14px", fontSize: 13, color: "#374151", fontFamily: sans }}>{nombre}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#6b7280", fontFamily: sans }}>{fmtDate(f.fecha)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#111" }}>RD$ {fmt(t.total)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <Badge tipo={f.estado === "pagada" ? "success" : f.estado === "pendiente" ? "warning" : "danger"}>
                        {f.estado === "pagada" ? "Pagada" : f.estado === "pendiente" ? "Pendiente" : "Anulada"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111" }}>Servicios Activos</div>
        </div>
        {serviciosActivos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
            No hay servicios activos.
          </div>
        ) : (
          <div style={{ padding: "8px 0" }}>
            {serviciosActivos.slice(0, 6).map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", fontFamily: sans }}>{s.nombre}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: mono }}>{s.codigo}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {s.precioTramo1_2 && (
                    <div style={{ fontSize: 11, color: "#6b7280", fontFamily: sans }}>
                      {"Grupo: "}
                      <span style={{ fontFamily: mono, fontWeight: 600, color: "#374151" }}>RD$ {fmt(s.precioTramo1_2)}</span>
                      <span style={{ color: "#9ca3af", fontSize: 10 }}>{" 1-2p"}</span>
                      {s.precioTramo6_8 && (
                        <span>
                          {" / "}
                          <span style={{ fontFamily: mono, fontWeight: 600, color: "#374151" }}>RD$ {fmt(s.precioTramo6_8)}</span>
                          <span style={{ color: "#9ca3af", fontSize: 10 }}>{" 6-8p"}</span>
                        </span>
                      )}
                    </div>
                  )}
                  {s.precioPorPersona && (
                    <div style={{ fontSize: 12, fontFamily: mono, color: "#0e7490" }}>
                      RD$ {fmt(s.precioPorPersona)}
                      <span style={{ color: "#9ca3af", fontSize: 10 }}>{" /persona (9+)"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}