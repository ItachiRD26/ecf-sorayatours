"use client";

import { useState, useEffect } from "react";
import { createPortal }         from "react-dom";
import { doc, getDoc }          from "firebase/firestore";
import { db }                   from "@/lib/firebase";
import { useCotizaciones }      from "@/hooks/usecotizaciones";
import { useClientes }          from "@/hooks/useclientes";
import { useServicios }         from "@/hooks/useservicios";
import { useFacturas }          from "@/hooks/usefacturas";
import { useCuentasPorCobrar }  from "@/hooks/usecuentasporcobrar";
import { useConfirm }           from "@/hooks/useconfirm";
import { useToast }             from "@/hooks/usetoast";
import ModalNuevaCotizacion     from "@/components/modals/modalnuevacotizacion";
import ModalConvertirCotizacion from "@/components/modals/modalconvertircotizacion";
import type { Cotizacion, Factura, LineaServicio } from "@/types";
import { fmt, fmtDate, today, localDate, calcLinea, calcTotales, labelModo } from "@/types";import Icon  from "@/components/ui/icon";
import Badge from "@/components/ui/badge";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

interface EmpresaConfig {
  nombre: string; rnc: string; direccion: string; telefono: string;
}

const DEFAULT_EMPRESA: EmpresaConfig = {
  nombre:    "SORAYA Y LEONARDO TOURS SRL",
  rnc:       "1-31217656-6",
  direccion: "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:  "809-961-6343",
};

