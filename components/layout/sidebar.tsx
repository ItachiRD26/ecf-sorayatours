"use client";

import { createContext, useContext, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/contexts/AuthContext";

const NAV = [
  { href: "/dashboard",          label: "Dashboard",          icon: "dashboard" },
  { href: "/facturas",           label: "Facturas",           icon: "invoice"   },
  { href: "/cotizaciones",       label: "Cotizaciones",       icon: "quotes"    },
  { href: "/cuentas-por-cobrar", label: "Cuentas por Cobrar", icon: "alert"     },
  { href: "/clientes",           label: "Clientes",           icon: "clients"   },
  { href: "/servicios",          label: "Servicios",          icon: "products"  },
  { href: "/reportes",           label: "Reportes",           icon: "chart"     },
  { href: "/configuracion",      label: "Configuración",      icon: "settings"  },
];

const serif = "var(--font-serif)";
const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";

export const SidebarCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false, setOpen: () => {},
});
export const useSidebarCtx = () => useContext(SidebarCtx);

export default function Sidebar() {
  const pathname           = usePathname();
  const { perfil, logout } = useAuth();
  const { open, setOpen }  = useSidebarCtx();

  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  const active = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <>
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside
        className={`sidebar-responsive ${open ? "open" : ""}`}
        style={{
          width: 224, background: "#fff", borderRight: "1px solid #e5e7eb",
          display: "flex", flexDirection: "column", height: "100vh", flexShrink: 0,
        }}
      >
        {/* Marca */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: "#0e7490",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l1-4s2-3 8-3 8 3 8 3l1 4"/>
                <path d="M3 17s2 2 9 2 9-2 9-2"/>
                <circle cx={12} cy={7} r={3}/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
                Soraya & Leonardo
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: mono }}>Tours SRL</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: mono, marginBottom: 6 }}>
            RNC 1-31217656-6
          </div>
          <div style={{
            display: "inline-block", background: "#ecfeff", color: "#0e7490",
            border: "1px solid #a5f3fc", padding: "2px 8px", borderRadius: 3,
            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", fontFamily: sans,
          }}>
            EMISOR ELECTRÓNICO
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {NAV.map(({ href, label, icon }) => {
            const isActive = active(href);
            return (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 4,
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                background: isActive ? "#ecfeff" : "transparent",
                color: isActive ? "#0e7490" : "#6b7280",
                borderLeft: isActive ? "2px solid #0e7490" : "2px solid transparent",
                textDecoration: "none", fontFamily: sans, transition: "all 0.1s",
              }}>
                <Icon name={icon} size={14} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer usuario */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: sans }}>
              {perfil?.rol ?? "vendedor"}
            </div>
            <div style={{ fontSize: 12, color: "#374151", fontWeight: 500, fontFamily: sans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {perfil?.nombre ?? perfil?.email ?? "Cargando..."}
            </div>
          </div>
          <button
            onClick={logout}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: "none", border: "1px solid #e5e7eb", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#6b7280", fontFamily: sans }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#991b1b"; e.currentTarget.style.borderColor = "#fecaca"; e.currentTarget.style.background = "#fef2f2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "none"; }}
          >
            <Icon name="logout" size={13} />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}