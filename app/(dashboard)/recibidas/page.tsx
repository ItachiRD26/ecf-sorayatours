"use client";

import { useEffect, useState, useCallback } from "react";
import { db }              from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, limit, Timestamp } from "firebase/firestore";
import type { FacturaRecibida }  from "@/types";
import { fmt, fmtDate }          from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────
function badgeARECF(estado: string) {
  const map: Record<string, { bg: string; color: string }> = {
    pendiente: { bg: "#fef3c7", color: "#92400e" },
    Enviado:   { bg: "#d1fae5", color: "#065f46" },
    Error:     { bg: "#fee2e2", color: "#991b1b" },
  };
  const s = map[estado] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {estado}
    </span>
  );
}

function badgeACECF(estado: string) {
  const map: Record<string, { bg: string; color: string }> = {
    pendiente: { bg: "#fef3c7", color: "#92400e" },
    Aceptado:  { bg: "#d1fae5", color: "#065f46" },
    Rechazado: { bg: "#fee2e2", color: "#991b1b" },
    NoAplica:  { bg: "#f3f4f6", color: "#6b7280" },
  };
  const s = map[estado] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {estado}
    </span>
  );
}

function fmtTs(ts: unknown): string {
  if (!ts) return "—";
  if (ts instanceof Timestamp) return ts.toDate().toLocaleString("es-DO");
  if (typeof ts === "string")  return new Date(ts).toLocaleString("es-DO");
  return "—";
}

// ── Modal Acción ─────────────────────────────────────────────────────────────
interface ModalAccionProps {
  factura: FacturaRecibida;
  accion:  "arecf" | "acecf";
  onClose: () => void;
  onDone:  () => void;
}

