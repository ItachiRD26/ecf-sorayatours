"use client";

import { useEffect, useState } from "react";
import { createPortal }        from "react-dom";
import Icon from "@/components/ui/icon";

const sans  = "var(--font-sans)";
const serif = "var(--font-serif)";

interface Props {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  width?:   number;
}

export default function Modal({ title, onClose, children, width = 520 }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Bloquear scroll del body
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!mounted) return null;

  const content = (
    <>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop — cubre TODO el viewport incluyendo sidebar */}
      <div
        onClick={onClose}
        style={{
          position:             "fixed",
          top:                  0,
          left:                 0,
          width:                "100vw",
          height:               "100vh",
          background:           "rgba(0,0,0,0.55)",
          zIndex:               9000,
          backdropFilter:       "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          animation:            "backdropIn 0.15s ease both",
        }}
      />

      {/* Scroll container — también cubre todo el viewport */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position:       "fixed",
          top:            0,
          left:           0,
          width:          "100vw",
          height:         "100vh",
          zIndex:         9001,
          overflowY:      "auto",
          overflowX:      "hidden",
          display:        "flex",
          justifyContent: "center",
          alignItems:     "flex-start",
          padding:        "32px 16px",
          boxSizing:      "border-box",
        }}
      >
        {/* Panel del modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position:     "relative",
            background:   "#fff",
            borderRadius: 6,
            width:        "100%",
            maxWidth:     width,
            margin:       "auto",
            boxShadow:    "0 32px 80px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.12)",
            border:       "1px solid #e5e7eb",
            animation:    "modalIn 0.18s ease both",
            flexShrink:   0,
          }}
        >
          {/* Header */}
          <div style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            padding:        "18px 24px",
            borderBottom:   "1px solid #e5e7eb",
            position:       "sticky",
            top:            0,
            background:     "#fff",
            zIndex:         10,
            borderRadius:   "6px 6px 0 0",
          }}>
            <div style={{ fontFamily: serif, fontSize: 17, fontWeight: 700, color: "#111" }}>
              {title}
            </div>
            <button
              onClick={onClose}
              style={{
                background:   "none",
                border:       "1px solid transparent",
                borderRadius: 4,
                cursor:       "pointer",
                color:        "#9ca3af",
                display:      "flex",
                padding:      6,
                transition:   "all 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background  = "#fef2f2";
                e.currentTarget.style.color       = "#dc2626";
                e.currentTarget.style.borderColor = "#fecaca";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background  = "none";
                e.currentTarget.style.color       = "#9ca3af";
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 24, fontFamily: sans }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );

  // createPortal → renderiza directo en <body>, escapa cualquier contenedor
  return createPortal(content, document.body);
}