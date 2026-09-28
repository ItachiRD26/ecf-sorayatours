"use client";

import { useState, useEffect, useRef } from "react";
import { doc, getDoc }  from "firebase/firestore";
import { db }           from "@/lib/firebase";
import { useFacturas }  from "@/hooks/usefacturas";
import { useClientes }  from "@/hooks/useclientes";
import { calcTotales, fmt, fmtDate } from "@/types";
import type { Factura } from "@/types";
import FacturaA4      from "@/components/print/FacturaA4";
import FacturaTermica from "@/components/print/FacturaTermica";
import Icon from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

interface EmpresaConfig { nombre: string; rnc: string; direccion: string; telefono: string; firmaVendedor?: string; }

// La API de File System Access (guardar directo en una carpeta) solo existe
// en Chrome/Edge; TypeScript no la trae en sus libs por defecto.
interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
}
interface FileSystemDirectoryHandleLike {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

// E32 (Factura de Consumo) se imprime en ticket termico 88mm en este negocio
// (igual que en PrintModal); el resto usa A4.
const ANCHO_A4_PX      = 794; // ~210mm a 96dpi
const ANCHO_TERMICA_PX = 340; // FacturaTermica tiene maxWidth: 332px interno

export default function ReportesPage() {
  const { facturas, loading } = useFacturas();
  const { clientes }          = useClientes();
  const [desde, setDesde]     = useState("");
  const [hasta, setHasta]     = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);

  // Descarga masiva de PDFs a una carpeta local
  const [descargando, setDescargando]           = useState<{ actual: number; total: number } | null>(null);
  const [facturaRenderizando, setFacturaRenderizando] = useState<Factura | null>(null);
  const renderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setEmpresa(snap.data() as EmpresaConfig);
    });
  }, []);

  const filtradas = facturas.filter((f) => {
    if (f.estado === "anulada")  return false;
    if (desde && f.fecha < desde) return false;
    if (hasta && f.fecha > hasta) return false;
    if (tipoFiltro && f.tipoECF !== tipoFiltro) return false;
    return true;
  });

  const handleDescargarPDFs = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      alert("Tu navegador no soporta guardar directo en una carpeta (usa Chrome o Edge).");
      return;
    }
    const lista = filtradas;
    if (lista.length === 0) return;

    let dirHandle: FileSystemDirectoryHandleLike;
    try {
      dirHandle = await picker();
    } catch {
      return; // el usuario cerro el selector de carpeta
    }

    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"), import("html2canvas"),
    ]);

    setDescargando({ actual: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      setFacturaRenderizando(f);
      // esperar a que React pinte la factura fuera de pantalla antes de capturarla
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const el = renderRef.current;
      if (!el) continue;
      // x/y/scrollX/scrollY/windowWidth/windowHeight fijos: sin esto, html2canvas
      // ubica mal un elemento posicionado fuera de pantalla (position: fixed con
      // left negativo) y recorta el contenido que "cree" que quedo fuera del
      // viewport, cortando columnas de la tabla o el total.
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        x: 0, y: 0,
        scrollX: 0, scrollY: 0,
        windowWidth:  el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      const imgData = canvas.toDataURL("image/png");
      // ancho de pagina segun el formato real de impresion de este tipo de e-CF;
      // el alto se ajusta al contenido para no cortar facturas largas
      const pageWmm = f.tipoECF === "E32" ? 88 : 210;
      const pageHmm = (canvas.height * pageWmm) / canvas.width;
      const pdf = new jsPDF({ unit: "mm", format: [pageWmm, pageHmm] });
      pdf.addImage(imgData, "PNG", 0, 0, pageWmm, pageHmm);
      const blob = pdf.output("blob");

      const nombreArchivo = `${f.eCF}.pdf`;
      const fileHandle = await dirHandle.getFileHandle(nombreArchivo, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      setDescargando({ actual: i + 1, total: lista.length });
    }
    setFacturaRenderizando(null);
    setDescargando(null);
  };

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 20 }}>
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

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>PDFs de las Facturas</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 16, lineHeight: 1.6 }}>
            Genera un PDF por cada comprobante (formato A4) y lo guarda directo en una carpeta de tu PC. Solo Chrome / Edge.
          </div>
          <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 4, padding: "8px 12px", marginBottom: 16, fontSize: 11, color: "#6d28d9", fontFamily: sans }}>
            {descargando
              ? `Generando ${descargando.actual} de ${descargando.total}...`
              : `${filtradas.length} PDF(s) a generar según los filtros de arriba`}
          </div>
          <button onClick={handleDescargarPDFs} disabled={filtradas.length === 0 || !!descargando}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: (filtradas.length === 0 || descargando) ? "#d1d5db" : "#6d28d9", color: "#fff", border: "none", borderRadius: 4, cursor: (filtradas.length === 0 || descargando) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
            <Icon name="download" size={14} /> {descargando ? "Generando..." : "Guardar PDFs en carpeta"}
          </button>
        </div>
      </div>

      {/* Contenedor oculto: renderiza cada factura fuera de pantalla para capturarla como PDF.
          E32 (Consumo) se genera en formato ticket 88mm, igual que se imprime de verdad;
          el resto en A4 — mismo criterio que usa PrintModal. */}
      {facturaRenderizando && (() => {
        const esTermica = facturaRenderizando.tipoECF === "E32";
        const cliente   = clientes.find((c) => c.id === facturaRenderizando.clienteId);
        return (
          <div style={{ position: "fixed", left: -9999, top: 0, width: esTermica ? ANCHO_TERMICA_PX : ANCHO_A4_PX, zIndex: -1 }}>
            <div ref={renderRef} style={{ background: "#fff", padding: esTermica ? "16px 4px" : "24px 28px" }}>
              {esTermica ? (
                <FacturaTermica
                  factura={facturaRenderizando}
                  cliente={cliente}
                  empresa={empresa ? { nombre: empresa.nombre, rnc: empresa.rnc, direccion: empresa.direccion, telefono: empresa.telefono } : undefined}
                />
              ) : (
                <FacturaA4
                  factura={facturaRenderizando}
                  cliente={cliente}
                  empresa={empresa ?? undefined}
                />
              )}
            </div>
          </div>
        );
      })()}

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