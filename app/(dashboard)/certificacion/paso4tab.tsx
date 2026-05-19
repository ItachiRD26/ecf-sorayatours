"use client";

// Paso 4 — Pruebas de Simulación
// El contribuyente crea facturas reales desde el sistema, las envía a DGII certecf,
// y prepara las representaciones impresas para el Paso 5.
//
// Requerimientos DGII:
//   E31×4 | E32≥250k×2 | E33×1 | E34×2 | E41×2 | E43×2
//   E44×2 | E45×2 | E46×2 | E47×2 | E32<250k RFCE×4
//
// NO hay Excel de DGII — las facturas son del negocio real (excursiones).

import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db }    from "@/lib/firebase";
import type { Factura } from "@/types";
import { fmt, fmtDate, calcTotales } from "@/types";
import Link from "next/link";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

const LIMITE_RFCE = 250_000;

// ── Requerimientos por tipo ──────────────────────────────────────────────────
interface Req {
  tipo:        string;       // clave interna
  tipoECF:     string;       // tipo DGII (E31, E32, etc.)
  label:       string;
  desc:        string;
  requeridos:  number;
  color:       string;
  filtro?:     (f: Factura) => boolean;  // filtro adicional dentro del tipo
  esRFCE?:     boolean;
}

const REQS: Req[] = [
  { tipo:"E31",       tipoECF:"E31", label:"E31 — Crédito Fiscal",       desc:"Empresas con RNC (B2B)",           requeridos:4, color:"#0e7490" },
  { tipo:"E32_grande",tipoECF:"E32", label:"E32 — Consumo ≥RD$250k",     desc:"Facturas de consumo grandes",       requeridos:2, color:"#7c3aed",
    filtro: f => calcTotales(f.items).total >= LIMITE_RFCE },
  { tipo:"E33",       tipoECF:"E33", label:"E33 — Nota de Débito",       desc:"Modifica E31/E32 anterior",         requeridos:1, color:"#d97706" },
  { tipo:"E34",       tipoECF:"E34", label:"E34 — Nota de Crédito",      desc:"Modifica E31/E32 anterior",         requeridos:2, color:"#dc2626" },
  { tipo:"E41",       tipoECF:"E41", label:"E41 — Compras",              desc:"Compras a proveedores",             requeridos:2, color:"#059669" },
  { tipo:"E43",       tipoECF:"E43", label:"E43 — Gastos Menores",       desc:"Gastos pequeños sin RNC",           requeridos:2, color:"#6b7280" },
  { tipo:"E44",       tipoECF:"E44", label:"E44 — Regímenes Especiales", desc:"Zonas francas / especiales",        requeridos:2, color:"#2563eb" },
  { tipo:"E45",       tipoECF:"E45", label:"E45 — Gubernamental",        desc:"Instituciones del gobierno",        requeridos:2, color:"#7c3aed" },
  { tipo:"E46",       tipoECF:"E46", label:"E46 — Exportaciones",        desc:"Ventas al exterior",                requeridos:2, color:"#0891b2" },
  { tipo:"E47",       tipoECF:"E47", label:"E47 — Pagos al Exterior",    desc:"Servicios del exterior",            requeridos:2, color:"#9333ea" },
  { tipo:"E32_rfce",  tipoECF:"E32", label:"E32 — Consumo <RD$250k",    desc:"RFCE — Resumen enviado por API",     requeridos:4, color:"#7c3aed", esRFCE:true,
    filtro: f => calcTotales(f.items).total < LIMITE_RFCE },
];

// Total requerido = 21 e-CFs enviados
const TOTAL_REQ = REQS.reduce((s, r) => s + r.requeridos, 0);

