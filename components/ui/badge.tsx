type TipoBadge = "success" | "warning" | "danger" | "info" | "neutral";

const TIPO_STYLES: Record<TipoBadge, { bg: string; color: string; border: string }> = {
  success: { bg: "#f0faf4", color: "#166534", border: "#bbf7d0" },
  warning: { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  danger:  { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  info:    { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  neutral: { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" },
};

interface BadgeProps {
  tipo?:     TipoBadge;
  estado?:   string;
  children?: React.ReactNode;
}

const ESTADO_MAP: Record<string, TipoBadge> = {
  pagada:     "success",
  pendiente:  "warning",
  anulada:    "danger",
  vigente:    "info",
  vencida:    "danger",
  convertida: "neutral",
  activo:     "success",
  inactivo:   "neutral",
};

export default function Badge({ tipo, estado, children }: BadgeProps) {
  const resolvedTipo: TipoBadge =
    tipo ?? (estado ? (ESTADO_MAP[estado] ?? "neutral") : "neutral");

  const s = TIPO_STYLES[resolvedTipo];
  const label = children ?? estado ?? "";

  return (
    <span style={{
      background:    s.bg,
      color:         s.color,
      border:        `1px solid ${s.border}`,
      padding:       "2px 10px",
      borderRadius:  4,
      fontSize:      11,
      fontWeight:    600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      fontFamily:    "var(--font-sans)",
      whiteSpace:    "nowrap",
      display:       "inline-block",
    }}>
      {label}
    </span>
  );
}