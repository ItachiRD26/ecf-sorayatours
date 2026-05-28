"use client";

import type { Factura } from "@/types";
import { fmt, fmtDate, calcLinea, calcTotales } from "@/types";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  factura: Factura;
  cliente: import("@/types").Cliente | undefined;
  empresa?: { nombre: string; rnc: string; direccion: string; telefono: string; };
}

const DEFAULT_EMPRESA = {
  nombre:    "SORAYA Y LEONARDO TOURS SRL",
  rnc:       "1-31217656-6",
  direccion: "Playa Juan de Bolanos Bugalow #3, Montecristi",
  telefono:  "809-961-6343",
};

export default function FacturaTermica({ factura, cliente, empresa = DEFAULT_EMPRESA }: Props) {
  const t   = calcTotales(factura.items);
  const now = new Date().toLocaleString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const line = "--------------------------------";
  const e   = { ...DEFAULT_EMPRESA, ...empresa };

  return (
    <div style={{ width: "100%", maxWidth: 332, margin: "0 auto", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 12, lineHeight: 1.7, color: "#000", background: "#fff", padding: "12px 8px" }}>

      {/* Empresa */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{e.nombre}</div>
        <div style={{ fontSize: 11 }}>RNC: {e.rnc}</div>
        {e.direccion && <div style={{ fontSize: 10 }}>{e.direccion}</div>}
        {e.telefono  && <div style={{ fontSize: 10 }}>Tel: {e.telefono}</div>}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, marginBottom: 8 }}>{line}</div>

      {/* Tipo comprobante */}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>
          {factura.tipoECF === "E32" ? "FACTURA DE CONSUMO (E32)" : `COMPROBANTE FISCAL (${factura.tipoECF})`}
        </div>
        <div style={{ fontSize: 11 }}>e-CF: {factura.eCF}</div>
        <div style={{ fontSize: 11 }}>Fecha: {fmtDate(factura.fecha)}</div>
        <div style={{ fontSize: 11 }}>Hora: {factura.hora ?? now.split(",")[1]?.trim()}</div>
      </div>

      <div style={{ fontSize: 11, marginBottom: 4 }}>{line}</div>

      {/* Cliente */}
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>Cliente:</div>
        {factura.esConsumidorFinal ? (
          <>
            <div>{factura.nombreConsumidor || "Consumidor Final"}</div>
            {factura.telefonoConsumidor && <div>Tel: {factura.telefonoConsumidor}</div>}
          </>
        ) : (
          <>
            <div>{cliente?.nombre ?? "—"}</div>
            {cliente?.rnc      && <div>RNC: {cliente.rnc}</div>}
            {cliente?.telefono && <div>Tel: {cliente.telefono}</div>}
          </>
        )}
      </div>

      <div style={{ fontSize: 11, marginBottom: 4 }}>{line}</div>

      {/* Items */}
      <div style={{ marginBottom: 6 }}>
        {factura.items.map((item, i) => {
          const c = calcLinea(item);
          return (
            <div key={i} style={{ marginBottom: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 600 }}>{item.descripcion}</div>
              {item.tramoLabel && <div style={{ fontSize: 10, color: "#555" }}>  Tramo: {item.tramoLabel}</div>}
              {item.fechaTour  && <div style={{ fontSize: 10, color: "#555" }}>  Fecha: {fmtDate(item.fechaTour)}</div>}
              {item.modo === "por_grupo" ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>  {item.cant} pers. (grupo)</span>
                  <span style={{ fontWeight: 600 }}>{fmt(item.precio)}</span>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>  {item.cant} × {fmt(item.precio)}/p.</span>
                  <span style={{ fontWeight: 600 }}>{fmt(item.precio * item.cant)}</span>
                </div>
              )}
              {c.descAmt > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                  <span>  Descuento</span>
                  <span>-{fmt(c.descAmt)}</span>
                </div>
              )}
              {item.itbis > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#555" }}>
                  <span>  ITBIS ({item.itbis * 100}%)</span>
                  <span>+{fmt(c.itbisAmt)}</span>
                </div>
              )}
              {item.itbis === 0 && <div style={{ fontSize: 10, color: "#666" }}>  (Exento de ITBIS)</div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px dashed #ccc", marginTop: 2, paddingTop: 2 }}>
                <span>  Subtotal</span>
                <span>{fmt(c.total)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, marginBottom: 4 }}>{line}</div>

      {/* Totales */}
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        {t.desc > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#dc2626" }}>
            <span>Descuentos</span><span>-RD$ {fmt(t.desc)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span>Sub Total</span><span>RD$ {fmt(t.sub)}</span>
        </div>
        {t.itbis > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span>ITBIS</span><span>RD$ {fmt(t.itbis)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14, marginTop: 4, borderTop: "1px solid #000", paddingTop: 4 }}>
          <span>TOTAL RD$</span><span>{fmt(t.total)}</span>
        </div>
      </div>

      <div style={{ fontSize: 11, marginBottom: 4 }}>{line}</div>

      {/* Pago */}
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Método de pago</span>
          <span style={{ fontWeight: 600 }}>{factura.metodoPago ?? "—"}</span>
        </div>
        {factura.terminos && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Términos</span>
            <span>{factura.terminos === "Contado" ? "Contado" : `Crédito ${factura.terminos}`}</span>
          </div>
        )}
      </div>

      {/* QR */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ display: "inline-block", margin: "0 auto 4px" }}>
          {factura.urlQR
            ? <QRCodeSVG value={factura.urlQR} size={80} level="M" />
            : <div style={{ display: "inline-flex", width: 72, height: 72, border: "2px dashed #aaa", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26 }}>▦</div>
                  <div style={{ fontSize: 8, color: "#666" }}>QR DGII</div>
                </div>
              </div>
          }
        </div>
        {factura.codigoSeguridad && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 2 }}>
            {factura.codigoSeguridad}
          </div>
        )}
        <div style={{ fontSize: 9, color: "#666" }}>Verifique en ecf.dgii.gov.do</div>
      </div>

      <div style={{ fontSize: 11, marginBottom: 4 }}>{line}</div>

      <div style={{ textAlign: "center", fontSize: 10, lineHeight: 1.9 }}>
        <div>Comprobante Fiscal Electrónico</div>
        <div>Soraya & Leonardo Tours SRL</div>
        <div style={{ marginTop: 6, fontWeight: 600 }}>¡Gracias por preferirnos!</div>
      </div>
    </div>
  );
}