function ModalAccion({ factura, accion, onClose, onDone }: ModalAccionProps) {
  const [estado,        setEstado]        = useState<number>(accion === "arecf" ? 0 : 1);
  const [codigoMotivo,  setCodigoMotivo]  = useState(1);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [token,         setToken]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");

  async function handleEnviar() {
    setLoading(true);
    setError("");
    try {
      const url  = accion === "arecf" ? "/api/dgii/arecf" : "/api/dgii/acecf";
      const body: Record<string, unknown> = { encf: factura.encf, estado, token };
      if (accion === "arecf" && estado === 1) body.codigoMotivo = codigoMotivo;
      if (accion === "acecf" && estado === 2) body.motivoRechazo = motivoRechazo;

      const res  = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al enviar");
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const titulo = accion === "arecf" ? "Enviar Acuse de Recibo (ARECF)" : "Enviar Aprobación Comercial (ACECF)";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, width: 440, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          e-CF: <strong>{factura.encf}</strong> — Emisor: {factura.rncEmisor}
        </div>

        {/* Estado */}
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Estado</label>
        <select
          value={estado}
          onChange={e => setEstado(Number(e.target.value))}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginBottom: 12 }}
        >
          {accion === "arecf" ? (
            <>
              <option value={0}>0 — Recibido</option>
              <option value={1}>1 — No Recibido</option>
            </>
          ) : (
            <>
              <option value={1}>1 — Aceptado</option>
              <option value={2}>2 — Rechazado</option>
            </>
          )}
        </select>

        {/* Motivo ARECF No Recibido */}
        {accion === "arecf" && estado === 1 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Código Motivo No Recibido</label>
            <select
              value={codigoMotivo}
              onChange={e => setCodigoMotivo(Number(e.target.value))}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginBottom: 12 }}
            >
              <option value={1}>1 — Error de Especificación</option>
              <option value={2}>2 — Error en Firma Digital</option>
              <option value={3}>3 — Envío Duplicado</option>
              <option value={4}>4 — RNC Comprador no Corresponde</option>
            </select>
          </>
        )}

        {/* Motivo ACECF Rechazado */}
        {accion === "acecf" && estado === 2 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Detalle Motivo Rechazo</label>
            <textarea
              value={motivoRechazo}
              onChange={e => setMotivoRechazo(e.target.value)}
              maxLength={250}
              rows={3}
              placeholder="Describe el motivo del rechazo..."
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, resize: "vertical", marginBottom: 12 }}
            />
          </>
        )}

        {/* Token manual */}
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Token DGII (opcional)</label>
        <input
          type="text"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Dejar vacío para usar token automático"
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={loading}
            style={{ padding: "8px 20px", border: "none", borderRadius: 6, background: "#0e7490", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Enviando..." : "Enviar a DGII"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function RecíbidasPage() {
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<{ factura: FacturaRecibida; accion: "arecf" | "acecf" } | null>(null);
  const [toast,    setToast]    = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "facturas_recibidas"),
      orderBy("recibidoEn", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(q, snap => {
      setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() } as FacturaRecibida)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const pendientesARECF  = facturas.filter(f => f.estadoARECF  === "pendiente").length;
  const pendientesACECF  = facturas.filter(f => f.estadoACECF  === "pendiente").length;
  const totalRecibidas   = facturas.length;

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/dgii/recepcion`
    : "/api/dgii/recepcion";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2000, background: "#065f46", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
          Facturas Recibidas
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          e-CFs recibidos de proveedores vía DGII — Pasos 7-11 de certificación
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Recibidas", value: totalRecibidas,   color: "#0e7490" },
          { label: "ARECF Pendiente", value: pendientesARECF,  color: "#d97706" },
          { label: "ACECF Pendiente", value: pendientesACECF,  color: "#7c3aed" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 18px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* URL Webhook */}
      <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: "#0369a1", marginBottom: 4 }}>URL de Recepción (registrar en portal DGII — Paso 7)</div>
        <code style={{ background: "#fff", border: "1px solid #e0f2fe", borderRadius: 4, padding: "4px 8px", fontSize: 12, color: "#0c4a6e", display: "block", wordBreak: "break-all" }}>
          {webhookUrl}
        </code>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Cargando...</div>
      ) : facturas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#6b7280" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📬</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Sin facturas recibidas aún</div>
          <div style={{ fontSize: 12 }}>DGII enviará los e-CFs a tu URL de recepción al completar el Paso 8.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["e-CF", "Tipo", "RNC Emisor", "Emisor", "Fecha", "Monto", "ARECF", "ACECF", "Recibido", "Acciones"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 11, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => (
                  <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#0e7490", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {f.encf}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: "#f0f9ff", color: "#0369a1", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {f.tipoECF}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{f.rncEmisor || "—"}</td>
                    <td style={{ padding: "10px 12px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                      {f.razonSocialEmisor || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDate(f.fechaEmision)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>
                      RD$ {fmt(f.montoTotal)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{badgeARECF(f.estadoARECF)}</td>
                    <td style={{ padding: "10px 12px" }}>{badgeACECF(f.estadoACECF)}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontSize: 11, color: "#6b7280" }}>
                      {fmtTs(f.recibidoEn)}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {f.estadoARECF === "pendiente" && (
                          <button
                            onClick={() => setModal({ factura: f, accion: "arecf" })}
                            style={{ padding: "4px 10px", background: "#0e7490", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                          >
                            ARECF
                          </button>
                        )}
                        {f.estadoACECF === "pendiente" && (
                          <button
                            onClick={() => setModal({ factura: f, accion: "acecf" })}
                            style={{ padding: "4px 10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                          >
                            ACECF
                          </button>
                        )}
                        {f.estadoARECF === "Enviado" && f.estadoACECF !== "pendiente" && (
                          <span style={{ fontSize: 11, color: "#065f46" }}>✓ Completo</span>
                        )}
                        {f.estadoARECF === "Error" && (
                          <button
                            onClick={() => setModal({ factura: f, accion: "arecf" })}
                            style={{ padding: "4px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                          >
                            Reintentar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal acción */}
      {modal && (
        <ModalAccion
          factura={modal.factura}
          accion={modal.accion}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            showToast(`${modal.accion.toUpperCase()} enviado correctamente`);
          }}
        />
      )}
    </div>
  );
}
