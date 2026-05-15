"use client";

import { usePathname } from "next/navigation";
import { useSidebarCtx } from "@/components/layout/sidebar";

const LABELS: Record<string, string> = {
  "/dashboard":          "Dashboard",
  "/facturas":           "Facturas",
  "/cotizaciones":       "Cotizaciones",
  "/clientes":           "Clientes",
  "/servicios":          "Servicios",
  "/configuracion":      "Configuración",
  "/cuentas-por-cobrar": "Cuentas por Cobrar",
  "/reportes":           "Reportes",
};

function getLabel(pathname: string) {
  if (LABELS[pathname]) return LABELS[pathname];
  const match = Object.keys(LABELS).sort((a, b) => b.length - a.length).find((k) => pathname.startsWith(k));
  return match ? LABELS[match] : "";
}

export default function TopBar() {
  const pathname          = usePathname();
  const label             = getLabel(pathname);
  const { open, setOpen } = useSidebarCtx();

  const date = new Date().toLocaleDateString("es-DO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const dateDisplay = date.charAt(0).toUpperCase() + date.slice(1);

  return (
    <header style={{
      height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb",
      display: "flex", alignItems: "center", padding: "0 16px", flexShrink: 0, gap: 10,
    }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Abrir menú"
        className="hamburger-btn"
        style={{
          display: "none", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, background: "none",
          border: "1px solid #e5e7eb", borderRadius: 4, cursor: "pointer", flexShrink: 0,
        }}
      >
        <svg width={18} height={14} viewBox="0 0 18 14" fill="none">
          <rect x="0" y="0"  width="18" height="2" rx="1" fill="#374151" />
          <rect x="0" y="6"  width="18" height="2" rx="1" fill="#374151" />
          <rect x="0" y="12" width="18" height="2" rx="1" fill="#374151" />
        </svg>
      </button>
      <div style={{ flex: 1, fontSize: 12, color: "#6b7280", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
        {dateDisplay}
      </div>
    </header>
  );
}