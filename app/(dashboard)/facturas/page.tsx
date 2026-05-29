"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal }          from "react-dom";
import { doc, getDoc }           from "firebase/firestore";
import { db }                    from "@/lib/firebase";
import { useFacturas }           from "@/hooks/usefacturas";
import { useClientes }           from "@/hooks/useclientes";
import { useServicios }          from "@/hooks/useservicios";
import { useConfirm }            from "@/hooks/useconfirm";
import { useToast }              from "@/hooks/usetoast";
import { useCuentasPorCobrar }   from "@/hooks/usecuentasporcobrar";
import PrintModal                from "@/components/print/PrintModal";
import ModalNuevaFactura         from "@/components/modals/modalnuevafactura";
import ModalNota                 from "@/components/modals/modalnota";
import type { Factura }          from "@/types";
import { fmt, fmtDate, today, localDate, calcTotales } from "@/types";
import Icon  from "@/components/ui/icon";
import Badge from "@/components/ui/badge";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

interface EmpresaConfig { nombre: string; rnc: string; direccion: string; telefono: string; }

// ── Badge estado DGII ─────────────────────────────────────────────
function DgiiBadge({ estado }: { estado?: string }) {
  if (!estado) return (
    <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "var(--font-sans)" }}>No enviado</span>
  );
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    Enviado:             { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "Enviado" },
    Aceptado:            { bg: "#f0faf4", color: "#166534", border: "#bbf7d0", label: "Aceptado" },
    AceptadoCondicional: { bg: "#fffbeb", color: "#92400e", border: "#fde68a", label: "Aceptado Cond." },
    Rechazado:           { bg: "#fef2f2", color: "#991b1b", border: "#fecaca", label: "Rechazado" },
    Anulada:             { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb", label: "Anulada" },
  };
  const s = map[estado] ?? map.Enviado;
  return (
    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: sans, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ── Menu de acciones ──────────────────────────────────────────────
function MenuAcciones({ factura, onVer, onNota, onEstado, onEnviarDGII, onConsultarDGII, onRegenerarQR }: {
  factura:         Factura;
  onVer:           () => void;
  onNota:          (tipo: "E33" | "E34") => void;
  onEstado:        (estado: import("@/types").EstadoFactura) => void;
  onEnviarDGII:    () => void;
  onConsultarDGII: () => void;
  onRegenerarQR:   () => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [pos,     setPos]     = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(v => !v);
  };

  const anulada        = factura.estado === "anulada";
  const yaEnviada      = !!factura.estadoDGII && factura.estadoDGII !== "pendiente";
  const puedeConsultar = !!factura.trackIdDGII;
  // URL vieja si FechaFirma tiene guiones (dd-MM-yyyy) en vez de ddMMyyyy
  const urlVieja = !!factura.urlQR && /[?&]FechaFirma=\d{2}-\d{2}-\d{4}/.test(factura.urlQR);

  const item = (label: string, color: string, onClick: () => void, disabled = false) => (
    <button key={label} type="button" onClick={() => { if (!disabled) { onClick(); setOpen(false); } }} disabled={disabled}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontFamily: sans, color: disabled ? "#d1d5db" : color }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "#f9fafb"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
      {label}
    </button>
  );

  const dropdown = open && mounted ? createPortal(
    <div ref={dropRef} style={{ position: "fixed", top: pos.top, right: pos.right, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 99999, minWidth: 220, padding: "4px 0", overflow: "hidden" }}>
      {item("Ver / Imprimir", "#374151", onVer)}
      <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
      {/* Acciones DGII */}
      {!anulada && !yaEnviada && item("📤 Enviar a DGII", "#0e7490", onEnviarDGII)}
      {puedeConsultar && item("🔍 Consultar estado DGII", "#1d4ed8", onConsultarDGII)}
      {urlVieja && item("🔄 Regenerar QR (formato DGII)", "#7c3aed", onRegenerarQR)}
      <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
      {item("📋 Nota de Débito (E33)",  "#374151", () => onNota("E33"), anulada)}
      {item("📋 Nota de Crédito (E34)", "#374151", () => onNota("E34"), anulada)}
      <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
      {factura.estado !== "pagada"    && item("✓ Marcar como Pagada",    "#166534", () => onEstado("pagada"),    anulada)}
      {factura.estado !== "pendiente" && item("◷ Marcar como Pendiente", "#1d4ed8", () => onEstado("pendiente"), anulada)}
      {!anulada && item("✕ Anular Factura", "#dc2626", () => onEstado("anulada"))}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        style={{ padding: "6px 12px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontFamily: sans, color: "#374151" }}>
        Acciones <Icon name="chevron-down" size={11} />
      </button>
      {dropdown}
    </>
  );
}

// ── Pagina principal ──────────────────────────────────────────────
export default function FacturasPage() {
  const { facturas, loading, agregar, cambiarEstado, actualizar } = useFacturas();
  const { clientes }    = useClientes();
  const { servicios }   = useServicios();
  const { agregar: agregarCuenta } = useCuentasPorCobrar();
  const { push, ToastContainer }   = useToast();
  const { confirm, ConfirmUI }     = useConfirm();

  const [showNueva,    setShowNueva]    = useState(false);
  const [showPrint,    setShowPrint]    = useState<Factura | null>(null);
  const [showNota,     setShowNota]     = useState<{ factura: Factura; tipo: "E33" | "E34" } | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [enviando,     setEnviando]     = useState<string | null>(null);
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [filtroDGII,   setFiltroDGII]   = useState("");
  const [empresa,      setEmpresa]      = useState<EmpresaConfig | null>(null);

  useEffect(() => {
    getDoc(doc(db, "config", "empresa")).then((snap) => {
      if (snap.exists()) setEmpresa(snap.data() as EmpresaConfig);
    });
  }, []);

  const filtradas = facturas.filter((f) => {
    const cliente = clientes.find((c) => c.id === f.clienteId);
    const nombre  = f.esConsumidorFinal ? (f.nombreConsumidor ?? "") : (cliente?.nombre ?? "");
    const q       = busqueda.toLowerCase();
    const matchQ  = !q || nombre.toLowerCase().includes(q) || f.eCF.toLowerCase().includes(q) || f.noFactura.includes(q);
    const matchE  = !filtroEstado || f.estado === filtroEstado;
    const matchT  = !filtroTipo   || f.tipoECF === filtroTipo;
    const matchDG = !filtroDGII   || (filtroDGII === "pendiente" ? !f.estadoDGII : f.estadoDGII === filtroDGII);
    return matchQ && matchE && matchT && matchDG;
  });

  const resumen = {
    total:      filtradas.filter((f) => f.estado !== "anulada").reduce((s, f) => s + calcTotales(f.items).total, 0),
    pagadas:    filtradas.filter((f) => f.estado === "pagada").length,
    pendientes: filtradas.filter((f) => f.estado === "pendiente").length,
    anuladas:   filtradas.filter((f) => f.estado === "anulada").length,
  };

  const enviarDGIIById = async (facturaId: string): Promise<void> => {
    const res  = await fetch("/api/dgii/emitir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ facturaId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error al enviar a DGII");
  };

  const handleGuardar = async (data: Omit<Factura, "id">) => {
    setSaving(true);
    try {
      const facturaId = await agregar(data);
      if (data.terminos !== "Contado" && data.clienteId !== "walk-in") {
        const diasPlazo = parseInt(data.terminos) || 30;
        const vencDate  = new Date(); vencDate.setDate(vencDate.getDate() + diasPlazo);
        await agregarCuenta({
          clienteId:        data.clienteId,
          numeroFactura:    data.eCF,
          fecha:            data.fecha,
          fechaVencimiento: data.fechaVencimientoPago ?? localDate(vencDate),
          monto:            calcTotales(data.items).total,
          pagado:           data.abonoInicialMonto ?? 0,
          devuelto:         0, creditos: 0, estado: "vigente",
          abonos: data.abonoInicialMonto && data.abonoInicialMonto > 0
            ? [{ id: facturaId, fecha: today(), monto: data.abonoInicialMonto, metodoPago: data.abonoInicialMetodo ?? "", nota: "Abono inicial" }]
            : [],
        });
      }
      await enviarDGIIById(facturaId);
      setShowNueva(false);
      push({ tipo: "success", mensaje: `${data.eCF} emitida y enviada a DGII` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      push({ tipo: "error", mensaje: msg });
    }
    finally { setSaving(false); }
  };

  const handleEstado = async (f: Factura, estado: import("@/types").EstadoFactura) => {
    if (estado === "anulada") {
      const ok = await confirm({ titulo: "Anular factura", mensaje: `Anular ${f.eCF}? Esta accion no puede deshacerse.`, btnOk: "Anular", peligro: true });
      if (!ok) return;
    }
    await cambiarEstado(f.id, estado);
    push({ tipo: estado === "anulada" ? "warning" : "success", mensaje: `Factura ${estado}` });
  };

  const handleNota = async (data: Omit<Factura, "id">) => {
    setSaving(true);
    try {
      const facturaId = await agregar(data);
      await enviarDGIIById(facturaId);
      setShowNota(null);
      push({ tipo: "success", mensaje: `${data.tipoECF} emitida y enviada a DGII` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      push({ tipo: "error", mensaje: msg });
    }
    finally { setSaving(false); }
  };

  // ── Enviar a DGII ─────────────────────────────────────────────
  const handleEnviarDGII = async (factura: Factura) => {
    const ok = await confirm({
      titulo:  "Enviar a DGII",
      mensaje: `Enviar ${factura.eCF} al sistema de facturacion electronica de la DGII? Esta accion firmara y transmitira el comprobante.`,
      btnOk:   "Si, enviar",
    });
    if (!ok) return;

    setEnviando(factura.id);
    try {
      const res = await fetch("/api/dgii/emitir", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ facturaId: factura.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al enviar a DGII");

      push({ tipo: "success", mensaje: `${factura.eCF} enviado a DGII — Estado: ${data.estadoDGII}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      push({ tipo: "error", mensaje: `Error DGII: ${msg}` });
    } finally {
      setEnviando(null);
    }
  };

  // ── Regenerar QR (facturas con URL en formato viejo) ─────────
  const handleRegenerarQR = async (factura: Factura) => {
    setEnviando(factura.id);
    try {
      const res = await fetch("/api/dgii/regenerar-qr", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ facturaId: factura.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al regenerar QR");
      push({ tipo: "success", mensaje: `QR de ${factura.eCF} regenerado con formato correcto` });
    } catch (err: unknown) {
      push({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error regenerando QR" });
    } finally {
      setEnviando(null);
    }
  };

  // ── Consultar estado DGII ─────────────────────────────────────
  const handleConsultarDGII = async (factura: Factura) => {
    setEnviando(factura.id);
    try {
      const res = await fetch("/api/dgii/consultar", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ facturaId: factura.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error consultando DGII");

      const tipo = data.estado === "Aceptado" ? "success" : data.estado === "Rechazado" ? "error" : "warning";
      push({ tipo, mensaje: `${factura.eCF} — Estado DGII: ${data.estado}` });

      if (data.mensajes?.length) {
        data.mensajes.forEach((m: string) => push({ tipo: "info", mensaje: m }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      push({ tipo: "error", mensaje: `Error consultando DGII: ${msg}` });
    } finally {
      setEnviando(null);
    }
  };

  const estadoBadge = (e: string) => {
    if (e === "pagada")    return <Badge tipo="success">Pagada</Badge>;
    if (e === "pendiente") return <Badge tipo="warning">Pendiente</Badge>;
    return <Badge tipo="danger">Anulada</Badge>;
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 2 }}>Facturas</h1>
          <div style={{ fontSize: 13, color: "#6b7280", fontFamily: sans }}>Comprobantes Fiscales Electronicos emitidos</div>
        </div>
        <button onClick={() => setShowNueva(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: sans }}>
          <Icon name="plus" size={14} /> Nueva Factura
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Ingresos (filtro)", v: `RD$ ${fmt(resumen.total)}`, c: "#0e7490" },
          { l: "Pagadas",           v: resumen.pagadas,              c: "#166534" },
          { l: "Pendientes",        v: resumen.pendientes,           c: "#92400e" },
          { l: "Anuladas",          v: resumen.anuladas,             c: "#6b7280" },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: `3px solid ${c}`, borderRadius: 4, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, marginBottom: 6 }}>{l}</div>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: "#111" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
            placeholder="Buscar por cliente, eCF o #..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pagada">Pagada</option>
          <option value="pendiente">Pendiente</option>
          <option value="anulada">Anulada</option>
        </select>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <optgroup label="Ventas / Servicios">
            <option value="E31">E31 — Crédito Fiscal</option>
            <option value="E32">E32 — Consumo</option>
            <option value="E33">E33 — Nota Débito</option>
            <option value="E34">E34 — Nota Crédito</option>
            <option value="E44">E44 — Regímenes Especiales</option>
            <option value="E45">E45 — Gubernamental</option>
            <option value="E46">E46 — Exportaciones</option>
          </optgroup>
          <optgroup label="Compras / Gastos">
            <option value="E41">E41 — Compras</option>
            <option value="E43">E43 — Gastos Menores</option>
            <option value="E47">E47 — Pagos al Exterior</option>
          </optgroup>
        </select>
        <select style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: sans, outline: "none" }}
          value={filtroDGII} onChange={(e) => setFiltroDGII(e.target.value)}>
          <option value="">Estado DGII (todos)</option>
          <option value="pendiente">No enviado</option>
          <option value="Enviado">Enviado</option>
          <option value="Aceptado">Aceptado</option>
          <option value="AceptadoCondicional">Aceptado Condicional</option>
          <option value="Rechazado">Rechazado</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontFamily: sans }}>Cargando facturas...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", fontFamily: sans }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 16, color: "#374151", fontWeight: 600, marginBottom: 6 }}>{facturas.length === 0 ? "No hay facturas aun" : "Sin resultados"}</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{facturas.length === 0 ? "Emite tu primera factura electronica" : "Ajusta los filtros"}</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["e-CF", "Fecha", "Cliente", "Total", "Pago", "DGII", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: sans, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) => {
                const cliente  = clientes.find((c) => c.id === f.clienteId);
                const nombre   = f.esConsumidorFinal ? (f.nombreConsumidor ?? "Consumidor Final") : (cliente?.nombre ?? "---");
                const t        = calcTotales(f.items);
                const anulada  = f.estado === "anulada";
                const cargando = enviando === f.id;

                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: anulada ? 0.5 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

                    {/* eCF */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#111" }}>{f.eCF}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: mono }}>#{f.noFactura}</div>
                    </td>

                    {/* Fecha */}
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "#374151", fontFamily: sans, whiteSpace: "nowrap" }}>
                      {fmtDate(f.fecha)}
                    </td>

                    {/* Cliente */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, color: "#111", fontFamily: sans }}>{nombre}</div>
                      {cliente?.rnc && <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: mono }}>{cliente.rnc}</div>}
                    </td>

                    {/* Total + estado */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: "#111", whiteSpace: "nowrap" }}>RD$ {fmt(t.total)}</div>
                      <div style={{ marginTop: 3 }}>{estadoBadge(f.estado)}</div>
                    </td>

                    {/* Pago */}
                    <td style={{ padding: "12px 14px" }}>
                      <Badge tipo={f.terminos === "Contado" ? "success" : "info"}>
                        {f.terminos === "Contado" ? (f.metodoPago ?? "Contado") : f.terminos}
                      </Badge>
                    </td>

                    {/* Estado DGII */}
                    <td style={{ padding: "12px 14px" }}>
                      {cargando ? (
                        <span style={{ fontSize: 11, color: "#0e7490", fontFamily: sans }}>Procesando...</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <DgiiBadge estado={f.estadoDGII} />
                          {/* Boton rapido enviar si no enviado */}
                          {!f.estadoDGII && !anulada && (
                            <button onClick={() => handleEnviarDGII(f)}
                              style={{ fontSize: 10, padding: "2px 8px", background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", borderRadius: 3, cursor: "pointer", fontFamily: sans, fontWeight: 600 }}>
                              Enviar →
                            </button>
                          )}
                          {/* Link QR si aceptado */}
                          {f.urlQR && f.estadoDGII === "Aceptado" && (
                            <a href={f.urlQR} target="_blank" rel="noreferrer"
                              style={{ fontSize: 10, color: "#166534", fontFamily: sans, textDecoration: "underline", textDecorationStyle: "dotted" }}>
                              Ver timbre ↗
                            </a>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: "12px 14px" }}>
                      <MenuAcciones
                        factura={f}
                        onVer={() => setShowPrint(f)}
                        onNota={(tipo) => setShowNota({ factura: f, tipo })}
                        onEstado={(estado) => handleEstado(f, estado)}
                        onEnviarDGII={() => handleEnviarDGII(f)}
                        onConsultarDGII={() => handleConsultarDGII(f)}
                        onRegenerarQR={() => handleRegenerarQR(f)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 14px", fontSize: 12, color: "#9ca3af", fontFamily: sans, borderTop: "1px solid #f3f4f6" }}>
            {filtradas.length} de {facturas.length} factura(s)
          </div>
        </div>
      )}

      {showNueva && (
        <ModalNuevaFactura clientes={clientes} servicios={servicios} facturas={facturas}
          onSave={handleGuardar} onClose={() => setShowNueva(false)} saving={saving} />
      )}
      {showPrint && (
        <PrintModal factura={showPrint} cliente={clientes.find((c) => c.id === showPrint.clienteId)}
          empresa={empresa ?? undefined} onClose={() => setShowPrint(null)} />
      )}
      {showNota && (
        <ModalNota tipo={showNota.tipo} facturaRef={showNota.factura}
          clientes={clientes} facturas={facturas}
          onSave={handleNota} onClose={() => setShowNota(null)} saving={saving} />
      )}
      {ToastContainer}
      {ConfirmUI}
    </div>
  );
}