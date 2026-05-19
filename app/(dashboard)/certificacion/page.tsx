"use client";

import { useState, useRef } from "react";
import { useToast } from "@/hooks/usetoast";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

// ── TIPOS ───────────────────────────────────────────────────────────────────

const TIPOS_SIN_AC = new Set(["E32", "E41", "E43", "E46", "E47"]);

function tipoDeENCF(encf: string): string {
  const m = encf.match(/^([A-Z]\d{2})/);
  return m ? m[1] : "";
}

// ── SET PASO 2 ──────────────────────────────────────────────────────────────
const SET_ENCFS: { encf: string; tipo: string; desc: string; esRFCE?: boolean }[] = [
  { encf: "E310000000001", tipo: "E31", desc: "ASW DTU" },
  { encf: "E310000000002", tipo: "E31", desc: "PTE. CJ 24/12OZ" },
  { encf: "E310000000004", tipo: "E31", desc: "MESAS INDUSTRIALES" },
  { encf: "E310000000006", tipo: "E31", desc: "ARROZ LA GARZA" },
  { encf: "E320000000004", tipo: "E32", desc: "BLOCK (≥250k)" },
  { encf: "E320000000006", tipo: "E32", desc: "LAPICES (≥250k)" },
  { encf: "E410000000001", tipo: "E41", desc: "SERVICIO PUBLICIDAD" },
  { encf: "E410000000010", tipo: "E41", desc: "Servicio Profesional Legislativo" },
  { encf: "E430000000009", tipo: "E43", desc: "Arreglo neumáticos" },
  { encf: "E430000000010", tipo: "E43", desc: "Gasto comida (kiosko)" },
  { encf: "E440000000007", tipo: "E44", desc: "PTE. CJ 24/12OZ" },
  { encf: "E440000000011", tipo: "E44", desc: "Mero Basa" },
  { encf: "E450000000001", tipo: "E45", desc: "SERVICIO PUBLICIDAD" },
  { encf: "E450000000009", tipo: "E45", desc: "BLOCK" },
  { encf: "E460000000001", tipo: "E46", desc: "AGUACATE CRIOLLO" },
  { encf: "E460000000011", tipo: "E46", desc: "Gouda Import" },
  { encf: "E470000000008", tipo: "E47", desc: "Asesoría Legal P/H" },
  { encf: "E470000000009", tipo: "E47", desc: "Asesoría Legal P/H" },
  { encf: "E330000000001", tipo: "E33", desc: "LECHE (Nota Débito)" },
  { encf: "E340000000001", tipo: "E34", desc: "TOP BOWL 1 (Nota Crédito)" },
  { encf: "E340000000016", tipo: "E34", desc: "Serv. Profesional Actualiz." },
  { encf: "E320000000011", tipo: "E32", desc: "Cargador (RFCE)", esRFCE: true },
  { encf: "E320000000013", tipo: "E32", desc: "Nevera (RFCE)", esRFCE: true },
  { encf: "E320000000014", tipo: "E32", desc: "Artículos de belleza (RFCE)", esRFCE: true },
  { encf: "E320000000015", tipo: "E32", desc: "Celular (RFCE)", esRFCE: true },
];

// ── AC ITEM ─────────────────────────────────────────────────────────────────
interface ACItem {
  encf:           string;
  tipo:           string;
  rncEmisor:      string;
  rncComprador:   string;
  fechaEmision:   string;   // dd-MM-YYYY
  montoTotal:     number;
  estado:         1 | 2;    // 1=Aceptado, 2=Rechazado
  fechaHoraAC:    string;   // dd-MM-YYYY HH:mm:ss — del Excel DGII
  motivoRechazo?: string;
}

type EstadoEnvio = "pendiente" | "enviando" | "ok" | "error";

// ── COLORES ──────────────────────────────────────────────────────────────────
const colorTipo: Record<string, string> = {
  E31:"#0e7490", E32:"#7c3aed", E33:"#d97706", E34:"#dc2626",
  E41:"#059669", E43:"#6b7280", E44:"#2563eb", E45:"#7c3aed",
  E46:"#0891b2", E47:"#9333ea",
};

