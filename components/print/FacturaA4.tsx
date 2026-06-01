"use client";

import type { Factura, LineaServicio } from "@/types";
import { fmt, fmtDate, calcLinea, calcTotales } from "@/types";
import { QRCodeSVG } from "qrcode.react";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

interface Props {
  factura:  Factura;
  cliente:  import("@/types").Cliente | undefined;
  empresa?: {
    nombre: string; rnc: string; direccion: string; telefono: string;
    firmaVendedor?: string;
  };
}

const DEFAULT_EMPRESA = {
  nombre:        "SORAYA Y LEONARDO TOURS SRL",
  rnc:           "131-21765-6",
  direccion:     "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:      "809-961-6343",
  firmaVendedor: "Preparado por",
};

const COD_MOD_E34: Record<string, string> = {
  "1": "Descuento",
  "2": "Corrige Texto",
  "3": "Devolucion",
  "4": "Corrige montos del NCF modificado",
};
const COD_MOD_E33: Record<string, string> = {
  "1": "Mora", "2": "Corrige Texto", "3": "Descuento",
  "4": "Gastos", "5": "Interes", "6": "Otros",
};

function descModificacion(tipoECF: string, cod?: string, motivo?: string): string {
  if (motivo) return motivo;
  const map = tipoECF === "E33" ? COD_MOD_E33 : COD_MOD_E34;
  return map[cod ?? ""] ?? "Corrige montos del NCF modificado";
}