// ── Vista imprimible de cotizacion ────────────────────────────────
function PrintCotizacion({
  cotizacion,
  cliente,
  empresa,
  onClose,
}: {
  cotizacion: Cotizacion;
  cliente:    import("@/types").Cliente | undefined;
  empresa:    EmpresaConfig;
  onClose:    () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const t = calcTotales(cotizacion.items);

  const handlePrint = () => {
    const contenido = document.getElementById("cot-print-content");
    if (!contenido) return;
    const win = window.open("", "_blank", "width=860,height=700");
    if (!win) { alert("Permite ventanas emergentes para imprimir"); return; }
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Cotizacion ${cotizacion.noCotizacion}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; }
  @page { size: A4; margin: 12mm 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${contenido.innerHTML}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  if (!mounted) return null;

  const content = (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000 }} />
      <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 9001, overflowY: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px 16px" }}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ background: "#fff", borderRadius: 6, width: "100%", maxWidth: 820, boxShadow: "0 24px 80px rgba(0,0,0,0.28)", overflow: "hidden" }}>

          {/* Controles */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", background: "#f9fafb" }}>
            <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: "#111" }}>
              Vista previa — {cotizacion.noCotizacion}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePrint}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans }}>
                <Icon name="print" size={14} /> Imprimir
              </button>
              <button onClick={onClose}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: sans }}>
                Cerrar
              </button>
            </div>
          </div>

          {/* Documento */}
          <div id="cot-print-content" style={{ padding: "32px 40px 40px", background: "#fff" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "2px solid #0e7490" }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111" }}>{empresa.nombre}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.9, fontFamily: sans }}>
                  <div>RNC: <strong>{empresa.rnc}</strong></div>
                  {empresa.direccion && <div>{empresa.direccion}</div>}
                  {empresa.telefono  && <div>Tel: {empresa.telefono}</div>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: "#0e7490", marginBottom: 8 }}>
                  Cotizacion
                </div>
                <div style={{ fontFamily: mono, fontSize: 11, color: "#444", lineHeight: 2 }}>
                  <div><strong>No.:</strong> {cotizacion.noCotizacion}</div>
                  <div><strong>Fecha:</strong> {fmtDate(cotizacion.fecha)}</div>
                  <div><strong>Valida hasta:</strong> {fmtDate(cotizacion.vencimiento)}</div>
                  <div><strong>Validez:</strong> {cotizacion.validez ?? "30 dias"}</div>
                </div>
              </div>
            </div>

            {/* Cliente */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: 14, marginBottom: 20, fontFamily: sans, fontSize: 12, lineHeight: 1.9 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Cotizado a
              </div>
              {cliente ? (
                <>
                  <div><strong>{cliente.nombre}</strong></div>
                  {cliente.rnc && <div>RNC: {cliente.rnc}</div>}
                  {cliente.direccion && <div>{cliente.direccion}{cliente.ciudad ? (", " + cliente.ciudad) : ""}</div>}
                  {cliente.telefono  && <div>Tel: {cliente.telefono}</div>}
                </>
              ) : (
                <div style={{ color: "#9ca3af" }}>Cliente no encontrado</div>
              )}
            </div>

            {/* Items */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontFamily: sans, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0e7490" }}>
                  {["Cod.", "Descripcion", "Modo", "Personas", "Precio base", "Desc. RD$", "ITBIS", "Total"].map((h, i) => (
                    <th key={h} style={{ padding: "9px 10px", color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: i <= 2 ? "left" : "right" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cotizacion.items.map((item: LineaServicio, i: number) => {
                  const c = calcLinea(item);
                  const precioLabel = item.modo === "por_grupo"
                    ? ("RD$ " + fmt(item.precio) + " (grupo)")
                    : ("RD$ " + fmt(item.precio) + "/p.");
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "9px 10px", fontFamily: mono, fontSize: 11, color: "#6b7280" }}>{item.codigo || "---"}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <div>{item.descripcion}</div>
                        {item.tramoLabel && <div style={{ fontSize: 10, color: "#9ca3af" }}>{item.tramoLabel}</div>}
                        {item.fechaTour  && <div style={{ fontSize: 10, color: "#6b7280" }}>{"Fecha: " + fmtDate(item.fechaTour)}</div>}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 11, color: "#6b7280" }}>{labelModo(item.modo)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: mono }}>{item.cant}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: mono, fontSize: 11 }}>{precioLabel}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: mono }}>
                        {c.descAmt > 0 ? <span style={{ color: "#dc2626" }}>{fmt(c.descAmt)}</span> : <span style={{ color: "#9ca3af" }}>---</span>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: mono, color: "#1d4ed8" }}>
                        {item.itbis > 0 ? fmt(c.itbisAmt) : "Exento"}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: mono, fontWeight: 600 }}>{fmt(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totales */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
              <div style={{ width: 300, fontSize: 12, fontFamily: sans }}>
                {[
                  { l: "Total Bruto",  v: fmt(t.bruto), c: "#374151" },
                  { l: "Descuentos",   v: fmt(t.desc),  c: "#dc2626" },
                  { l: "Sub Total",    v: fmt(t.sub),   c: "#374151" },
                  { l: "ITBIS",        v: fmt(t.itbis), c: "#1d4ed8" },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    <span style={{ color: "#555" }}>{l}:</span>
                    <span style={{ fontFamily: mono, fontWeight: 600, color: c }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", background: "#0e7490", borderRadius: 3, marginTop: 4 }}>
                  <span style={{ fontWeight: 700, color: "#fff" }}>TOTAL RD$:</span>
                  <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: "#fff" }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>

            {/* Notas */}
            {cotizacion.notas && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", marginBottom: 20, fontSize: 12, fontFamily: sans, color: "#92400e" }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notas / Condiciones</div>
                {cotizacion.notas}
              </div>
            )}

            {/* Firma — solo el emisor */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 48, borderTop: "1px solid #d1d5db" }}>
              <div style={{ width: "42%", textAlign: "center" }}>
                <div style={{ height: 1, background: "#374151", marginBottom: 6 }} />
                <div style={{ fontSize: 11, color: "#555", fontFamily: sans }}>Preparado por</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Firma Autorizada</div>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px dashed #d1d5db", fontSize: 10, color: "#9ca3af", textAlign: "center", fontFamily: sans }}>
              Esta cotizacion es valida por {cotizacion.validez ?? "30 dias"} a partir de la fecha de emision.
              Los precios estan sujetos a disponibilidad.
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

// ── Pagina principal ──────────────────────────────────────────────
export default function CotizacionesPage() {
  const { cotizaciones, loading, agregar, actualizar, cambiarEstado } = useCotizaciones();
  const { clientes }    = useClientes();
  const { servicios }   = useServicios();
  const { facturas, agregar: agregarFactura } = useFacturas();
  const { agregar: agregarCuenta }           = useCuentasPorCobrar();
  const { confirm, ConfirmUI }               = useConfirm();
  const { push, ToastContainer }             = useToast();

  const [showNueva,    setShowNueva]    = useState(false);
  const [converting,   setConverting]   = useState<Cotizacion | null>(null);
  const [viewing,      setViewing]      = useState<Cotizacion | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroEstado, setFiltroEstado] = useState("vigente");
  const [empresa,      setEmpresa]      = useState<EmpresaConfig>(DEFAULT_EMPRESA);

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setEmpresa({ ...DEFAULT_EMPRESA, ...(snap.data() as Partial<EmpresaConfig>) });
    }).catch(() => {});
  }, []);

  const filtradas = cotizaciones.filter((c) => {
    const cliente   = clientes.find((cl) => cl.id === c.clienteId);
    const matchBusq = !busqueda || c.noCotizacion.toLowerCase().includes(busqueda.toLowerCase()) || (cliente?.nombre ?? "").toLowerCase().includes(busqueda.toLowerCase());
    const matchEst  = !filtroEstado || c.estado === filtroEstado;
    return matchBusq && matchEst;
  });

  const handleNueva = async (data: Omit<Cotizacion, "id">) => {
    setSaving(true);
    try { await agregar(data); setShowNueva(false); push({ tipo: "success", mensaje: "Cotizacion creada correctamente" }); }
    catch { push({ tipo: "error", mensaje: "Error al crear cotizacion" }); }
    finally { setSaving(false); }
  };

  const handleAnular = async (c: Cotizacion) => {
    const ok = await confirm({ titulo: "Anular cotizacion", mensaje: ("Anular " + c.noCotizacion + "?"), btnOk: "Anular", peligro: true });
    if (ok) { await cambiarEstado(c.id, "anulada"); push({ tipo: "warning", mensaje: "Cotizacion anulada" }); }
  };

  const handleConvertir = async (pago: {
    terminos: string; metodoPago?: string; referencia?: string; plazo?: string;
  }) => {
    if (!converting) return;
    setSaving(true);
    try {
      const { nextSecuencia } = await import("@/hooks/usesecuencias");
      const { genECF, resolverECFConfig } = await import("@/types");

      const cliente    = clientes.find((c) => c.id === converting.clienteId);
      const ecfConfig  = resolverECFConfig(cliente, false);
      const tipoECF    = ecfConfig.tipoDefault;
      const seq        = await nextSecuencia(tipoECF);
      const eCF        = genECF(tipoECF, seq);
      const fechaHoy   = today();
      const esContado  = pago.terminos === "Contado";

      const diasPlazo  = parseInt(pago.terminos) || 30;
      const vencDate   = new Date(); vencDate.setDate(vencDate.getDate() + diasPlazo);

      const data: Omit<Factura, "id"> = {
        noFactura:           String(seq),
        eCF,
        tipoECF,
        fecha:               fechaHoy,
        vencimientoECF:      "2027-12-31",
        terminos:            pago.terminos,
        clienteId:           converting.clienteId,
        cotizacionRef:       converting.noCotizacion,
        estado:              esContado ? "pagada" : "pendiente",
        metodoPago:          esContado ? pago.metodoPago : undefined,
        idTransaccion:       (esContado && pago.referencia) ? pago.referencia : undefined,
        modalidadPago:       esContado ? "unico" : "plazo",
        fechaVencimientoPago: esContado ? undefined : localDate(vencDate),
        esConsumidorFinal:   false,
        items:               converting.items,
        notas:               converting.notas,
      };

      await agregarFactura(data);
      await cambiarEstado(converting.id, "convertida");

      if (!esContado) {
        const t = calcTotales(converting.items);
        await agregarCuenta({
          clienteId:        converting.clienteId,
          numeroFactura:    eCF,
          fecha:            fechaHoy,
          fechaVencimiento: localDate(vencDate),
          monto:            t.total,
          pagado:           0,
          devuelto:         0, creditos: 0, estado: "vigente",
          abonos:           [],
        });
      }

      setConverting(null);
      push({ tipo: "success", mensaje: ("Cotizacion convertida a " + eCF) });
    } catch (err) {
      console.error(err);
      push({ tipo: "error", mensaje: "Error al convertir la cotizacion" });
    }
    finally { setSaving(false); }
  };

  const estadoBadge = (estado: string, vencida: boolean) => {
    if (vencida)               return <Badge tipo="danger">Vencida</Badge>;
    if (estado === "vigente")   return <Badge tipo="info">Vigente</Badge>;
    if (estado === "convertida") return <Badge tipo="success">Convertida</Badge>;
    return <Badge tipo="neutral">Anulada</Badge>;
  };

  const kpis = {
    vigentes:    cotizaciones.filter((c) => c.estado === "vigente").length,
    convertidas: cotizaciones.filter((c) => c.estado === "convertida").length,
    anuladas:    cotizaciones.filter((c) => c.estado === "anulada").length,
    totalVigor:  cotizaciones.filter((c) => c.estado === "vigente").reduce((s, c) => s + calcTotales(c.items).total, 0),
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>Cotizaciones</h1>
          <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans }}>{kpis.vigentes} vigentes</div>
        </div>
        <button onClick={() => setShowNueva(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
          <Icon name="plus" size={14} /> Nueva Cotizacion
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Vigentes",        v: kpis.vigentes,                    c: "#1d4ed8" },
          { l: "Monto en vigor",  v: ("RD$ " + fmt(kpis.totalVigor)), c: "#0e7490" },
          { l: "Convertidas",     v: kpis.convertidas,                 c: "#166534" },
          { l: "Anuladas",        v: kpis.anuladas,                    c: "#6b7280" },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: ("3px solid " + c), borderRadius: 4, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 6 }}>{l}</div>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "#111" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
            placeholder="Buscar por numero o cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="vigente">Vigentes</option>
          <option value="vencida">Vencidas</option>
          <option value="convertida">Convertidas</option>
          <option value="anulada">Anuladas</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontFamily: sans }}>Cargando cotizaciones...</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["No. Cotizacion", "Cliente", "Fecha", "Vence", "Total", "Estado", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const cliente = clientes.find((cl) => cl.id === c.clienteId);
                const t       = calcTotales(c.items);
                const vencida = c.estado === "vigente" && new Date(c.vencimiento + "T00:00:00") < new Date();
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <td style={{ padding: "12px 14px", fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#111" }}>{c.noCotizacion}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151", fontFamily: sans }}>{cliente?.nombre ?? "---"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "#6b7280", fontFamily: sans }}>{fmtDate(c.fecha)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, fontFamily: sans }}>
                      <span style={{ color: vencida ? "#991b1b" : "#374151", fontWeight: vencida ? 600 : 400 }}>
                        {vencida ? "Vencida " : ""}{fmtDate(c.vencimiento)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#111" }}>RD$ {fmt(t.total)}</td>
                    <td style={{ padding: "12px 14px" }}>{estadoBadge(c.estado, vencida)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        {/* Ver / Imprimir */}
                        <button onClick={() => setViewing(c)} title="Ver / Imprimir"
                          style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#374151", display: "flex" }}>
                          <Icon name="eye" size={13} />
                        </button>

                        {/* Convertir a factura */}
                        {c.estado === "vigente" && !vencida && (
                          <button onClick={() => setConverting(c)} title="Convertir a Factura"
                            style={{ background: "none", border: "1px solid #a5f3fc", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#0e7490", display: "flex" }}>
                            <Icon name="convert" size={13} />
                          </button>
                        )}

                        {/* Anular */}
                        {c.estado === "vigente" && (
                          <button onClick={() => handleAnular(c)} title="Anular"
                            style={{ background: "none", border: "1px solid #fecaca", borderRadius: 4, padding: "5px 7px", cursor: "pointer", color: "#dc2626", display: "flex" }}>
                            <Icon name="x" size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontFamily: sans, fontSize: 13 }}>
              {cotizaciones.length === 0 ? "No hay cotizaciones aun" : "Sin resultados"}
            </div>
          )}
          <div style={{ padding: "10px 14px", fontSize: 12, color: "#9ca3af", fontFamily: sans, borderTop: "1px solid #f3f4f6" }}>
            {filtradas.length} de {cotizaciones.length} cotizacion(es)
          </div>
        </div>
      )}

      {/* Modal Nueva Cotizacion */}
      {showNueva && (
        <ModalNuevaCotizacion clientes={clientes} servicios={servicios} cotizaciones={cotizaciones}
          onSave={handleNueva} onClose={() => setShowNueva(false)} saving={saving} />
      )}

      {/* Modal Convertir a Factura */}
      {converting && (
        <ModalConvertirCotizacion
          cotizacion={converting}
          cliente={clientes.find((c) => c.id === converting.clienteId)}
          onConfirmar={handleConvertir}
          onClose={() => setConverting(null)}
          saving={saving} />
      )}

      {/* Vista imprimible */}
      {viewing && (
        <PrintCotizacion cotizacion={viewing} cliente={clientes.find((c) => c.id === viewing.clienteId)} empresa={empresa} onClose={() => setViewing(null)} />
      )}

      {ToastContainer}
      {ConfirmUI}
    </div>
  );
}