"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const sans = "var(--font-sans)";
type Tipo = "warning" | "error" | "info";

interface AlertaConfig {
  mensaje:   string;
  titulo?:   string;
  tipo?:     Tipo;
  duracion?: number;
}

const ESTILOS: Record<Tipo, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
  warning: {
    bg: "#fffbeb", border: "#fde68a", color: "#92400e",
    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  error: {
    bg: "#fef2f2", border: "#fecaca", color: "#991b1b",
    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  },
  info: {
    bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8",
    icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  },
};

export function useAlerta() {
  const [alerta,  setAlerta]  = useState<AlertaConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current)  clearTimeout(fadeRef.current);
  }, []);

  const mostrar = useCallback((config: AlertaConfig | string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current)  clearTimeout(fadeRef.current);
    const cfg: AlertaConfig = typeof config === "string"
      ? { mensaje: config, tipo: "warning", duracion: 4000 }
      : { tipo: "warning", duracion: 4000, ...config };
    setAlerta(cfg);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      fadeRef.current = setTimeout(() => setAlerta(null), 300);
    }, cfg.duracion ?? 4000);
  }, []);

  const cerrar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    fadeRef.current = setTimeout(() => setAlerta(null), 300);
  }, []);

  const alertaContent = alerta ? (() => {
    const est = ESTILOS[alerta.tipo ?? "warning"];
    return (
      <div role="alert" style={{
        position: "fixed", top: 20, right: 20, zIndex: 99999,
        maxWidth: 380, minWidth: 280,
        background: est.bg, border: `1px solid ${est.border}`, borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "12px 14px",
        display: "flex", alignItems: "flex-start", gap: 10,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        pointerEvents: visible ? "auto" : "none",
      }}>
        <div style={{ flexShrink: 0, marginTop: 1 }}>{est.icon}</div>
        <div style={{ flex: 1 }}>
          {alerta.titulo && (
            <div style={{ fontSize: 12, fontWeight: 700, color: est.color, fontFamily: sans, marginBottom: 2 }}>
              {alerta.titulo}
            </div>
          )}
          <div style={{ fontSize: 12, color: est.color, fontFamily: sans, lineHeight: 1.5 }}>
            {alerta.mensaje}
          </div>
        </div>
        <button onClick={cerrar}
          style={{ background: "none", border: "none", cursor: "pointer", color: est.color, opacity: 0.6, flexShrink: 0, padding: "0 2px", display: "flex", marginTop: 1 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    );
  })() : null;

  const AlertaUI = mounted && alertaContent
    ? createPortal(alertaContent, document.body)
    : null;

  return { mostrar, cerrar, AlertaUI };
}