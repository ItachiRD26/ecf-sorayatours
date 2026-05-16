"use client";

import { useState, useRef } from "react";
import { useFacturas } from "@/hooks/usefacturas";
import { useToast }    from "@/hooks/usetoast";
import { calcTotales } from "@/types";
import { LIMITE_RFCE } from "@/lib/dgii/xml-builder";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const ENCFS_RFCE = new Set(["E320000000011","E320000000013","E320000000014","E320000000015"]);

export default function CertificacionPage() {
  const { facturas, loading } = useFacturas();
  const { push, ToastContainer } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sembrando,     setSembrando]     = useState(false);
  const [enviandoTodo,  setEnviandoTodo]  = useState(false);
  const [enviando,      setEnviando]      = useState<string | null>(null);
  const [token,         setToken]         = useState("");
  const [tokenExpira,   setTokenExpira]   = useState("");
  const [descargando,   setDescargando]   = useState(false);
  const [subiendoFirma, setSubiendoFirma] = useState(false);

  const dePrueba = facturas
    .filter((f) => (f as any).esDePrueba === true)
    .sort((a, b) => a.eCF.localeCompare(b.eCF));

  const pendiente = (f: typeof dePrueba[0]) =>
    !f.estadoDGII || f.estadoDGII === "pendiente";

  // ── PASO 1: Descargar semilla ─────────────────────────────────
  const descargarSemilla = async () => {
    setDescargando(true);
    try {
      const res = await fetch("/api/dgii/cert/semilla-manual");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `semilla_${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      push({ tipo: "success", mensaje: "Semilla descargada. Ábrela en la App Firma Digital de DGII." });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error" });
    } finally { setDescargando(false); }
  };

  // ── PASO 2: Subir semilla firmada → obtener token ──────────────
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

  // ── Sembrar facturas ─────────────────────────────────────────
  const sembrar = async () => {
    setSembrando(true);
    try {
      const res  = await fetch("/api/dgii/cert/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      push({ tipo: "success", mensaje: data.mensaje });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error" });
    } finally { setSembrando(false); }
  };

  // ── Enviar UNA factura ────────────────────────────────────────
  const enviarUna = async (facturaId: string, eCF: string) => {
    setEnviando(facturaId);
    try {
      const res  = await fetch("/api/dgii/emitir", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ facturaId, token }),  // token del paso 3
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      push({ tipo: "success", mensaje: `${eCF} → ${data.estadoDGII}` });
    } catch (e: unknown) {
      push({ tipo: "error", mensaje: `${eCF}: ${e instanceof Error ? e.message : "Error"}` });
    } finally { setEnviando(null); }
  };

  // ── Enviar todas en orden DGII ────────────────────────────────
  const enviarTodas = async () => {
    if (!token) {
      push({ tipo: "warning", mensaje: "Necesitas obtener el token primero (Pasos 1 y 2)." });
      return;
    }
    setEnviandoTodo(true);
    const grupo1 = dePrueba.filter((f) =>
      ["E31","E32","E41","E43","E44","E45","E46","E47"].includes(f.tipoECF) &&
      !ENCFS_RFCE.has(f.eCF) && pendiente(f)
    );
    const grupo2 = dePrueba.filter((f) => ["E33","E34"].includes(f.tipoECF) && pendiente(f));
    const grupo3 = dePrueba.filter((f) => ENCFS_RFCE.has(f.eCF) && pendiente(f));

    for (const f of [...grupo1, ...grupo2, ...grupo3]) {
      await enviarUna(f.id, f.eCF);
      await new Promise((r) => setTimeout(r, 1200));
    }
    setEnviandoTodo(false);
    push({ tipo: "success", mensaje: "Envío completado. Revisa los estados." });
  };

  const aceptados  = dePrueba.filter((f) => f.estadoDGII === "Aceptado").length;
  const pendientes = dePrueba.filter(pendiente).length;

  const tokenValido = !!token;
  const tokenMinutos = tokenExpira
    ? Math.max(0, Math.round((new Date(tokenExpira).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="fade-in" style={{ maxWidth: 960 }}>
      <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
        Certificación DGII — Paso 2
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, marginBottom: 24 }}>
        Sigue los 4 pasos en orden para enviar los 25 comprobantes de prueba.
      </p>

      {/* ── PASOS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>

        {/* Paso A: Descargar semilla */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #0e7490", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0e7490", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
            Paso 1
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>
            Descargar semilla
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 12, lineHeight: 1.5 }}>
            Descarga el XML temporal de DGII que debes firmar con la App Firma Digital.
          </div>
          <button onClick={descargarSemilla} disabled={descargando}
            style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none", cursor:"pointer",
              background:"#0e7490", color:"#fff", fontSize:12, fontWeight:600, fontFamily:sans }}>
            {descargando ? "Descargando..." : "⬇ Descargar semilla.xml"}
          </button>
        </div>

        {/* Paso B: Firmar con App DGII */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #7c3aed", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
            Paso 2
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>
            Firmar con App DGII
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, lineHeight: 1.5 }}>
            Abre la App Firma Digital de DGII.<br/>
            1. Selecciona el <b>semilla.xml</b><br/>
            2. Selecciona tu <b>.p12</b><br/>
            3. Escribe la contraseña<br/>
            4. Descarga el XML firmado
          </div>
        </div>

        {/* Paso C: Subir semilla firmada */}
        <div style={{ background: "#fff", border: `1px solid ${tokenValido ? "#bbf7d0" : "#e5e7eb"}`, borderTop: `3px solid ${tokenValido ? "#166534" : "#f59e0b"}`, borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tokenValido ? "#166534" : "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
            Paso 3 {tokenValido && "✓"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>
            Subir semilla firmada
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 12, lineHeight: 1.5 }}>
            {tokenValido
              ? `Token activo — válido ~${tokenMinutos} min más.`
              : "Sube el XML que generó la App Firma Digital para obtener el token JWT."}
          </div>
          <input ref={fileRef} type="file" accept=".xml" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subirSemillaFirmada(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={subiendoFirma}
            style={{ width:"100%", padding:"8px 0", borderRadius:4, border:"none", cursor:"pointer",
              background: tokenValido ? "#166534" : "#f59e0b",
              color: "#fff", fontSize:12, fontWeight:600, fontFamily:sans }}>
            {subiendoFirma ? "Validando..." : tokenValido ? "✓ Token obtenido" : "⬆ Subir semilla firmada"}
          </button>
        </div>

        {/* Paso D: Sembrar + Enviar */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: "3px solid #374151", borderRadius: 6, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: sans }}>
            Paso 4
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, fontFamily: sans }}>
            Sembrar y Enviar
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, marginBottom: 10, lineHeight: 1.5 }}>
            Crea las facturas en Firestore y envíalas a DGII en el orden correcto.
          </div>
          <button onClick={sembrar} disabled={sembrando}
            style={{ width:"100%", padding:"7px 0", borderRadius:4, border:"1px solid #d1d5db", cursor:"pointer",
              background:"#fff", color:"#374151", fontSize:11, fontFamily:sans, marginBottom:6 }}>
            {sembrando ? "Creando..." : "① Crear facturas"}
          </button>
          <button onClick={enviarTodas} disabled={enviandoTodo || !tokenValido || dePrueba.length === 0}
            style={{ width:"100%", padding:"7px 0", borderRadius:4, border:"none", cursor: (!tokenValido || dePrueba.length === 0) ? "not-allowed" : "pointer",
              background: tokenValido && dePrueba.length > 0 ? "#0e7490" : "#f3f4f6",
              color: tokenValido && dePrueba.length > 0 ? "#fff" : "#9ca3af",
              fontSize:11, fontFamily:sans, fontWeight:600 }}>
            {enviandoTodo ? "Enviando..." : "② Enviar en orden"}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      {dePrueba.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { l: "Facturas en Firestore", v: dePrueba.length, c: "#374151" },
            { l: "Pendientes de envío",   v: pendientes,       c: "#92400e" },
            { l: "Aceptados por DGII",    v: `${aceptados}/25`, c: aceptados===25?"#166534":"#6b7280" },
          ].map(({ l,v,c }) => (
            <div key={l} style={{ background:"#fff", border:"1px solid #e5e7eb", borderTop:`3px solid ${c}`, borderRadius:4, padding:"12px 16px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans, marginBottom:6 }}>{l}</div>
              <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:"#111" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Aviso RFCE ── */}
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:4, padding:"12px 16px", marginBottom:20, fontFamily:sans, fontSize:12, color:"#78350f" }}>
        <b>Orden que exige DGII:</b> Grupo 1 (E31, E32≥250k, E41, E43, E44, E45, E46, E47) →
        Grupo 2 (E33, E34) → Grupo 3 (RFCE por API) → Grupo 4 (E32 &lt;250k: subir al portal manualmente).
      </div>

      {/* ── Tabla ── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontFamily:sans }}>Cargando...</div>
      ) : dePrueba.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", background:"#fff", border:"1px solid #e5e7eb", borderRadius:6 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14, color:"#374151", fontWeight:600, fontFamily:sans }}>Haz clic en "① Crear facturas" en el Paso 4</div>
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#f9fafb", borderBottom:"2px solid #e5e7eb" }}>
                {["eCF","Tipo","Descripción","Total","Estado DGII",""].map((h) => (
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dePrueba.map((f) => {
                const t        = calcTotales(f.items);
                const esRFCE   = ENCFS_RFCE.has(f.eCF);
                const cargando = enviando === f.id;
                const yaOk     = f.estadoDGII === "Aceptado";
                const color: Record<string,string> = {
                  E31:"#0e7490",E32:"#7c3aed",E33:"#d97706",E34:"#dc2626",
                  E41:"#059669",E43:"#6b7280",E44:"#2563eb",E45:"#7c3aed",
                  E46:"#0891b2",E47:"#9333ea",
                };
                const c = color[f.tipoECF] ?? "#6b7280";
                const estadoStyle: Record<string,{bg:string;color:string;border:string;label:string}> = {
                  pendiente:           {bg:"#f9fafb",color:"#6b7280",border:"#e5e7eb",label:"Pendiente"},
                  Enviado:             {bg:"#eff6ff",color:"#1d4ed8",border:"#bfdbfe",label:"Enviado"},
                  Aceptado:            {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0",label:"Aceptado ✓"},
                  AceptadoCondicional: {bg:"#fffbeb",color:"#92400e",border:"#fde68a",label:"Aceptado Cond."},
                  Rechazado:           {bg:"#fef2f2",color:"#991b1b",border:"#fecaca",label:"Rechazado"},
                };
                const s = estadoStyle[f.estadoDGII ?? "pendiente"] ?? estadoStyle.pendiente;

                return (
                  <tr key={f.id} style={{ borderBottom:"1px solid #f3f4f6" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background="#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background="")}>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>
                        {esRFCE && <span style={{ color:"#7c3aed" }}>● </span>}{f.eCF}
                      </div>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:700, fontFamily:mono, background:`${c}15`, color:c, border:`1px solid ${c}30` }}>{f.tipoECF}</span>
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#374151", fontFamily:sans }}>
                      {f.items[0]?.descripcion?.substring(0,35)}
                    </td>
                    <td style={{ padding:"10px 14px", fontFamily:mono, fontSize:12, fontWeight:700, color:"#111" }}>
                      {t.total.toLocaleString("es-DO",{minimumFractionDigits:2})}
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:600, fontFamily:sans, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
                        {cargando ? "Enviando..." : s.label}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <button onClick={() => enviarUna(f.id, f.eCF)}
                        disabled={cargando || enviandoTodo || yaOk || !tokenValido}
                        style={{ padding:"5px 12px", borderRadius:4, border:"none",
                          cursor: (cargando||enviandoTodo||yaOk||!tokenValido)?"not-allowed":"pointer",
                          fontSize:11, fontFamily:sans, fontWeight:500,
                          background: yaOk?"#f3f4f6":tokenValido?"#0e7490":"#f3f4f6",
                          color: yaOk?"#9ca3af":tokenValido?"#fff":"#9ca3af" }}>
                        {yaOk ? "OK" : "Enviar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding:"10px 14px", fontSize:12, color:"#9ca3af", fontFamily:sans, borderTop:"1px solid #f3f4f6" }}>
            ● Morado = RFCE (enviar como resumen primero, luego subir íntegra al portal)
          </div>
        </div>
      )}

      {ToastContainer}
    </div>
  );
}