// ── Helpers ───────────────────────────────────────────────────────────────────
const colorEstado = (est?: string) => {
  if (!est) return { bg:"#f3f4f6", color:"#6b7280", border:"#e5e7eb", label:"No enviado" };
  const m: Record<string, { bg:string; color:string; border:string; label:string }> = {
    Enviado:             { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe", label:"Enviado" },
    Aceptado:            { bg:"#f0fdf4", color:"#166534", border:"#bbf7d0", label:"Aceptado ✓" },
    AceptadoCondicional: { bg:"#fffbeb", color:"#92400e", border:"#fde68a", label:"Aceptado Cond." },
    Rechazado:           { bg:"#fef2f2", color:"#991b1b", border:"#fecaca", label:"Rechazado ✗" },
  };
  return m[est] ?? m.Enviado;
};

// ── Component ────────────────────────────────────────────────────────────────
export default function Paso4Tab({ token }: { token: string }) {
  const [facturas,   setFacturas]   = useState<Factura[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expandido,  setExpandido]  = useState<string | null>(null);

  // Suscribir a facturas en tiempo real
  useEffect(() => {
    const q = query(collection(db, "facturas"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q, snap => {
      setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Factura)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Agrupar facturas enviadas (estadoDGII ≠ undefined y ≠ pendiente) por req
  const facturasPorReq = (req: Req): Factura[] =>
    facturas.filter(f => {
      if (f.tipoECF !== req.tipoECF) return false;
      if (req.filtro && !req.filtro(f))  return false;
      // Contar las que ya fueron enviadas a DGII
      return !!f.estadoDGII && f.estadoDGII !== "pendiente";
    });

  const totalEnviados = REQS.reduce((s, r) => s + Math.min(facturasPorReq(r).length, r.requeridos), 0);
  const todoCompleto  = REQS.every(r => facturasPorReq(r).length >= r.requeridos);

  return (
    <div>
      {/* ── Banner explicativo ─────────────────────────────────────────────── */}
      <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, padding:"14px 18px", marginBottom:24, fontFamily:sans }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#166534", marginBottom:6 }}>
          Paso 4 — Pruebas de Simulación con Datos Reales
        </div>
        <div style={{ fontSize:12, color:"#374151", lineHeight:1.8 }}>
          Crea facturas de tu sistema (excursiones en bote) y envíalas a DGII certecf como simulación de tu actividad real.
          No hay Excel de DGII — usa el módulo de <b>Facturas</b> para crear cada tipo.<br/>
          <span style={{ color:"#6b7280" }}>
            ⚠️ Las secuencias <b>no se reutilizan</b> si las pruebas se reinician. Verifica que cada e-CF sea aceptado antes de continuar.
          </span>
        </div>
      </div>

      {/* ── Progreso total ─────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", border:`1px solid ${todoCompleto ? "#bbf7d0" : "#e5e7eb"}`, borderRadius:6, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#111" }}>
            Progreso General
          </div>
          <div style={{ fontFamily:mono, fontSize:16, fontWeight:700, color: todoCompleto ? "#166534" : "#111" }}>
            {totalEnviados}/{TOTAL_REQ} e-CFs
          </div>
        </div>
        <div style={{ height:8, background:"#f3f4f6", borderRadius:4, overflow:"hidden" }}>
          <div style={{
            height:"100%", borderRadius:4, transition:"width 0.4s",
            background: todoCompleto ? "#166534" : "#0e7490",
            width: `${Math.round((totalEnviados / TOTAL_REQ) * 100)}%`,
          }} />
        </div>
        <div style={{ fontSize:11, color:"#6b7280", fontFamily:sans, marginTop:6 }}>
          {todoCompleto
            ? "✅ Todos los tipos completados — listo para Paso 5"
            : `Faltan ${TOTAL_REQ - totalEnviados} e-CFs para completar la simulación`}
        </div>
      </div>

      {/* ── Tarjetas por tipo ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontFamily:sans, fontSize:13 }}>
          Cargando facturas…
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {REQS.map(req => {
            const facts     = facturasPorReq(req);
            const enviados  = facts.length;
            const completo  = enviados >= req.requeridos;
            const pct       = Math.min(100, Math.round((enviados / req.requeridos) * 100));
            const isOpen    = expandido === req.tipo;

            return (
              <div key={req.tipo} style={{
                background:"#fff", border:`1px solid ${completo ? "#bbf7d0" : "#e5e7eb"}`,
                borderLeft:`3px solid ${req.color}`, borderRadius:6, overflow:"hidden",
              }}>
                {/* Header row */}
                <div
                  onClick={() => setExpandido(isOpen ? null : req.tipo)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background="#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background="")}
                >
                  {/* Badge tipo */}
                  <span style={{
                    fontSize:10, padding:"2px 7px", borderRadius:3, fontWeight:700,
                    fontFamily:mono, background:`${req.color}15`, color:req.color,
                    border:`1px solid ${req.color}30`, flexShrink:0,
                  }}>{req.tipoECF}{req.esRFCE ? " RFCE" : ""}</span>

                  {/* Label */}
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:sans, fontSize:13, fontWeight:600, color:"#111" }}>{req.label}</div>
                    <div style={{ fontFamily:sans, fontSize:11, color:"#9ca3af", marginTop:1 }}>{req.desc}</div>
                  </div>

                  {/* Progress */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    <div style={{ fontFamily:mono, fontSize:13, fontWeight:700, color: completo ? "#166534" : "#111" }}>
                      {completo ? "✓" : ""} {enviados}/{req.requeridos}
                    </div>
                    <div style={{ width:80, height:4, background:"#f3f4f6", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:2, background: completo ? "#166534" : req.color, width:`${pct}%`, transition:"width 0.4s" }} />
                    </div>
                  </div>

                  {/* Chevron */}
                  <span style={{ fontSize:12, color:"#9ca3af", transform: isOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>▼</span>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop:"1px solid #f3f4f6", padding:"14px 16px" }}>
                    {/* Botón crear */}
                    <div style={{ marginBottom:12, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <Link
                        href={`/facturas?tipo=${req.tipoECF}`}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          padding:"7px 14px", background:req.color, color:"#fff",
                          borderRadius:4, fontSize:12, fontFamily:sans, fontWeight:600,
                          textDecoration:"none",
                        }}
                      >
                        + Crear {req.tipoECF}{req.esRFCE ? " <250k" : ""}
                      </Link>
                      {req.esRFCE && (
                        <span style={{ fontSize:11, color:"#6b7280", fontFamily:sans }}>
                          El monto debe ser menor a RD$250,000 — el sistema enviará automáticamente como RFCE
                        </span>
                      )}
                      {req.tipo === "E32_grande" && (
                        <span style={{ fontSize:11, color:"#6b7280", fontFamily:sans }}>
                          El monto debe ser ≥ RD$250,000 — se envía como e-CF completo
                        </span>
                      )}
                      {["E41","E43","E44","E45","E46","E47"].includes(req.tipoECF) && (
                        <span style={{ fontSize:11, color:"#6b7280", fontFamily:sans }}>
                          Tipo B2B — crea una factura simulada de tu operación
                        </span>
                      )}
                    </div>

                    {/* Lista de e-CFs enviados */}
                    {facts.length === 0 ? (
                      <div style={{ padding:"12px 0", fontSize:12, color:"#9ca3af", fontFamily:sans, textAlign:"center" }}>
                        Aún no hay {req.tipoECF} enviados
                      </div>
                    ) : (
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ borderBottom:"1px solid #f3f4f6" }}>
                            {["e-NCF","Fecha","Monto","Estado DGII","Imp."].map(h => (
                              <th key={h} style={{ padding:"6px 8px", textAlign:"left", fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em", fontFamily:sans }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {facts.slice(0, req.requeridos + 2).map(f => {
                            const est = colorEstado(f.estadoDGII);
                            const tot = calcTotales(f.items).total;
                            return (
                              <tr key={f.id} style={{ borderBottom:"1px solid #f9fafb" }}>
                                <td style={{ padding:"7px 8px", fontFamily:mono, fontSize:11, fontWeight:700, color:"#111" }}>{f.eCF}</td>
                                <td style={{ padding:"7px 8px", fontFamily:sans, color:"#374151" }}>{fmtDate(f.fecha)}</td>
                                <td style={{ padding:"7px 8px", fontFamily:mono, color:"#111", fontWeight:600 }}>RD${fmt(tot)}</td>
                                <td style={{ padding:"7px 8px" }}>
                                  <span style={{ fontSize:10, padding:"2px 7px", borderRadius:3, fontWeight:600, fontFamily:sans, background:est.bg, color:est.color, border:`1px solid ${est.border}`, whiteSpace:"nowrap" }}>
                                    {est.label}
                                  </span>
                                </td>
                                <td style={{ padding:"7px 8px" }}>
                                  <Link
                                    href={`/facturas?print=${f.id}`}
                                    target="_blank"
                                    style={{ fontSize:11, color:req.color, fontFamily:sans, fontWeight:600, textDecoration:"none", whiteSpace:"nowrap" }}
                                    title="Ver representación impresa (para Paso 5)"
                                  >
                                    🖨 Ver
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Guía Paso 5 ───────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:"16px 20px", marginTop:24 }}>
        <div style={{ fontFamily:sans, fontSize:14, fontWeight:700, color:"#111", marginBottom:10 }}>
          📋 Preparar para Paso 5 — Representaciones Impresas
        </div>
        <div style={{ fontSize:12, color:"#374151", fontFamily:sans, lineHeight:1.8, marginBottom:14 }}>
          El Paso 5 pide <b>un PDF por tipo</b> de e-CF (no uno por factura individual). Debes subir al portal certecf:
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[
            "E31","E32 ≥250k","E33","E34","E41","E43","E44","E45","E46","E47","E32 <250k"
          ].map(t => (
            <div key={t} style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 12px", fontFamily:mono, fontSize:11, color:"#374151" }}>
              📄 {t}
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:"#6b7280", fontFamily:sans, marginTop:12, lineHeight:1.7 }}>
          Para imprimir/guardar como PDF: en la página de <b>Facturas</b>, abre cada factura → icono de impresión → usa <b>Guardar como PDF</b> en el diálogo de impresión del navegador.<br/>
          La representación debe incluir el <b>QR legible</b> con todos los datos del timbre electrónico.
        </div>
      </div>

      {/* ── Checklist ─────────────────────────────────────────────────────── */}
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, padding:"14px 18px", marginTop:16, fontFamily:sans }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:8 }}>⚠️ Puntos críticos del Paso 4</div>
        <div style={{ fontSize:12, color:"#78350f", lineHeight:2 }}>
          ✓ Verifica que cada e-CF llegue a estado <b>Aceptado</b> (o Aceptado Condicional) en DGII antes del Paso 5<br/>
          ✓ Los E33/E34 deben referenciar un e-CF del mismo paso (eCFRef obligatorio)<br/>
          ✓ Los E32&lt;250k: espera que el RFCE sea aceptado, luego sube el XML al portal certecf<br/>
          ✓ El QR en la representación impresa debe ser legible — incluye todos los parámetros<br/>
          ✓ Secuencias NO reutilizables: si falla y se reinicia, el número anterior queda inválido
        </div>
      </div>
    </div>
  );
}