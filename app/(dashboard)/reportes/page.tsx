"use client";

import { useState } from "react";
import { useFacturas }  from "@/hooks/usefacturas";
import { useClientes }  from "@/hooks/useclientes";
import { calcTotales, fmt, fmtDate } from "@/types";
import Icon from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

export default function ReportesPage() {
  const { facturas, loading } = useFacturas();
  const { clientes }          = useClientes();
  const [desde, setDesde]     = useState("");
  const [hasta, setHasta]     = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  const filtradas = facturas.filter((f) => {
    if (f.estado === "anulada")  return false;
    if (desde && f.fecha < desde) return false;
    if (hasta && f.fecha > hasta) return false;
    if (tipoFiltro && f.tipoECF !== tipoFiltro) return false;
    return true;
  });

  const exportar607 = () => {
    const header = ["RNC_COMPRADOR","TIPO_ID_COMPRADOR","TIPO_BIENES_SERVICIOS","NCF","NCF_MOD","FECHA_COMPROBANTE","FECHA_RETENCION","MONTO_FACTURADO","ITBIS_FACTURADO","ITBIS_RETENIDO","RETENCION_RENTA","ITBIS_PERCIBIDO","ISC","OTROS_IMPUESTOS","EXCENTO","PAGO_CONTADO","PAGO_CREDITO"];
    const rows = filtradas.map((f) => {
      const cliente = clientes.find((c) => c.id === f.clienteId);
      const t       = calcTotales(f.items);
      const rnc     = f.esConsumidorFinal ? "" : (cliente?.rnc?.replace(/\D/g, "") ?? "");
      const tipoId  = f.esConsumidorFinal ? "3" : cliente?.tipo === "fisica" ? "2" : "1";
      const tipoBS  = "2"; // Servicios
      const esContado = f.terminos === "Contado";
      return [
        rnc, tipoId, tipoBS,
        f.eCF, f.eCFRef ?? "",
        f.fecha.replace(/-/g, ""),
        "",
        t.sub.toFixed(2),
        t.itbis.toFixed(2),
        "0.00", "0.00", "0.00", "0.00", "0.00",
        t.itbis === 0 ? t.sub.toFixed(2) : "0.00",
        esContado ? t.total.toFixed(2) : "0.00",
        esContado ? "0.00" : t.total.toFixed(2),
      ].join("|");
    });

    const csv     = [header.join("|"), ...rows].join("\n");
    const blob    = new Blob([csv], { type: "text/plain;charset=utf-8" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    const periodo = desde && hasta ? `${desde}_${hasta}` : "completo";
    a.href        = url;
    a.download    = `DGII_607_${periodo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = () => {
    const header = ["e-CF","Tipo","Fecha","Cliente","RNC","Subtotal","ITBIS","Total","Pago","Estado"];
    const rows   = filtradas.map((f) => {
      const cliente = clientes.find((c) => c.id === f.clienteId);
      const nombre  = f.esConsumidorFinal ? (f.nombreConsumidor ?? "Consumidor Final") : (cliente?.nombre ?? "—");
      const rnc     = f.esConsumidorFinal ? "" : (cliente?.rnc ?? "");
      const t       = calcTotales(f.items);
      return [f.eCF, f.tipoECF, f.fecha, `"${nombre}"`, rnc, t.sub.toFixed(2), t.itbis.toFixed(2), t.total.toFixed(2), f.terminos, f.estado].join(",");
    });
    const csv  = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totales = calcTotales(filtradas.flatMap((f) => f.items));

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>Reportes</h1>
        <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans }}>Exportación de datos para DGII y análisis interno</div>
      </div>

      {/* Filtros */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 14 }}>Filtros del período</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 5, fontFamily: sans }}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 5, fontFamily: sans }}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 5, fontFamily: sans }}>Tipo e-CF</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}>
              <option value="">Todos</option>
              <option value="E31">E31</option>
              <option value="E32">E32</option>
              <option value="E33">E33</option>
              <option value="E34">E34</option>
            </select>
          </div>
          <button onClick={() => { setDesde(""); setHasta(""); setTipoFiltro(""); }}
            style={{ padding: "8px 14px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: sans, color: "#374151" }}>
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Comprobantes",  val: filtradas.length,            mono: false },
          { label: "Sub Total",     val: `RD$ ${fmt(totales.sub)}`,   mono: true  },
          { label: "ITBIS",         val: `RD$ ${fmt(totales.itbis)}`, mono: true  },
          { label: "Total General", val: `RD$ ${fmt(totales.total)}`, mono: true  },
        ].map(({ label, val, mono: isMono }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: isMono ? mono : sans, fontSize: 18, fontWeight: 700, color: "#111" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Exportar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>Reporte 607 DGII</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 16, lineHeight: 1.6 }}>
            Formato oficial DGII para declaración de ventas. Incluye RNC comprador, tipo e-CF, montos gravados e ITBIS.
          </div>
          <div style={{ background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 4, padding: "8px 12px", marginBottom: 16, fontSize: 11, color: "#0e7490", fontFamily: sans }}>
            {filtradas.length} registro(s) · Período: {desde || "inicio"} → {hasta || "hoy"}
          </div>
          <button onClick={exportar607} disabled={filtradas.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: filtradas.length === 0 ? "#d1d5db" : "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: filtradas.length === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
            <Icon name="download" size={14} /> Exportar 607 (.txt)
          </button>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>Resumen de Facturas</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 16, lineHeight: 1.6 }}>
            Exportación general de facturas en formato CSV para análisis en Excel u otras herramientas.
          </div>
          <div style={{ background: "#f0faf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "8px 12px", marginBottom: 16, fontSize: 11, color: "#166534", fontFamily: sans }}>
            {filtradas.length} factura(s) incluida(s) · Excluye anuladas
          </div>
          <button onClick={exportarCSV} disabled={filtradas.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: filtradas.length === 0 ? "#d1d5db" : "#166534", color: "#fff", border: "none", borderRadius: 4, cursor: filtradas.length === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
            <Icon name="download" size={14} /> Exportar CSV (.csv)
          </button>
        </div>
      </div>

      {/* Tabla preview */}
      {!loading && filtradas.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans }}>
            Vista previa — {filtradas.length} comprobante(s)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["e-CF", "Tipo", "Fecha", "Cliente", "Sub Total", "ITBIS", "Total", "Pago"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: sans, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 50).map((f) => {
                  const cliente = clientes.find((c) => c.id === f.clienteId);
                  const nombre  = f.esConsumidorFinal ? (f.nombreConsumidor ?? "Cons. Final") : (cliente?.nombre ?? "—");
                  const t       = calcTotales(f.items);
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "9px 14px", fontFamily: mono, fontWeight: 700, color: "#111" }}>{f.eCF}</td>
                      <td style={{ padding: "9px 14px", fontFamily: mono, fontSize: 11, color: "#374151" }}>{f.tipoECF}</td>
                      <td style={{ padding: "9px 14px", color: "#6b7280", whiteSpace: "nowrap" }}>{fmtDate(f.fecha)}</td>
                      <td style={{ padding: "9px 14px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</td>
                      <td style={{ padding: "9px 14px", fontFamily: mono }}>RD$ {fmt(t.sub)}</td>
                      <td style={{ padding: "9px 14px", fontFamily: mono, color: "#1d4ed8" }}>RD$ {fmt(t.itbis)}</td>
                      <td style={{ padding: "9px 14px", fontFamily: mono, fontWeight: 700 }}>RD$ {fmt(t.total)}</td>
                      <td style={{ padding: "9px 14px", color: "#374151" }}>{f.terminos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtradas.length > 50 && (
              <div style={{ padding: "10px 14px", fontSize: 11, color: "#9ca3af", fontFamily: sans, textAlign: "center", background: "#f9fafb" }}>
                Mostrando 50 de {filtradas.length} registros — exporta para ver todos
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}