const estadoLabel: Record<EstadoEnvio, { label: string; bg: string; color: string; border: string }> = {
  pendiente: { label: "Pendiente",   bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" },
  enviando:  { label: "Enviando…",   bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  ok:        { label: "Enviado ✓",   bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  error:     { label: "Error ✗",     bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function CertificacionPage() {
  const { push, ToastContainer } = useToast();

  // ── Tabs
  const [tab, setTab] = useState<"paso2" | "paso3">("paso2");

  // ── Paso 2 state
  const fileRefSemilla = useRef<HTMLInputElement>(null);
  const fileRefExcel   = useRef<HTMLInputElement>(null);
  const [token,         setToken]         = useState("");
  const [tokenExpira,   setTokenExpira]   = useState("");
  const [descargando,   setDescargando]   = useState(false);
  const [subiendoFirma, setSubiendoFirma] = useState(false);
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [excelInfo,     setExcelInfo]     = useState<string | null>(null);
  const [enviandoTodo,  setEnviandoTodo]  = useState(false);
  const [estados,       setEstados]       = useState<Record<string, EstadoEnvio>>({});
  const [trackIds,      setTrackIds]      = useState<Record<string, string>>({});

  // ── Paso 3 state
  const fileRefAC      = useRef<HTMLInputElement>(null);
  const [acItems,      setAcItems]      = useState<ACItem[]>([]);
  const [acInfo,       setAcInfo]       = useState<string | null>(null);
  const [subiendoAC,   setSubiendoAC]   = useState(false);
  const [enviandoAC,   setEnviandoAC]   = useState(false);
  const [estadosAC,    setEstadosAC]    = useState<Record<string, EstadoEnvio>>({});
  const [mensajesAC,   setMensajesAC]   = useState<Record<string, string>>({});
  // Edición manual de estado/motivo de cada fila
  const [edits,        setEdits]        = useState<Record<string, { estado: 1|2; motivo: string }>>({});

  // ── Helpers token
  const tokenValido  = !!token;
  const tokenMinutos = tokenExpira
    ? Math.max(0, Math.round((new Date(tokenExpira).getTime() - Date.now()) / 60000))
    : 0;

  const setEstado    = (e: string, s: EstadoEnvio) => setEstados(prev => ({ ...prev, [e]: s }));
  const setTrack     = (e: string, t: string)       => setTrackIds(prev => ({ ...prev, [e]: t }));
  const setEstadoAC  = (e: string, s: EstadoEnvio) => setEstadosAC(prev => ({ ...prev, [e]: s }));
  const setMensajeAC = (e: string, m: string)       => setMensajesAC(prev => ({ ...prev, [e]: m }));

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 2 — Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const descargarSemilla = async () => {
    setDescargando(true);
    try {
      const res = await fetch("/api/dgii/cert/semilla-manual");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `semilla_${Date.now()}.xml`; a.click();
      URL.revokeObjectURL(url);
      push({ tipo: "success", mensaje: "Semilla descargada. Ábrela en la App Firma Digital de DGII." });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error" });
    } finally { setDescargando(false); }
  };

  const subirSemillaFirmada = async (file: File) => {
    setSubiendoFirma(true);
    try {
      const form = new FormData();
      form.append("semilla_firmada", file);
      const res  = await fetch("/api/dgii/cert/semilla-manual", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.token);
      setTokenExpira(data.expira);
      push({ tipo: "success", mensaje: "✅ Token obtenido. Válido 1 hora." });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: `Error al validar semilla: ${e instanceof Error ? e.message : e}` });
    } finally { setSubiendoFirma(false); }
  };

  const subirExcel = async (file: File) => {
    setSubiendoExcel(true);
    try {
      const form = new FormData();
      form.append("excel", file);
      const res  = await fetch("/api/dgii/cert/upload-set", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExcelInfo(`✅ ${file.name} — ${data.totalFilas} comprobantes cargados`);
      push({ tipo: "success", mensaje: data.mensaje });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: String(e) });
    } finally { setSubiendoExcel(false); }
  };

  const enviarUno = async (encf: string): Promise<string | null> => {
    setEstado(encf, "enviando");
    try {
      const res  = await fetch("/api/dgii/cert/enviar", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ encf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEstado(encf, "ok");
      const tId = data.trackId ?? data.resultado?.trackId ?? null;
      if (tId) setTrack(encf, tId);
      push({ tipo: "success", mensaje: `${encf} → ${data.estadoDGII || "Enviado"} ✓` });
      return tId;
    } catch (e: unknown) {
      setEstado(encf, "error");
      push({ tipo: "error", mensaje: `${encf}: ${e instanceof Error ? e.message : "Error"}` });
      return null;
    }
  };

  const esperarAceptado = async (trackId: string, encf: string, maxSeg = 60): Promise<boolean> => {
    const ini = Date.now();
    while (Date.now() - ini < maxSeg * 1000) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const res  = await fetch(`/api/dgii/cert/consultar-trackid?trackId=${trackId}`);
        const data = await res.json();
        const est  = (data.estado ?? "").toLowerCase();
        if (est.includes("aceptad")) {
          push({ tipo: "success", mensaje: `${encf} confirmado ✅ (${data.estado})` });
          return true;
        }
        if (est.includes("rechazad")) {
          push({ tipo: "error", mensaje: `${encf} RECHAZADO` });
          return false;
        }
        push({ tipo: "warning", mensaje: `${encf} esperando… (${data.estado})` });
      } catch { /* continuar */ }
    }
    push({ tipo: "warning", mensaje: `${encf}: tiempo de espera agotado` });
    return false;
  };

  const GRUPO2_GATE = "E320000000006";

  const enviarTodos = async () => {
    if (!tokenValido) { push({ tipo: "warning", mensaje: "Obtén el token primero." }); return; }
    setEnviandoTodo(true);
    let ok = 0;
    const grupo1 = SET_ENCFS.filter(e => !["E330000000001","E340000000001","E340000000016"].includes(e.encf) && !e.esRFCE);
    const grupo2 = SET_ENCFS.filter(e => ["E330000000001","E340000000001","E340000000016"].includes(e.encf));
    const grupo3 = SET_ENCFS.filter(e => e.esRFCE);

    let trackGate = "";
    for (const { encf } of grupo1) {
      if (estados[encf] === "ok") { if (encf === GRUPO2_GATE && trackIds[encf]) trackGate = trackIds[encf]; continue; }
      const tId = await enviarUno(encf);
      if (tId !== null) { ok++; if (encf === GRUPO2_GATE) trackGate = tId; }
      await new Promise(r => setTimeout(r, 1200));
    }
    if (grupo2.some(e => estados[e.encf] !== "ok")) {
      push({ tipo: "warning", mensaje: "Esperando aceptación de E320000000006…" });
      const tId = trackGate || trackIds[GRUPO2_GATE];
      if (tId) await esperarAceptado(tId, GRUPO2_GATE, 90);
      else await new Promise(r => setTimeout(r, 30000));
    }
    for (const { encf } of grupo2) {
      if (estados[encf] === "ok") continue;
      const tId = await enviarUno(encf);
      if (tId !== null) ok++;
      await new Promise(r => setTimeout(r, 1200));
    }
    for (const { encf } of grupo3) {
      if (estados[encf] === "ok") continue;
      const tId = await enviarUno(encf);
      if (tId !== null) ok++;
      await new Promise(r => setTimeout(r, 1200));
    }
    setEnviandoTodo(false);
    push({ tipo: "success", mensaje: `Envío completado. ${ok} enviados.` });
  };

  const descargarXML = async (encf: string) => {
    try {
      const res = await fetch("/api/dgii/cert/descargar-xmls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eNCF: encf }),
      });
      if (!res.ok) { push({ tipo: "error", mensaje: "Error generando XML" }); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${encf}.xml`; a.click();
      URL.revokeObjectURL(url);
      push({ tipo: "success", mensaje: `${encf}.xml descargado` });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: String(e) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 3 — Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const subirACExcel = async (file: File) => {
    setSubiendoAC(true);
    try {
      const form = new FormData();
      form.append("excel", file);
      const res  = await fetch("/api/dgii/cert/upload-ac-set", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAcItems(data.items ?? []);
      setAcInfo(`✅ ${file.name} — ${data.totalFilas} aprobaciones cargadas`);
      push({ tipo: "success", mensaje: data.mensaje });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: String(e) });
    } finally { setSubiendoAC(false); }
  };

  const enviarACUno = async (item: ACItem): Promise<boolean> => {
    const { encf } = item;
    const edit     = edits[encf];
    const estado   = edit?.estado ?? item.estado;
    const motivo   = edit?.motivo || item.motivoRechazo;

    setEstadoAC(encf, "enviando");
    try {
      const res  = await fetch("/api/dgii/cert/acecf", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          encf,
          rncComprador: item.rncComprador,
          fechaEmision: item.fechaEmision,
          montoTotal:   item.montoTotal,
          fechaHoraAC:  item.fechaHoraAC,   // viene del Excel DGII
          estado,
          ...(estado === 2 && motivo ? { motivoRechazo: motivo } : {}),
          token,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEstadoAC(encf, "ok");
      setMensajeAC(encf, data.mensaje ?? "OK");
      push({ tipo: "success", mensaje: `AC ${encf} → ${data.estado} ✓` });
      return true;
    } catch (e: unknown) {
      setEstadoAC(encf, "error");
      const msg = e instanceof Error ? e.message : String(e);
      setMensajeAC(encf, msg);
      push({ tipo: "error", mensaje: `AC ${encf}: ${msg}` });
      return false;
    }
  };

  const enviarTodosAC = async () => {
    if (!tokenValido) { push({ tipo: "warning", mensaje: "Necesitas el token activo (Paso 2 → Pasos 1-3)." }); return; }
    if (acItems.length === 0) { push({ tipo: "warning", mensaje: "Sube primero el Excel de aprobaciones." }); return; }
    setEnviandoAC(true);
    let ok = 0;
    for (const item of acItems) {
      if (estadosAC[item.encf] === "ok") continue;
      const r = await enviarACUno(item);
      if (r) ok++;
      await new Promise(r => setTimeout(r, 800));
    }
    setEnviandoAC(false);
    push({ tipo: "success", mensaje: `Aprobaciones enviadas: ${ok}/${acItems.length}` });
  };

  const editarAC = (encf: string, field: "estado" | "motivo", val: string | number) => {
    setEdits(prev => ({
      ...prev,
      [encf]: {
        estado: field === "estado" ? (Number(val) as 1 | 2) : (prev[encf]?.estado ?? 1),
        motivo: field === "motivo" ? String(val) : (prev[encf]?.motivo ?? ""),
      },
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────
  const totalOk    = SET_ENCFS.filter(({ encf }) => estados[encf] === "ok").length;
  const totalPend  = SET_ENCFS.filter(({ encf }) => !estados[encf] || estados[encf] === "pendiente").length;
  const totalErr   = SET_ENCFS.filter(({ encf }) => estados[encf] === "error").length;

  const acOk   = acItems.filter(({ encf }) => estadosAC[encf] === "ok").length;
  const acPend = acItems.filter(({ encf }) => !estadosAC[encf] || estadosAC[encf] === "pendiente").length;
  const acErr  = acItems.filter(({ encf }) => estadosAC[encf] === "error").length;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ maxWidth: 980 }}>
      <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
        Certificación DGII
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 20 }}>
        Proceso de certificación para emisor electrónico — 15 pasos totales.
      </p>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
        {[
          { id: "paso2", label: "Paso 2 — Set de Comprobantes",       color: "#0e7490" },
          { id: "paso3", label: "Paso 3 — Aprobaciones Comerciales",  color: "#7c3aed" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as "paso2" | "paso3")}
            style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, fontFamily: sans,
              border: "none", cursor: "pointer", borderRadius: "4px 4px 0 0",
              background: tab === t.id ? "#fff" : "transparent",
              color:      tab === t.id ? t.color : "#6b7280",
              borderBottom: tab === t.id ? `2px solid ${t.color}` : "2px solid transparent",
              marginBottom: -2,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB PASO 2
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "paso2" && (
        <div>
          {/* ── 4 pasos ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>

            {/* Paso 1 */}
            <StepCard n="1" color="#0e7490" title="Descargar semilla" desc="Descarga el XML temporal de DGII para firmarlo.">
              <StepBtn onClick={descargarSemilla} disabled={descargando} color="#0e7490">
                {descargando ? "Descargando…" : "⬇ Descargar semilla.xml"}
              </StepBtn>
            </StepCard>

            {/* Paso 2 */}
            <StepCard n="2" color="#7c3aed" title="Firmar con App DGII" desc="">
              <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, lineHeight: 1.6 }}>
                Abre la <b>App Firma Digital</b> de DGII.<br/>
                1. Selecciona el <b>semilla.xml</b><br/>
                2. Selecciona tu <b>.p12</b><br/>
                3. Escribe la contraseña<br/>
                4. Descarga el XML firmado
              </div>
            </StepCard>

            {/* Paso 3 */}
            <StepCard
              n="3" title="Subir semilla firmada"
              color={tokenValido ? "#166534" : "#f59e0b"}
              done={tokenValido}
              desc={tokenValido ? `Token activo — válido ~${tokenMinutos} min más.` : "Sube el XML firmado para obtener el token JWT."}
            >
              <input ref={fileRefSemilla} type="file" accept=".xml" style={{ display:"none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirSemillaFirmada(f); }} />
              <StepBtn onClick={() => fileRefSemilla.current?.click()} disabled={subiendoFirma}
                color={tokenValido ? "#166534" : "#f59e0b"}>
                {subiendoFirma ? "Validando…" : tokenValido ? "✓ Token obtenido" : "⬆ Subir semilla firmada"}
              </StepBtn>
            </StepCard>

            {/* Paso 4 */}
            <StepCard n="4" color="#374151" title="Enviar comprobantes"
              desc="Lee el Excel de DGII y envía los 25 en el orden correcto.">
              <StepBtn onClick={enviarTodos} disabled={enviandoTodo || !tokenValido}
                color={tokenValido ? "#0e7490" : undefined}>
                {enviandoTodo ? "Enviando…" : "▶ Enviar los 25"}
              </StepBtn>
            </StepCard>
          </div>

          {/* ── KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { l: "Enviados OK",  v: `${totalOk}/25`, c: totalOk === 25 ? "#166534" : "#6b7280" },
              { l: "Pendientes",   v: totalPend,        c: "#92400e" },
              { l: "Con error",    v: totalErr,         c: totalErr > 0 ? "#991b1b" : "#6b7280" },
            ].map(({ l, v, c }) => (
              <KpiCard key={l} label={l} value={String(v)} color={c} />
            ))}
          </div>

          {/* ── Excel upload ── */}
          <div style={{ background:"#fff", border:"2px solid #7c3aed", borderRadius:6, padding:20, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <span style={{ fontSize:20 }}>📊</span>
              <div>
                <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#7c3aed" }}>Set de Pruebas DGII — Excel oficial</div>
                <div style={{ fontFamily:sans, fontSize:12, color:"#6b7280", marginTop:2 }}>
                  Portal certecf → Paso 2 → ⬇ DESCARGAR COMPROBANTES
                </div>
              </div>
            </div>
            {excelInfo && (
              <div style={{ background:"#f3f0ff", borderRadius:4, padding:"8px 12px", marginBottom:12, fontFamily:sans, fontSize:12, color:"#5b21b6" }}>
                {excelInfo}
              </div>
            )}
            <input ref={fileRefExcel} type="file" accept=".xlsx,.xls" style={{ display:"none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) subirExcel(f); }} />
            <button onClick={() => fileRefExcel.current?.click()} disabled={subiendoExcel}
              style={{ display:"inline-flex", alignItems:"center", gap:8, cursor:"pointer",
                background: subiendoExcel ? "#e5e7eb" : "#7c3aed", color:"#fff",
                padding:"8px 18px", borderRadius:4, fontSize:13, fontFamily:sans, fontWeight:600, border:"none" }}>
              {subiendoExcel ? "Procesando…" : "📂 Seleccionar Excel de DGII"}
            </button>
          </div>

          {/* ── Aviso orden ── */}
          <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:4, padding:"10px 14px", marginBottom:20, fontFamily:sans, fontSize:12, color:"#78350f" }}>
            <b>Orden DGII:</b> Grupo 1 (E31, E32≥250k, E41, E43, E44, E45, E46, E47) →
            Grupo 2 (E33, E34) → Grupo 3 (RFCE). Los 4 E32&lt;250k se suben al portal manualmente.
          </div>

          {/* ── Tabla comprobantes ── */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9fafb", borderBottom:"2px solid #e5e7eb" }}>
                  {["eNCF","Tipo","Descripción","Estado","trackId",""].map(h => (
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SET_ENCFS.map(({ encf, tipo, desc, esRFCE }) => {
                  const est    = estados[encf] ?? "pendiente";
                  const eStyle = estadoLabel[est];
                  const tColor = colorTipo[tipo] ?? "#6b7280";
                  const trackId = trackIds[encf];
                  return (
                    <tr key={encf} style={{ borderBottom:"1px solid #f3f4f6" }}
                      onMouseEnter={e => (e.currentTarget.style.background="#f9fafb")}
                      onMouseLeave={e => (e.currentTarget.style.background="")}>
                      <td style={{ padding:"9px 14px" }}>
                        <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>
                          {esRFCE && <span style={{ color:"#7c3aed" }}>● </span>}{encf}
                        </div>
                      </td>
                      <td style={{ padding:"9px 14px" }}>
                        <span style={{ fontSize:10, padding:"2px 7px", borderRadius:3, fontWeight:700, fontFamily:mono, background:`${tColor}15`, color:tColor, border:`1px solid ${tColor}30` }}>{tipo}</span>
                      </td>
                      <td style={{ padding:"9px 14px", fontSize:12, color:"#374151", fontFamily:sans }}>{desc}</td>
                      <td style={{ padding:"9px 14px" }}>
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:600, fontFamily:sans, background:eStyle.bg, color:eStyle.color, border:`1px solid ${eStyle.border}` }}>
                          {eStyle.label}
                        </span>
                      </td>
                      <td style={{ padding:"9px 14px", fontFamily:mono, fontSize:10, color:"#6b7280", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {trackId ?? "—"}
                      </td>
                      <td style={{ padding:"9px 14px" }}>
                        <button onClick={() => enviarUno(encf)}
                          disabled={est === "enviando" || enviandoTodo || est === "ok" || !tokenValido}
                          style={{ padding:"5px 12px", borderRadius:4, border:"none",
                            cursor: (est==="enviando"||enviandoTodo||est==="ok"||!tokenValido) ? "not-allowed" : "pointer",
                            fontSize:11, fontFamily:sans, fontWeight:500,
                            background: est==="ok" ? "#f3f4f6" : tokenValido ? "#0e7490" : "#f3f4f6",
                            color:      est==="ok" ? "#9ca3af" : tokenValido ? "#fff" : "#9ca3af" }}>
                          {est === "enviando" ? "…" : est === "ok" ? "OK" : est === "error" ? "Reintentar" : "Enviar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:"10px 14px", fontSize:12, color:"#9ca3af", fontFamily:sans, borderTop:"1px solid #f3f4f6" }}>
              ● Morado = RFCE (resumen) | Los 4 E32&lt;250k: descargar XML y subirlos al portal certecf.
            </div>
          </div>

          {/* ── E32 <250k descargar ── */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:20 }}>
            <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#111", marginBottom:6 }}>
              📥 Facturas de Consumo &lt;250k — XMLs para el portal
            </div>
            <div style={{ fontFamily:sans, fontSize:12, color:"#6b7280", marginBottom:14 }}>
              Descargar después de que los RFCE sean aprobados → subir al portal certecf.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
              {SET_ENCFS.filter(f => f.esRFCE).map(({ encf, desc }) => (
                <div key={encf} style={{ border:"1px solid #e5e7eb", borderRadius:4, padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                  <div>
                    <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#7c3aed" }}>{encf}</div>
                    <div style={{ fontFamily:sans, fontSize:12, color:"#374151", marginTop:2 }}>{desc.replace(" (RFCE)","")}</div>
                  </div>
                  <button onClick={() => descargarXML(encf)}
                    style={{ padding:"6px 14px", borderRadius:4, border:"none", cursor:"pointer",
                      background:"#7c3aed", color:"#fff", fontSize:11, fontFamily:sans, fontWeight:600, whiteSpace:"nowrap" }}>
                    ⬇ XML
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB PASO 3 — APROBACIONES COMERCIALES
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "paso3" && (
        <div>
          {/* ── Info banner ── */}
          <div style={{ background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:6, padding:"14px 18px", marginBottom:24, fontFamily:sans }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#5b21b6", marginBottom:6 }}>
              Paso 3 — Prueba de Datos: Aprobaciones / Rechazos Comerciales
            </div>
            <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.7 }}>
              1. Descarga el Excel de DGII desde el portal <b>certecf → Paso 3 → ⬇ DESCARGAR COMPROBANTES</b><br/>
              2. Súbelo aquí — el sistema parsea los eCFs que requieren AC (E31, E33, E34, E44, E45)<br/>
              3. Ajusta el estado (Aceptado / Rechazado) si lo requiere el Excel de DGII<br/>
              4. Envía todas las Aprobaciones Comerciales<br/>
              <span style={{ color:"#9ca3af" }}>Nota: E32, E41, E43, E46, E47 no requieren AC y serán ignorados.</span>
            </div>
          </div>

          {/* ── Token status ── */}
          <div style={{
            background: tokenValido ? "#f0fdf4" : "#fffbeb",
            border: `1px solid ${tokenValido ? "#bbf7d0" : "#fde68a"}`,
            borderRadius: 4, padding: "10px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 10, fontFamily: sans, fontSize: 13,
          }}>
            <span style={{ fontSize: 16 }}>{tokenValido ? "✅" : "⚠️"}</span>
            <span style={{ color: tokenValido ? "#166534" : "#92400e", fontWeight: 600 }}>
              {tokenValido
                ? `Token activo — válido ~${tokenMinutos} min más. Listo para enviar.`
                : "Token no disponible — ve al Paso 2 (Pasos 1-3) para obtenerlo."}
            </span>
          </div>

          {/* ── Upload Excel AC ── */}
          <div style={{ background:"#fff", border:`2px solid ${acItems.length > 0 ? "#bbf7d0" : "#7c3aed"}`, borderRadius:6, padding:20, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <span style={{ fontSize:20 }}>📋</span>
              <div>
                <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#7c3aed" }}>Excel de Aprobaciones Comerciales — DGII</div>
                <div style={{ fontFamily:sans, fontSize:12, color:"#6b7280", marginTop:2 }}>
                  Columnas esperadas: eNCF | RNCComprador | FechaEmision | MontoTotal (+ Estado opcional)
                </div>
              </div>
            </div>
            {acInfo && (
              <div style={{ background:"#f3f0ff", borderRadius:4, padding:"8px 12px", marginBottom:12, fontFamily:sans, fontSize:12, color:"#5b21b6" }}>
                {acInfo}
              </div>
            )}
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <input ref={fileRefAC} type="file" accept=".xlsx,.xls" style={{ display:"none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirACExcel(f); }} />
              <button onClick={() => fileRefAC.current?.click()} disabled={subiendoAC}
                style={{ display:"inline-flex", alignItems:"center", gap:8, cursor:"pointer",
                  background: subiendoAC ? "#e5e7eb" : "#7c3aed", color:"#fff",
                  padding:"8px 18px", borderRadius:4, fontSize:13, fontFamily:sans, fontWeight:600, border:"none" }}>
                {subiendoAC ? "Procesando…" : "📂 Seleccionar Excel AC"}
              </button>
              {acItems.length > 0 && (
                <button onClick={enviarTodosAC} disabled={enviandoAC || !tokenValido}
                  style={{ display:"inline-flex", alignItems:"center", gap:8, cursor: (!tokenValido||enviandoAC) ? "not-allowed" : "pointer",
                    background: (tokenValido && !enviandoAC) ? "#059669" : "#e5e7eb", color:"#fff",
                    padding:"8px 18px", borderRadius:4, fontSize:13, fontFamily:sans, fontWeight:600, border:"none" }}>
                  {enviandoAC ? "Enviando…" : `▶ Enviar todas (${acItems.length})`}
                </button>
              )}
            </div>
          </div>

          {/* ── KPIs AC ── */}
          {acItems.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
              {[
                { l: "Enviadas OK",  v: `${acOk}/${acItems.length}`, c: acOk === acItems.length && acOk > 0 ? "#166534" : "#6b7280" },
                { l: "Pendientes",   v: acPend,                       c: "#92400e" },
                { l: "Con error",    v: acErr,                        c: acErr > 0 ? "#991b1b" : "#6b7280" },
              ].map(({ l, v, c }) => (
                <KpiCard key={l} label={l} value={String(v)} color={c} />
              ))}
            </div>
          )}

          {/* ── Tabla AC ── */}
          {acItems.length === 0 ? (
            <div style={{ background:"#fff", border:"2px dashed #e5e7eb", borderRadius:6, padding:48, textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
              <div style={{ fontFamily:sans, fontSize:14, color:"#6b7280" }}>
                Sube el Excel de DGII para ver los eCFs que requieren Aprobación Comercial
              </div>
            </div>
          ) : (
            <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#f9fafb", borderBottom:"2px solid #e5e7eb" }}>
                    {["eNCF","Tipo","RNC Comprador","Fecha Emisión","Monto Total","Decisión","Estado",""].map(h => (
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {acItems.map(item => {
                    const { encf, tipo, rncComprador, fechaEmision, montoTotal } = item;
                    const esAplicable = !TIPOS_SIN_AC.has(tipoDeENCF(encf));
                    const est         = estadosAC[encf] ?? "pendiente";
                    const eStyle      = estadoLabel[est];
                    const tColor      = colorTipo[tipo] ?? "#6b7280";
                    const edit        = edits[encf];
                    const estadoSel   = edit?.estado ?? item.estado;
                    const msgAC       = mensajesAC[encf];

                    return (
                      <tr key={encf} style={{ borderBottom:"1px solid #f3f4f6", opacity: esAplicable ? 1 : 0.45 }}
                        onMouseEnter={e => esAplicable && (e.currentTarget.style.background="#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background="")}>
                        <td style={{ padding:"9px 12px" }}>
                          <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>{encf}</div>
                          {msgAC && <div style={{ fontSize:10, color: est === "ok" ? "#166534" : "#991b1b", marginTop:2, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={msgAC}>{msgAC}</div>}
                        </td>
                        <td style={{ padding:"9px 12px" }}>
                          <span style={{ fontSize:10, padding:"2px 7px", borderRadius:3, fontWeight:700, fontFamily:mono, background:`${tColor}15`, color:tColor, border:`1px solid ${tColor}30` }}>{tipo}</span>
                          {!esAplicable && <div style={{ fontSize:9, color:"#9ca3af", marginTop:2, fontFamily:sans }}>Sin AC</div>}
                        </td>
                        <td style={{ padding:"9px 12px", fontFamily:mono, fontSize:11, color:"#374151" }}>{rncComprador}</td>
                        <td style={{ padding:"9px 12px", fontFamily:mono, fontSize:11, color:"#374151" }}>{fechaEmision}</td>
                        <td style={{ padding:"9px 12px", fontFamily:mono, fontSize:12, color:"#111", fontWeight:600 }}>
                          {new Intl.NumberFormat("es-DO", { minimumFractionDigits:2 }).format(montoTotal)}
                        </td>
                        <td style={{ padding:"9px 12px" }}>
                          {esAplicable ? (
                            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                              <select
                                value={estadoSel}
                                onChange={e => editarAC(encf, "estado", e.target.value)}
                                disabled={est === "ok"}
                                style={{ fontSize:11, fontFamily:sans, padding:"3px 6px", borderRadius:3, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer" }}
                              >
                                <option value={1}>✅ Aceptado</option>
                                <option value={2}>❌ Rechazado</option>
                              </select>
                              {estadoSel === 2 && (
                                <input
                                  type="text"
                                  placeholder="Motivo de rechazo..."
                                  value={edit?.motivo ?? ""}
                                  onChange={e => editarAC(encf, "motivo", e.target.value)}
                                  disabled={est === "ok"}
                                  style={{ fontSize:11, fontFamily:sans, padding:"3px 6px", borderRadius:3, border:"1px solid #e5e7eb", width:140 }}
                                />
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize:10, color:"#9ca3af", fontFamily:sans }}>N/A</span>
                          )}
                        </td>
                        <td style={{ padding:"9px 12px" }}>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:600, fontFamily:sans, background:eStyle.bg, color:eStyle.color, border:`1px solid ${eStyle.border}` }}>
                            {eStyle.label}
                          </span>
                        </td>
                        <td style={{ padding:"9px 12px" }}>
                          {esAplicable && (
                            <button onClick={() => enviarACUno(item)}
                              disabled={est === "enviando" || enviandoAC || est === "ok" || !tokenValido}
                              style={{ padding:"5px 12px", borderRadius:4, border:"none",
                                cursor: (est==="enviando"||enviandoAC||est==="ok"||!tokenValido) ? "not-allowed" : "pointer",
                                fontSize:11, fontFamily:sans, fontWeight:500,
                                background: est==="ok" ? "#f3f4f6" : tokenValido ? "#7c3aed" : "#f3f4f6",
                                color:      est==="ok" ? "#9ca3af" : tokenValido ? "#fff" : "#9ca3af" }}>
                              {est === "enviando" ? "…" : est === "ok" ? "OK" : est === "error" ? "Reintentar" : "Enviar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding:"10px 14px", fontSize:11, color:"#9ca3af", fontFamily:sans, borderTop:"1px solid #f3f4f6" }}>
                Filas sin Aprobación Comercial (E32, E41, E43, E46, E47) aparecen atenuadas y se omiten al enviar.
              </div>
            </div>
          )}
        </div>
      )}

      {ToastContainer}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function StepCard({
  n, color, title, desc, done, children,
}: {
  n: string; color: string; title: string; desc: string;
  done?: boolean; children?: React.ReactNode;
}) {
  const sans  = "var(--font-sans)";
  const active = done !== undefined ? (done ? "#f0fdf4" : "#fff") : "#fff";
  const bdr    = done !== undefined ? (done ? "#bbf7d0" : "#e5e7eb") : "#e5e7eb";
  return (
    <div style={{ background:active, border:`1px solid ${bdr}`, borderTop:`3px solid ${color}`, borderRadius:6, padding:18 }}>
      <div style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8, fontFamily:sans }}>
        Paso {n} {done ? "✓" : ""}
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:"#111", marginBottom:6, fontFamily:sans }}>{title}</div>
      {desc && <div style={{ fontSize:12, color:"#6b7280", fontFamily:sans, marginBottom:12, lineHeight:1.5 }}>{desc}</div>}
      {children}
    </div>
  );
}

function StepBtn({
  onClick, disabled, color = "#0e7490", children,
}: {
  onClick: () => void; disabled?: boolean; color?: string; children: React.ReactNode;
}) {
  const sans = "var(--font-sans)";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "#e5e7eb" : color,
        color: disabled ? "#9ca3af" : "#fff",
        fontSize:12, fontWeight:600, fontFamily:sans }}>
      {children}
    </button>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  const sans = "var(--font-sans)";
  const mono = "var(--font-mono)";
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderTop:`3px solid ${color}`, borderRadius:4, padding:"12px 16px" }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans, marginBottom:6 }}>{label}</div>
      <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:"#111" }}>{value}</div>
    </div>
  );
}