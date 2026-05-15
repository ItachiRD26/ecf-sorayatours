"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

type TipoToast = "success" | "warning" | "error" | "info";

interface Toast {
  id:        string;
  tipo:      TipoToast;
  mensaje:   string;
  duracion?: number;
}

const COLORES: Record<TipoToast, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: "#f0faf4", border: "#86efac", color: "#166534", icon: "✓" },
  warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e", icon: "⚠" },
  error:   { bg: "#fef2f2", border: "#fecaca", color: "#991b1b", icon: "✕" },
  info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", icon: "i" },
};

export function useToast() {
  const [toasts,  setToasts]  = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, t.duracion ?? 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ToastContainer = mounted ? createPortal(
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      zIndex: 99999, display: "flex", flexDirection: "column",
      gap: 8, maxWidth: 340, pointerEvents: "none",
    }}>
      {toasts.map((t) => {
        const c = COLORES[t.tipo];
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6,
            padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)", pointerEvents: "all",
            animation: "slideInToast 0.2s ease",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: c.color, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ flex: 1, fontSize: 13, color: c.color, fontFamily: "var(--font-sans)", fontWeight: 500 }}>
              {t.mensaje}
            </span>
            <button onClick={() => dismiss(t.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: c.color, opacity: 0.6, fontSize: 16, padding: 0, flexShrink: 0, pointerEvents: "all" }}>
              ×
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body
  ) : null;

  return { push, dismiss, ToastContainer };
}