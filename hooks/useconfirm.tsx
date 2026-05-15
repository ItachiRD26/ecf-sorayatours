"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  titulo:     string;
  mensaje:    string;
  btnOk?:     string;
  btnCancel?: string;
  peligro?:   boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [state,   setState]   = useState<ConfirmState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => { setState({ ...options, resolve }); });
  }, []);

  const handleConfirm = useCallback(() => { state?.resolve(true);  setState(null); }, [state]);
  const handleCancel  = useCallback(() => { state?.resolve(false); setState(null); }, [state]);

  const confirmContent = state ? (
    <>
      <div onClick={handleCancel} style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.35)", zIndex: 99998,
      }} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, pointerEvents: "none",
      }}>
        <div style={{
          background: "#fff", borderRadius: 4, width: "100%", maxWidth: 420,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)", border: "1px solid #e5e7eb",
          overflow: "hidden", pointerEvents: "all",
        }}>
          <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 700, color: state.peligro ? "#991b1b" : "#111" }}>
              {state.titulo}
            </div>
          </div>
          <div style={{ padding: "16px 24px", fontSize: 13, color: "#374151", fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>
            {state.mensaje}
          </div>
          <div style={{ padding: "14px 24px", display: "flex", gap: 8, justifyContent: "flex-end", background: "#f9fafb", borderTop: "1px solid #f3f4f6" }}>
            <button onClick={handleCancel}
              style={{ padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              {state.btnCancel ?? "Cancelar"}
            </button>
            <button onClick={handleConfirm}
              style={{ padding: "8px 18px", background: state.peligro ? "#dc2626" : "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)" }}>
              {state.btnOk ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </>
  ) : null;

  const ConfirmUI = mounted && confirmContent
    ? createPortal(confirmContent, document.body)
    : null;

  return { confirm, ConfirmUI };
}