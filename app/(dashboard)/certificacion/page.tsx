"use client";

import { useState, useRef } from "react";
import { useToast } from "@/hooks/usetoast";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

// Los 25 eNCFs en el orden exacto que exige DGII para la certificación
// Grupo 1 → Grupo 2 (notas) → Grupo 3 (RFCE) → Grupo 4 (E32 <250k portal)
const SET_ENCFS: { encf: string; tipo: string; desc: string; esRFCE?: boolean; esPortal?: boolean }[] = [
  // Grupo 1 — primero (base para notas)
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
  // Grupo 2 — notas de crédito/débito (dependen de los anteriores)
  { encf: "E330000000001", tipo: "E33", desc: "LECHE (Nota Débito)" },
  { encf: "E340000000001", tipo: "E34", desc: "TOP BOWL 1 (Nota Crédito)" },
  { encf: "E340000000016", tipo: "E34", desc: "Serv. Profesional Actualiz." },
  // Grupo 3 — RFCE por API (resumen <250k)
  { encf: "E320000000011", tipo: "E32", desc: "Cargador (RFCE)", esRFCE: true },
  { encf: "E320000000013", tipo: "E32", desc: "Nevera (RFCE)", esRFCE: true },
  { encf: "E320000000014", tipo: "E32", desc: "Artículos de belleza (RFCE)", esRFCE: true },
  { encf: "E320000000015", tipo: "E32", desc: "Celular (RFCE)", esRFCE: true },
];

type Estado = "pendiente" | "enviando" | "ok" | "error";