function fmtFechaFirma(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function FacturaA4({ factura, cliente, empresa = DEFAULT_EMPRESA }: Props) {
  const esNota   = factura.tipoECF === "E33" || factura.tipoECF === "E34";
  const esE32    = factura.tipoECF === "E32";
  const esE41    = factura.tipoECF === "E41";
  // E31/E32/E33/E34 → tabla turismo (PAX + Modo); resto → tabla estándar DGII
  const esTurismo = ["E31","E32","E33","E34"].includes(factura.tipoECF);
  const e      = { ...DEFAULT_EMPRESA, ...empresa };
  const t      = calcTotales(factura.items);

  const headerColor =
    factura.tipoECF === "E31" ? "#0e7490" :
    factura.tipoECF === "E32" ? "#374151" :
    factura.tipoECF === "E34" ? "#166534" :
    factura.tipoECF === "E33" ? "#92400e" :
    factura.tipoECF === "E41" ? "#7c3aed" : "#0e7490";

  const titulo =
    esE32                     ? "Factura de Consumo Electronica" :
    factura.tipoECF === "E34" ? "Nota de Credito Electronica" :
    factura.tipoECF === "E33" ? "Nota de Debito Electronica"  :
    factura.tipoECF === "E41" ? "Comprobante de Compras (E41)" :
    factura.tipoECF === "E43" ? "Gastos Menores (E43)"         :
    factura.tipoECF === "E44" ? "Regimen Especial (E44)"       :
    factura.tipoECF === "E45" ? "Gubernamental (E45)"          :
    factura.tipoECF === "E46" ? "Exportaciones (E46)"          :
    factura.tipoECF === "E47" ? "Pagos al Exterior (E47)"      :
    "Factura de Credito Fiscal Electronica";

  const compradorLabel = esE41 ? "Proveedor" : "Cliente";

  // Determinar si hay comprador que mostrar
  const tieneComprador = !esE32 || !factura.esConsumidorFinal || !!factura.nombreConsumidor || !!cliente;

  return (
    <div style={{ fontFamily: sans, color: "#111", width: "100%" }}>

      {/* ── ENCABEZADO ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, marginBottom: 14, borderBottom: "3px solid " + headerColor }}>

        {/* Izquierda: empresa + fecha emisión */}
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 5 }}>{e.nombre}</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.9 }}>
            <div>RNC: <strong style={{ fontFamily: mono }}>{e.rnc}</strong></div>
            {e.direccion && <div>{e.direccion}</div>}
            {e.telefono  && <div>Tel: {e.telefono}</div>}
            <div><strong>Fecha Emision:</strong> {fmtDate(factura.fecha)}</div>
          </div>
        </div>

        {/* Derecha: tipo + e-NCF + datos específicos por tipo */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: serif, fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: headerColor, marginBottom: 6 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 11, color: "#444", lineHeight: 2, fontFamily: mono }}>
            <div><strong>e-NCF:</strong> {factura.eCF}</div>

            {/* E33/E34: NCF modificado + descripción */}
            {esNota && factura.eCFRef && (
              <>
                <div><strong>NCF Modificado:</strong> {factura.eCFRef}</div>
                <div style={{ fontStyle: "italic", color: headerColor, fontSize: 10, fontFamily: sans }}>
                  {descModificacion(factura.tipoECF, factura.codigoModificacion, factura.motivoNota)}
                </div>
              </>
            )}

            {/* Fecha Vencimiento — solo E32 y E34 no llevan (pág. 6 Formato e-CF DGII) */}
            {factura.tipoECF !== "E32" && factura.tipoECF !== "E34" && (
              <div><strong>Fecha Vencimiento:</strong> {fmtDate(factura.vencimientoECF)}</div>
            )}
            {/* Términos — solo facturas normales (no notas) */}
            {!esNota && (
              <div><strong>Terminos:</strong> {factura.terminos === "Contado" ? "Contado" : "Credito " + factura.terminos}</div>
            )}
            {factura.metodoPago && (
              <div><strong>Pago:</strong> {factura.metodoPago}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── COMPRADOR / PROVEEDOR ── */}
      {tieneComprador && (
        <div style={{ marginBottom: 14, fontSize: 11, lineHeight: 1.9, borderBottom: "1px solid #e5e7eb", paddingBottom: 10 }}>
          {factura.esConsumidorFinal ? (
            <>
              <div><strong>Razon Social {compradorLabel}:</strong> {factura.nombreConsumidor ?? "Consumidor Final"}</div>
              {factura.telefonoConsumidor && <div>Tel: {factura.telefonoConsumidor}</div>}
            </>
          ) : cliente ? (
            <>
              <div><strong>Razon Social {compradorLabel}:</strong> {cliente.nombre}</div>
              {cliente.rnc       && <div><strong>RNC {compradorLabel}:</strong> <span style={{ fontFamily: mono }}>{cliente.rnc}</span></div>}
              {cliente.direccion && <div>{cliente.direccion}{cliente.ciudad ? ", " + cliente.ciudad : ""}</div>}
              {cliente.telefono  && <div>Tel: {cliente.telefono}</div>}
            </>
          ) : factura.nombreConsumidor ? (
            <div><strong>Razon Social {compradorLabel}:</strong> {factura.nombreConsumidor}</div>
          ) : null}

          {/* E47: identificador extranjero */}
          {factura.tipoECF === "E47" && factura.idTransaccion && (
            <div><strong>ID Extranjero:</strong> <span style={{ fontFamily: mono }}>{factura.idTransaccion}</span></div>
          )}
        </div>
      )}

      {/* ── TABLA DE ITEMS ── */}
      {esTurismo ? (
        /* Tabla turismo: PAX + Modo (E31/E32/E33/E34) */
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 11 }}>
          <thead>
            <tr style={{ background: headerColor }}>
              {([
                { h: "Cantidad",    align: "center", w: "7%"   },
                { h: "Descripcion", align: "left",   w: "auto" },
                { h: "PAX",         align: "center", w: "6%"   },
                { h: "Modo",        align: "left",   w: "10%"  },
                { h: "Precio",      align: "right",  w: "13%"  },
                { h: "Desc. RD$",   align: "right",  w: "10%"  },
                { h: "ITBIS",       align: "right",  w: "10%"  },
                { h: "Valor",       align: "right",  w: "12%"  },
              ] as const).map(({ h, align, w }, i) => (
                <th key={h} style={{ padding: "8px 10px", color: "#fff", fontSize: 10, fontWeight: 600, textAlign: align, width: w, borderRight: i < 7 ? "1px solid rgba(255,255,255,0.12)" : "none" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factura.items.map((item: LineaServicio, i: number) => {
              const c = calcLinea(item);
              const precioLabel = item.modo === "por_grupo"
                ? "RD$ " + fmt(item.precio) + " (grupo)"
                : "RD$ " + fmt(item.precio) + "/p.";
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: mono, fontWeight: 700 }}>{item.cant || 1}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 500 }}>{item.descripcion}</div>
                    {item.tramoLabel && <div style={{ fontSize: 9, color: "#9ca3af" }}>{item.tramoLabel}</div>}
                    {item.fechaTour  && <div style={{ fontSize: 9, color: "#6b7280" }}>Fecha: {fmtDate(item.fechaTour)}</div>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: mono, fontWeight: 700, color: "#0e7490", fontSize: 13 }}>{item.pax || item.cant}</td>
                  <td style={{ padding: "8px 10px", color: "#6b7280", fontSize: 10 }}>{item.modo === "por_grupo" ? "Por Grupo" : "Por Persona"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, fontSize: 10, color: "#374151" }}>{precioLabel}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono }}>
                    {c.descAmt > 0 ? <span style={{ color: "#dc2626" }}>{fmt(c.descAmt)}</span> : <span style={{ color: "#d1d5db" }}>---</span>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, color: "#1d4ed8" }}>{item.itbis > 0 ? fmt(c.itbisAmt) : "Exento"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmt(c.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        /* Tabla estándar DGII: Cantidad | Descripción | Precio | ITBIS | Valor (E41/E43–E47) */
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 11 }}>
          <thead>
            <tr style={{ background: headerColor }}>
              {([
                { h: "Cantidad",    align: "center", w: "10%"  },
                { h: "Descripcion", align: "left",   w: "auto" },
                { h: "Precio",      align: "right",  w: "18%"  },
                { h: "ITBIS",       align: "right",  w: "16%"  },
                { h: "Valor",       align: "right",  w: "16%"  },
              ] as const).map(({ h, align, w }, i) => (
                <th key={h} style={{ padding: "8px 10px", color: "#fff", fontSize: 10, fontWeight: 600, textAlign: align, width: w, borderRight: i < 4 ? "1px solid rgba(255,255,255,0.12)" : "none" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factura.items.map((item: LineaServicio, i: number) => {
              const c = calcLinea(item);
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: mono, fontWeight: 700 }}>{item.cant || 1}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 500 }}>{item.descripcion}</div>
                    {item.tramoLabel && <div style={{ fontSize: 9, color: "#9ca3af" }}>{item.tramoLabel}</div>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono }}>{fmt(item.precio)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, color: "#1d4ed8" }}>{item.itbis > 0 ? fmt(c.itbisAmt) : "Exento"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmt(c.sub)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── TOTALES (estilo DGII: Subtotal Gravado / Total ITBIS / Total) ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ width: 300, fontSize: 11 }}>
          {t.desc > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ color: "#555" }}>Descuentos:</span>
              <span style={{ fontFamily: mono, fontWeight: 600, color: "#dc2626" }}>{fmt(t.desc)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #e5e7eb" }}>
            <span style={{ color: "#555" }}>Subtotal Gravado:</span>
            <span style={{ fontFamily: mono, fontWeight: 600 }}>{fmt(t.sub)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #e5e7eb" }}>
            <span style={{ color: "#555" }}>Total ITBIS:</span>
            <span style={{ fontFamily: mono, fontWeight: 600, color: "#1d4ed8" }}>{fmt(t.itbis)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", background: headerColor, borderRadius: 3, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "#fff" }}>Total:</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: "#fff" }}>{fmt(t.total)}</span>
          </div>
        </div>
      </div>

      {/* Notas libres */}
      {factura.notas && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", marginBottom: 20, fontSize: 11, color: "#92400e" }}>
          <div style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notas</div>
          {factura.notas}
        </div>
      )}

      {/* ── QR + CÓDIGO DE SEGURIDAD (formato DGII) ── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ width: 80, height: 80, flexShrink: 0 }}>
          {factura.urlQR
            ? <QRCodeSVG value={factura.urlQR} size={80} level="M" />
            : <div style={{ width: 80, height: 80, border: "2px dashed #9ca3af", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
                <span style={{ fontSize: 26 }}>&#9638;</span>
                <span style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>QR DGII</span>
              </div>
          }
        </div>
        <div style={{ fontSize: 10, color: "#374151", lineHeight: 2 }}>
          {factura.codigoSeguridad && (
            <div>Codigo de Seguridad: <strong style={{ fontFamily: mono, letterSpacing: "0.1em" }}>{factura.codigoSeguridad}</strong></div>
          )}
          {factura.fechaEnvioDGII && (
            <div>Fecha Firma Digital: <span style={{ fontFamily: mono }}>{fmtFechaFirma(factura.fechaEnvioDGII)}</span></div>
          )}
          {!factura.urlQR && !factura.codigoSeguridad && (
            <div style={{ fontStyle: "italic", color: "#9ca3af" }}>(Disponible tras firma digital)</div>
          )}
          <div style={{ marginTop: 4, fontSize: 9, color: "#9ca3af" }}>Verifique en ecf.dgii.gov.do</div>
        </div>
      </div>

      {/* ── PIE ── */}
      <div style={{ paddingTop: 10, borderTop: "1px dashed #d1d5db", fontSize: 9, color: "#9ca3af", textAlign: "center" }}>
        Comprobante Fiscal Electronico (e-CF) — Soraya &amp; Leonardo Tours SRL
      </div>
    </div>
  );
}
