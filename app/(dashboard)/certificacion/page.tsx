"use client";

import { useState } from "react";
import { useFacturas }  from "@/hooks/usefacturas";
import { useToast }     from "@/hooks/usetoast";
import { calcTotales }  from "@/types";
import { LIMITE_RFCE }  from "@/lib/dgii/xml-builder";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

// Cuáles de las 25 son RFCE (< 250k)
const ENCFS_RFCE = new Set(["E320000000011","E320000000013","E320000000014","E320000000015"]);

export default function CertificacionPage() {
  const { facturas, loading } = useFacturas();
  const { push, ToastContainer } = useToast();

  const [sembrando,    setSembrando]    = useState(false);
  const [enviandoTodo, setEnviandoTodo] = useState(false);
  const [enviando,     setEnviando]     = useState<string | null>(null);

  // Filtrar solo las facturas de prueba
  const dePrueba = facturas.filter((f) => (f as any).esDePrueba === true)
    .sort((a, b) => a.eCF.localeCompare(b.eCF));

  // ── Sembrar facturas en Firestore ─────────────────────────────────
  const sembrar = async () => {
    setSembrando(true);
    try {
      const res  = await fetch("/api/dgii/cert/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      push({ tipo: "success", mensaje: data.mensaje });
    } catch (err: unknown) {
      push({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error al crear facturas" });
    } finally {
      setSembrando(false);
    }
  };

  // ── Enviar UNA factura (mismo flujo que producción) ───────────────
  const enviarUna = async (facturaId: string, eCF: string) => {
    setEnviando(facturaId);
    try {
      const res  = await fetch("/api/dgii/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ facturaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      push({ tipo: "success", mensaje: `${eCF} → ${data.estadoDGII}` });
    } catch (err: unknown) {
      push({ tipo: "error", mensaje: `${eCF}: ${err instanceof Error ? err.message : "Error"}` });
    } finally {
      setEnviando(null);
    }
  };

  // ── Enviar todas en el ORDEN EXACTO que exige DGII ─────────────────
  // 1ro: E31, E32≥250k, E41, E43, E44, E45, E46, E47  (facturas base)
  // 2do: E33, E34                   (notas — referencian facturas del grupo 1)
  // 3ro: RFCE por API fc.dgii.gov.do (resúmenes E32 < 250k)
  // 4to: E32 < 250k completas → MANUAL por el portal de DGII
  const enviarTodas = async () => {
    setEnviandoTodo(true);
    const pendiente = (f: typeof dePrueba[0]) =>
      !f.estadoDGII || f.estadoDGII === "pendiente";

    // Grupo 1: facturas base (sin las notas ni los RFCE)
    const grupo1 = dePrueba.filter((f) =>
      ["E31","E32","E41","E43","E44","E45","E46","E47"].includes(f.tipoECF) &&
      !ENCFS_RFCE.has(f.eCF) && pendiente(f)
    );
    // Grupo 2: notas de débito/crédito (dependen del grupo 1)
    const grupo2 = dePrueba.filter((f) =>
      ["E33","E34"].includes(f.tipoECF) && pendiente(f)
    );
    // Grupo 3: RFCE — resumen de E32 < 250k (va antes del upload manual)
    const grupo3 = dePrueba.filter((f) =>
      ENCFS_RFCE.has(f.eCF) && pendiente(f)
    );

    for (const f of [...grupo1, ...grupo2, ...grupo3]) {
      await enviarUna(f.id, f.eCF);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setEnviandoTodo(false);
    push({
      tipo: "success",
      mensaje: "Grupos 1-3 enviados. Ahora sube las 4 E32 < 250k integrales al portal de DGII manualmente.",
    });
  };

  const aceptados  = dePrueba.filter((f) => f.estadoDGII === "Aceptado").length;
  const enviados   = dePrueba.filter((f) => f.estadoDGII === "Enviado").length;
  const pendientes = dePrueba.filter((f) => !f.estadoDGII || f.estadoDGII === "pendiente").length;

  return (
    <div className="fade-in" style={{ maxWidth: 960 }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
          Certificación DGII — Paso 2
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", fontFamily: sans, lineHeight: 1.6, maxWidth: 680 }}>
          Esta página crea las 25 facturas de prueba del set DGII directamente en Firestore y las
          envía usando el <strong>mismo flujo de producción</strong> — firma digital, envío a DGII,
          guardado de trackId y QR en Firebase. No hay código especial de prueba.
        </p>
      </div>

      {/* Pasos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { n:1, titulo:"Sembrar en Firestore", desc:"Crea las 25 facturas con los eCF exactos del set DGII. Se crea también el cliente de prueba (RNC 131880681).", btn:"Crear facturas de prueba", action: sembrar, loading: sembrando, done: dePrueba.length > 0 },
          { n:2, titulo:"Enviar a DGII", desc:"Grupo 1 (E31/E32≥250k/E41/E43/E44/E45/E46/E47) → Grupo 2 (E33/E34) → Grupo 3 (RFCE). Orden exacto DGII. Mismo /api/dgii/emitir de producción.", btn:"Enviar todas en orden", action: enviarTodas, loading: enviandoTodo, done: pendientes === 0 && dePrueba.length > 0 },
          { n:3, titulo:"Verificar en Facturas", desc:"Ve a la página de Facturas. Las 25 aparecen ahí con su trackId, estado DGII y QR. Usa 'Consultar estado' para actualizar.", btn:null, action: null, loading: false, done: aceptados === 25 },
        ].map(({ n, titulo, desc, btn, action, loading: ldg, done }) => (
          <div key={n} style={{ background: "#fff", border: `1px solid ${done ? "#bbf7d0" : "#e5e7eb"}`, borderTop: `3px solid ${done ? "#166534" : "#0e7490"}`, borderRadius: 6, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? "#166534" : "#0e7490", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {done ? "✓" : n}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111", fontFamily: sans }}>{titulo}</div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", fontFamily: sans, lineHeight: 1.6, marginBottom: btn ? 14 : 0 }}>{desc}</div>
            {btn && (
              <button onClick={action ?? undefined} disabled={ldg || (n === 2 && dePrueba.length === 0)}
                style={{ width: "100%", padding: "8px 0", borderRadius: 4, border: "none", cursor: ldg ? "not-allowed" : "pointer",
                  background: (n === 2 && dePrueba.length === 0) ? "#f3f4f6" : "#0e7490",
                  color: (n === 2 && dePrueba.length === 0) ? "#9ca3af" : "#fff",
                  fontSize: 12, fontWeight: 600, fontFamily: sans }}>
                {ldg ? "Procesando..." : btn}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* KPIs */}
      {dePrueba.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { l:"Facturas en Firestore", v: dePrueba.length, c:"#374151" },
            { l:"Pendientes",            v: pendientes,       c:"#92400e" },
            { l:"Enviados (consultar)",  v: enviados,         c:"#1d4ed8" },
            { l:"Aceptados",            v: `${aceptados}/25`, c: aceptados===25?"#166534":"#92400e" },
          ].map(({ l,v,c }) => (
            <div key={l} style={{ background:"#fff", border:"1px solid #e5e7eb", borderTop:`3px solid ${c}`, borderRadius:4, padding:"12px 16px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans, marginBottom:6 }}>{l}</div>
              <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:"#111" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Aviso RFCE */}
      {dePrueba.some((f) => ENCFS_RFCE.has(f.eCF) && (f.estadoDGII === "Enviado" || f.estadoDGII === "Aceptado")) && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:4, padding:"12px 16px", marginBottom:16, fontFamily:sans, fontSize:12, color:"#78350f" }}>
          <b>Paso manual requerido:</b> Los 4 RFCE (E32 &lt; RD$250k) ya fueron enviados como resúmenes.
          Ahora debes ir al <a href="https://ecf.dgii.gov.do/certecf/portalcertificacion" target="_blank" rel="noreferrer" style={{ color:"#0e7490" }}>portal de certificación DGII</a> y
          subir las facturas integrales de esos 4 eCF mediante la interfaz. Después usa "Enviar todas en orden" para los 21 restantes.
        </div>
      )}

      {/* Lista de facturas de prueba */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontFamily:sans }}>Cargando...</div>
      ) : dePrueba.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", background:"#fff", border:"1px solid #e5e7eb", borderRadius:6 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:15, color:"#374151", fontWeight:600, fontFamily:sans, marginBottom:8 }}>Aún no hay facturas de prueba</div>
          <div style={{ fontSize:13, color:"#9ca3af", fontFamily:sans }}>Haz clic en "Crear facturas de prueba" en el paso 1.</div>
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#f9fafb", borderBottom:"2px solid #e5e7eb" }}>
                {["eCF","Tipo","Item / Total","Estado DGII",""].map((h) => (
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:sans }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dePrueba.map((f) => {
                const t       = calcTotales(f.items);
                const esRFCE  = ENCFS_RFCE.has(f.eCF);
                const cargando = enviando === f.id;
                const yaOk    = f.estadoDGII === "Aceptado";
                const color: Record<string, string> = {
                  "E31":"#0e7490","E32":"#7c3aed","E33":"#d97706","E34":"#dc2626",
                  "E41":"#059669","E43":"#6b7280","E44":"#2563eb","E45":"#7c3aed",
                  "E46":"#0891b2","E47":"#9333ea",
                };
                const c = color[f.tipoECF] ?? "#6b7280";

                return (
                  <tr key={f.id}
                    style={{ borderBottom:"1px solid #f3f4f6", opacity: yaOk ? 0.6 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>
                        {esRFCE && <span style={{ color:"#7c3aed" }}>● </span>}
                        {f.eCF}
                      </div>
                      <div style={{ fontSize:10, color:"#9ca3af", fontFamily:sans }}>{f.fecha}</div>
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:700, fontFamily:mono, background:`${c}15`, color:c, border:`1px solid ${c}30` }}>
                        {f.tipoECF}
                      </span>
                      {esRFCE && <div style={{ fontSize:9, color:"#7c3aed", fontFamily:sans, marginTop:2 }}>3ro: RFCE → 4to: portal</div>}
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ fontSize:12, color:"#374151", fontFamily:sans }}>
                        {f.items[0]?.descripcion?.substring(0, 40)}
                      </div>
                      <div style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>
                        RD$ {t.total.toLocaleString("es-DO",{minimumFractionDigits:2})}
                        {t.total < LIMITE_RFCE && f.tipoECF === "E32" && (
                          <span style={{ fontSize:9, color:"#7c3aed", marginLeft:6 }}>(&lt;250k)</span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      {cargando ? (
                        <span style={{ fontSize:11, color:"#0e7490", fontFamily:sans }}>Enviando...</span>
                      ) : (() => {
                        const map: Record<string, { bg:string; color:string; border:string; label:string }> = {
                          pendiente:           { bg:"#f9fafb", color:"#6b7280", border:"#e5e7eb", label:"Pendiente" },
                          Enviado:             { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe", label:"Enviado" },
                          Aceptado:            { bg:"#f0fdf4", color:"#166534", border:"#bbf7d0", label:"Aceptado ✓" },
                          AceptadoCondicional: { bg:"#fffbeb", color:"#92400e", border:"#fde68a", label:"Aceptado Cond." },
                          Rechazado:           { bg:"#fef2f2", color:"#991b1b", border:"#fecaca", label:"Rechazado" },
                        };
                        const s = map[f.estadoDGII ?? "pendiente"] ?? map.pendiente;
                        return (
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:600, fontFamily:sans, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
                            {s.label}
                          </span>
                        );
                      })()}
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <button
                        onClick={() => enviarUna(f.id, f.eCF)}
                        disabled={cargando || enviandoTodo || yaOk}
                        style={{ padding:"5px 12px", borderRadius:4, border:"none",
                          cursor: (cargando || enviandoTodo || yaOk) ? "not-allowed" : "pointer",
                          fontSize:11, fontFamily:sans, fontWeight:500,
                          background: yaOk ? "#f3f4f6" : "#0e7490",
                          color:      yaOk ? "#9ca3af" : "#fff" }}>
                        {cargando ? "..." : yaOk ? "OK" : "Enviar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding:"10px 14px", fontSize:12, color:"#9ca3af", fontFamily:sans, borderTop:"1px solid #f3f4f6" }}>
            ● Morado = RFCE (resumen primero, luego subir factura integral al portal) · {dePrueba.length} facturas de prueba
          </div>
        </div>
      )}

      {ToastContainer}
    </div>
  );
}