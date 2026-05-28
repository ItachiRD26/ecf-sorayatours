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
  rnc:           "1-31217656-6",
  direccion:     "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:      "809-961-6343",
  firmaVendedor: "Preparado por",
};

export default function FacturaA4({ factura, cliente, empresa = DEFAULT_EMPRESA }: Props) {
  const esNota    = factura.tipoECF === "E33" || factura.tipoECF === "E34";
  const esCredito = factura.tipoECF === "E34";
  const e         = { ...DEFAULT_EMPRESA, ...empresa };
  const t         = calcTotales(factura.items);

  const headerColor =
    factura.tipoECF === "E31" ? "#0e7490" :
    factura.tipoECF === "E32" ? "#374151" :
    esCredito                 ? "#166534" :
    esNota                    ? "#92400e" : "#111";

  const titulo =
    factura.tipoECF === "E32" ? "Factura de Consumo Electronica" :
    factura.tipoECF === "E34" ? "Nota de Credito Electronica (E34)" :
    factura.tipoECF === "E33" ? "Nota de Debito Electronica (E33)" :
    "Factura de Credito Fiscal Electronica";

  return (
    <div style={{ fontFamily: sans, color: "#111", width: "100%" }}>

      {/* Header empresa */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, marginBottom: 16, borderBottom: ("3px solid " + headerColor) }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 6 }}>{e.nombre}</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.9 }}>
            <div>RNC: <strong style={{ fontFamily: mono }}>{e.rnc}</strong></div>
            {e.direccion && <div>{e.direccion}</div>}
            {e.telefono  && <div>Tel: {e.telefono}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: serif, fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: headerColor, marginBottom: 8 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 11, color: "#444", lineHeight: 2.1, fontFamily: mono }}>
            <div><strong>e-NCF:</strong> {factura.eCF}</div>
            {factura.eCFRef && <div><strong>Ref. e-CF:</strong> {factura.eCFRef}</div>}
            <div><strong>Fecha:</strong> {fmtDate(factura.fecha)}</div>
            <div><strong>Venc. NCF:</strong> {fmtDate(factura.vencimientoECF)}</div>
            <div><strong>Terminos:</strong> {factura.terminos === "Contado" ? "Contado" : ("Credito " + factura.terminos)}</div>
            {factura.metodoPago && <div><strong>Pago:</strong> {factura.metodoPago}</div>}
          </div>
        </div>
      </div>

      {/* Nota banner */}
      {esNota && (
        <div style={{ background: esCredito ? "#f0faf4" : "#fffbeb", border: ("1px solid " + headerColor), borderRadius: 4, padding: "10px 14px", marginBottom: 14, fontSize: 11, textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: headerColor }}>{titulo}</div>
          {factura.eCFRef && (
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
              Modifica e-CF: <strong style={{ fontFamily: mono }}>{factura.eCFRef}</strong>
              {factura.motivoNota ? (" -- " + factura.motivoNota) : ""}
            </div>
          )}
        </div>
      )}

      {/* Cliente */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "12px 16px", marginBottom: 16, fontSize: 11, lineHeight: 1.9 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Cliente
        </div>
        {factura.esConsumidorFinal ? (
          <>
            <div><strong>Consumidor Final</strong></div>
            {factura.nombreConsumidor   && <div>{factura.nombreConsumidor}</div>}
            {factura.telefonoConsumidor && <div>Tel: {factura.telefonoConsumidor}</div>}
          </>
        ) : (
          <>
            <div><strong>{cliente?.nombre}</strong></div>
            {cliente?.rnc      && <div>RNC: <span style={{ fontFamily: mono }}>{cliente.rnc}</span></div>}
            {cliente?.direccion && <div>{cliente.direccion}{cliente.ciudad ? (", " + cliente.ciudad) : ""}</div>}
            {cliente?.telefono  && <div>Tel: {cliente.telefono}</div>}
          </>
        )}
      </div>

      {/* Tabla — Cant | Descripcion | PAX | Modo | Precio | Desc. | ITBIS | Total */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 11 }}>
        <thead>
          <tr style={{ background: headerColor }}>
            {[
              { h: "Cant.", align: "center" },
              { h: "Descripcion / Servicio", align: "left" },
              { h: "PAX", align: "center" },
              { h: "Modo", align: "left" },
              { h: "Precio", align: "right" },
              { h: "Desc. RD$", align: "right" },
              { h: "ITBIS", align: "right" },
              { h: "Total", align: "right" },
            ].map(({ h, align }, i) => (
              <th key={h} style={{ padding: "8px 10px", color: "#fff", fontSize: 10, fontWeight: 600, textAlign: align as "left" | "right" | "center", borderRight: i < 7 ? "1px solid rgba(255,255,255,0.12)" : "none" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factura.items.map((item: LineaServicio, i: number) => {
            const c = calcLinea(item);
            const precioLabel = item.modo === "por_grupo"
              ? ("RD$ " + fmt(item.precio) + " (grupo)")
              : ("RD$ " + fmt(item.precio) + "/p.");
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {/* Cant = 1 siempre */}
                <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: mono, fontWeight: 700 }}>1</td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ fontWeight: 500 }}>{item.descripcion}</div>
                  {item.tramoLabel && <div style={{ fontSize: 9, color: "#9ca3af" }}>{item.tramoLabel}</div>}
                  {item.fechaTour  && <div style={{ fontSize: 9, color: "#6b7280" }}>{"Fecha: " + fmtDate(item.fechaTour)}</div>}
                </td>
                {/* PAX = numero de personas */}
                <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: mono, fontWeight: 700, color: "#0e7490", fontSize: 13 }}>
                  {item.pax || item.cant}
                </td>
                <td style={{ padding: "8px 10px", color: "#6b7280", fontSize: 10 }}>
                  {item.modo === "por_grupo" ? "Por Grupo" : "Por Persona"}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, fontSize: 10, color: "#374151" }}>{precioLabel}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono }}>
                  {c.descAmt > 0 ? <span style={{ color: "#dc2626" }}>{fmt(c.descAmt)}</span> : <span style={{ color: "#d1d5db" }}>---</span>}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, color: "#1d4ed8" }}>
                  {item.itbis > 0 ? fmt(c.itbisAmt) : "Exento"}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmt(c.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
        <div style={{ width: 300, fontSize: 11 }}>
          {[
            { l: "Total Bruto",  v: fmt(t.bruto), c: "#374151" },
            { l: "Descuentos",   v: fmt(t.desc),  c: "#dc2626" },
            { l: "Sub Total",    v: fmt(t.sub),   c: "#374151" },
            { l: "Total ITBIS",  v: fmt(t.itbis), c: "#1d4ed8" },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ color: "#555" }}>{l}:</span>
              <span style={{ fontFamily: mono, fontWeight: 600, color: c }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", background: headerColor, borderRadius: 3, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "#fff" }}>TOTAL RD$:</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: "#fff" }}>{fmt(t.total)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {factura.notas && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "10px 14px", marginBottom: 20, fontSize: 11, color: "#92400e" }}>
          <div style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notas</div>
          {factura.notas}
        </div>
      )}

      {/* Firma centrada */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 52, borderTop: "1px solid #d1d5db", marginBottom: 16 }}>
        <div style={{ width: "42%", textAlign: "center" }}>
          <div style={{ height: 1, background: "#374151", marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: "#555" }}>{e.firmaVendedor || "Preparado por"}</div>
          <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>Firma Autorizada</div>
        </div>
      </div>

      {/* QR */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ width: 80, height: 80, flexShrink: 0 }}>
          {factura.urlQR
            ? <QRCodeSVG value={factura.urlQR} size={80} level="M" />
            : <div style={{ width: 80, height: 80, border: "2px dashed #9ca3af", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
                <span style={{ fontSize: 26 }}>&#9638;</span>
                <span style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>QR DGII</span>
              </div>
          }
        </div>
        <div style={{ fontSize: 10, color: "#555", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: "#374151" }}>Codigo de Seguridad DGII</div>
          {factura.codigoSeguridad && (
            <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#111", letterSpacing: "0.1em" }}>
              {factura.codigoSeguridad}
            </div>
          )}
          <div>Escanea para verificar en <strong>ecf.dgii.gov.do</strong></div>
          {!factura.urlQR && (
            <div style={{ fontStyle: "italic", color: "#9ca3af" }}>(Disponible tras firma digital)</div>
          )}
        </div>
      </div>

      {/* Pie */}
      <div style={{ paddingTop: 10, borderTop: "1px dashed #d1d5db", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9ca3af" }}>
        <div>Comprobante Fiscal Electronico (e-CF) emitido conforme a DGII</div>
        <div>Verifique en ecf.dgii.gov.do</div>
      </div>
    </div>
  );
}