export default function CertificacionPage() {
  const { push, ToastContainer } = useToast();
  const fileRefSemilla = useRef<HTMLInputElement>(null);
  const fileRefExcel   = useRef<HTMLInputElement>(null);

  const [token,         setToken]         = useState("");
  const [tokenExpira,   setTokenExpira]   = useState("");
  const [descargando,   setDescargando]   = useState(false);
  const [subiendoFirma, setSubiendoFirma] = useState(false);
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [excelInfo,     setExcelInfo]     = useState<string | null>(null);
  const [enviandoTodo,  setEnviandoTodo]  = useState(false);
  const [estados,       setEstados]       = useState<Record<string, Estado>>({});
  const [trackIds,      setTrackIds]      = useState<Record<string, string>>({});

  const tokenValido  = !!token;
  const tokenMinutos = tokenExpira
    ? Math.max(0, Math.round((new Date(tokenExpira).getTime() - Date.now()) / 60000))
    : 0;

  const setEstado = (encf: string, e: Estado) =>
    setEstados(prev => ({ ...prev, [encf]: e }));
  const setTrack  = (encf: string, t: string) =>
    setTrackIds(prev => ({ ...prev, [encf]: t }));

  // ── Paso 1: Descargar semilla ────────────────────────────────────────────
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

  // ── Paso 3: Subir semilla firmada → token ────────────────────────────────
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
      push({ tipo: "success", mensaje: "✅ Token obtenido. Válido 1 hora. Ya puedes enviar los comprobantes." });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: `Error al validar semilla: ${e instanceof Error ? e.message : e}` });
    } finally { setSubiendoFirma(false); }
  };

  // ── Subir Excel de DGII ──────────────────────────────────────────────────
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

  // ── Enviar UN comprobante ────────────────────────────────────────────────
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
      // Extraer trackId del resultado (puede venir en data.trackId o data.resultado.trackId)
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

  // ── Esperar que DGII acepte un eNCF (consultar estado) ─────────────────
  const esperarAceptado = async (trackId: string, encf: string, maxSegundos = 60): Promise<boolean> => {
    const inicio = Date.now();
    while (Date.now() - inicio < maxSegundos * 1000) {
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
          push({ tipo: "error", mensaje: `${encf} RECHAZADO: ${(data.mensajes ?? []).join(", ")}` });
          return false;
        }
        push({ tipo: "warning", mensaje: `${encf} esperando… (${data.estado})` });
      } catch { /* continuar esperando */ }
    }
    push({ tipo: "warning", mensaje: `${encf}: tiempo de espera agotado, continuando…` });
    return false;
  };

  // ── Enviar todos en orden ────────────────────────────────────────────────
  const GRUPO2_GATE = "E320000000006"; // E33/E34 requieren este eNCF aceptado antes

  const enviarTodos = async () => {
    if (!tokenValido) {
      push({ tipo: "warning", mensaje: "Obtén el token primero (Pasos 1-3)." });
      return;
    }
    setEnviandoTodo(true);
    let ok = 0;

    // Separar grupos
    const grupo1 = SET_ENCFS.filter(e => !["E330000000001","E340000000001","E340000000016"].includes(e.encf) && !e.esRFCE);
    const grupo2 = SET_ENCFS.filter(e => ["E330000000001","E340000000001","E340000000016"].includes(e.encf));
    const grupo3 = SET_ENCFS.filter(e => e.esRFCE);

    // Enviar Grupo 1 — capturar trackId del gate (E320000000006)
    let trackGate = "";
    for (const { encf } of grupo1) {
      if (estados[encf] === "ok") { if (encf === GRUPO2_GATE && trackIds[encf]) trackGate = trackIds[encf]; continue; }
      const tId = await enviarUno(encf);
      if (tId !== null) { ok++; if (encf === GRUPO2_GATE) trackGate = tId; }
      await new Promise(r => setTimeout(r, 1200));
    }

    // Esperar que E320000000006 sea aceptado antes del Grupo 2
    if (grupo2.some(e => estados[e.encf] !== "ok")) {
      push({ tipo: "warning", mensaje: "Esperando aceptación de E320000000006 antes de enviar notas…" });
      const tId = trackGate || trackIds[GRUPO2_GATE];
      if (tId) {
        const aceptado = await esperarAceptado(tId, GRUPO2_GATE, 90);
        if (!aceptado) push({ tipo: "warning", mensaje: "E320000000006 no confirmado aún — enviando notas de todas formas" });
      } else {
        push({ tipo: "warning", mensaje: "Sin trackId para E320000000006 — esperando 30s" });
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    // Enviar Grupo 2 (E33/E34)
    for (const { encf } of grupo2) {
      if (estados[encf] === "ok") continue;
      const tId = await enviarUno(encf);
      if (tId !== null) ok++;
      await new Promise(r => setTimeout(r, 1200));
    }

    // Enviar Grupo 3 (RFCE)
    for (const { encf } of grupo3) {
      if (estados[encf] === "ok") continue;
      const tId = await enviarUno(encf);
      if (tId !== null) ok++;
      await new Promise(r => setTimeout(r, 1200));
    }

    setEnviandoTodo(false);
    push({ tipo: "success", mensaje: `Envío completado. ${ok} enviados.` });
  };

  // ── Descargar XML de un E32 <250k ────────────────────────────────────────
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
      push({ tipo: "success", mensaje: `${encf}.xml descargado — súbelo al portal certecf` });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: String(e) });
    }
  };

  const totalOk      = SET_ENCFS.filter(({ encf }) => estados[encf] === "ok").length;
  const totalPend    = SET_ENCFS.filter(({ encf }) => !estados[encf] || estados[encf] === "pendiente").length;
  const totalError   = SET_ENCFS.filter(({ encf }) => estados[encf] === "error").length;

  const colorTipo: Record<string,string> = {
    E31:"#0e7490",E32:"#7c3aed",E33:"#d97706",E34:"#dc2626",
    E41:"#059669",E43:"#6b7280",E44:"#2563eb",E45:"#7c3aed",
    E46:"#0891b2",E47:"#9333ea",
  };

  const estadoLabel: Record<Estado, { label: string; bg: string; color: string; border: string }> = {
    pendiente: { label: "Pendiente",   bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" },
    enviando:  { label: "Enviando…",   bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    ok:        { label: "Enviado ✓",   bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    error:     { label: "Error ✗",     bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  };

  return (
    <div className="fade-in" style={{ maxWidth: 960 }}>
      <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
        Certificación DGII — Paso 2
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 24 }}>
        Sigue los pasos en orden. El Excel de DGII debe estar cargado antes de enviar.
      </p>

      {/* ── PASOS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>

        {/* Paso 1 */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #0e7490", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0e7490", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>Paso 1</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>Descargar semilla</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 12, lineHeight: 1.5 }}>
            Descarga el XML temporal de DGII para firmarlo.
          </div>
          <button onClick={descargarSemilla} disabled={descargando}
            style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none", cursor:"pointer",
              background:"#0e7490", color:"#fff", fontSize:12, fontWeight:600, fontFamily:sans }}>
            {descargando ? "Descargando…" : "⬇ Descargar semilla.xml"}
          </button>
        </div>

        {/* Paso 2 */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #7c3aed", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>Paso 2</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>Firmar con App DGII</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, lineHeight: 1.6 }}>
            Abre la <b>App Firma Digital</b> de DGII.<br/>
            1. Selecciona el <b>semilla.xml</b><br/>
            2. Selecciona tu <b>.p12</b><br/>
            3. Escribe la contraseña<br/>
            4. Descarga el XML firmado
          </div>
        </div>

        {/* Paso 3 */}
        <div style={{ background: "#fff", border: `1px solid ${tokenValido ? "#bbf7d0" : "#e5e7eb"}`, borderTop: `3px solid ${tokenValido ? "#166534" : "#f59e0b"}`, borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tokenValido ? "#166534" : "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
            Paso 3 {tokenValido && "✓"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>Subir semilla firmada</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 12, lineHeight: 1.5 }}>
            {tokenValido ? `Token activo — válido ~${tokenMinutos} min más.` : "Sube el XML firmado por la App DGII para obtener el token JWT."}
          </div>
          <input ref={fileRefSemilla} type="file" accept=".xml" style={{ display:"none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) subirSemillaFirmada(f); }} />
          <button onClick={() => fileRefSemilla.current?.click()} disabled={subiendoFirma}
            style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none", cursor:"pointer",
              background: tokenValido ? "#166534" : "#f59e0b",
              color:"#fff", fontSize:12, fontWeight:600, fontFamily:sans }}>
            {subiendoFirma ? "Validando…" : tokenValido ? "✓ Token obtenido" : "⬆ Subir semilla firmada"}
          </button>
        </div>

        {/* Paso 4 */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #374151", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>Paso 4</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>Enviar comprobantes</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 10, lineHeight: 1.5 }}>
            Lee los datos exactos del Excel y envía los 25 en el orden correcto.
          </div>
          <button onClick={enviarTodos} disabled={enviandoTodo || !tokenValido}
            style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none",
              cursor: tokenValido ? "pointer" : "not-allowed",
              background: tokenValido ? "#0e7490" : "#f3f4f6",
              color: tokenValido ? "#fff" : "#9ca3af",
              fontSize:12, fontFamily:sans, fontWeight:600 }}>
            {enviandoTodo ? "Enviando…" : "▶ Enviar los 25"}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { l: "Enviados OK",      v: `${totalOk}/25`,    c: totalOk === 25 ? "#166534" : "#6b7280" },
          { l: "Pendientes",       v: totalPend,           c: "#92400e" },
          { l: "Con error",        v: totalError,          c: totalError > 0 ? "#991b1b" : "#6b7280" },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:"#fff", border:"1px solid #e5e7eb", borderTop:`3px solid ${c}`, borderRadius:4, padding:"12px 16px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans, marginBottom:6 }}>{l}</div>
            <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:"#111" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* ── Excel upload ── */}
      <div style={{ background:"#fff", border:"2px solid #7c3aed", borderRadius:6, padding:20, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <span style={{ fontSize:20 }}>📊</span>
          <div>
            <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#7c3aed" }}>Set de Pruebas DGII — Excel oficial</div>
            <div style={{ fontFamily:sans, fontSize:12, color:"#6b7280", marginTop:2 }}>
              Debe estar cargado antes de enviar. Portal certecf → Paso 2 → ⬇ DESCARGAR COMPROBANTES
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

      {/* ── Aviso orden DGII ── */}
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:4, padding:"10px 14px", marginBottom:20, fontFamily:sans, fontSize:12, color:"#78350f" }}>
        <b>Orden que exige DGII:</b> Grupo 1 (E31, E32≥250k, E41, E43, E44, E45, E46, E47) →
        Grupo 2 (E33, E34 — notas) → Grupo 3 (RFCE por API). Los 4 E32&lt;250k se suben al portal manualmente.
      </div>

      {/* ── Tabla de los 25 ── */}
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
              const est     = estados[encf] ?? "pendiente";
              const eStyle  = estadoLabel[est];
              const tColor  = colorTipo[tipo] ?? "#6b7280";
              const trackId = trackIds[encf];
              const enviandoEste = est === "enviando";

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
                      disabled={enviandoEste || enviandoTodo || est === "ok" || !tokenValido}
                      style={{ padding:"5px 12px", borderRadius:4, border:"none",
                        cursor: (enviandoEste||enviandoTodo||est==="ok"||!tokenValido) ? "not-allowed" : "pointer",
                        fontSize:11, fontFamily:sans, fontWeight:500,
                        background: est==="ok"?"#f3f4f6" : tokenValido?"#0e7490":"#f3f4f6",
                        color: est==="ok"?"#9ca3af" : tokenValido?"#fff":"#9ca3af" }}>
                      {enviandoEste ? "…" : est === "ok" ? "OK" : est === "error" ? "Reintentar" : "Enviar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:"10px 14px", fontSize:12, color:"#9ca3af", fontFamily:sans, borderTop:"1px solid #f3f4f6" }}>
          ● Morado = RFCE (se envía por API como resumen) | Los 4 E32&lt;250k: después de aprobados los RFCE, descargar el XML e ir al portal certecf a subirlos.
        </div>
      </div>

      {/* ── E32 <250k: descargar XMLs para portal ── */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:20 }}>
        <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#111", marginBottom:6 }}>
          📥 Facturas de Consumo &lt;250k — XMLs para subir al portal
        </div>
        <div style={{ fontFamily:sans, fontSize:12, color:"#6b7280", marginBottom:14 }}>
          Estos 4 se suben manualmente al portal certecf DESPUÉS de que los RFCE sean aprobados.
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

      {ToastContainer}
    </div>
  );
}