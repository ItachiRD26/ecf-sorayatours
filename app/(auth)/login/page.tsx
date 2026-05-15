"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

const sans  = "var(--font-sans)";
const mono  = "var(--font-mono)";
const serif = "var(--font-serif)";

export default function LoginPage() {
  const router   = useRouter();
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, pass);
      const idToken    = await credential.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al crear sesión");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("INVALID_LOGIN_CREDENTIALS")) {
        setError("Credenciales incorrectas. Verifica tu email y contraseña.");
      } else if (msg.includes("too-many-requests")) {
        setError("Demasiados intentos. Espera unos minutos.");
      } else {
        setError(msg || "Error al ingresar. Intenta de nuevo.");
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "40px 36px", width: "100%", maxWidth: 380,
      boxShadow: "0 4px 24px rgba(0,0,0,0.07)", fontFamily: sans,
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "#0e7490",
          display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
        }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l1-4s2-3 8-3 8 3 8 3l1 4"/>
            <path d="M3 17s2 2 9 2 9-2 9-2"/>
            <circle cx={12} cy={7} r={3}/>
          </svg>
        </div>
        <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
          Soraya & Leonardo Tours
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, fontFamily: mono }}>
          RNC 1-31217656-6 · Montecristi
        </div>
        <div style={{
          marginTop: 10, display: "inline-block", background: "#ecfeff", color: "#0e7490",
          border: "1px solid #a5f3fc", padding: "2px 10px", borderRadius: 3,
          fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
        }}>
          EMISOR ELECTRÓNICO
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
            Correo electrónico
          </label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@ejemplo.com"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
            Contraseña
          </label>
          <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111", outline: "none", fontFamily: sans, background: "#fff" }} />
        </div>

        {error && (
          <div style={{ padding: "9px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, fontSize: 12, color: "#991b1b" }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          style={{ padding: "11px", background: loading ? "#9ca3af" : "#0e7490", color: "#fff", border: "none", borderRadius: 4, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: sans, transition: "background 0.15s" }}>
          {loading ? "Ingresando..." : "Ingresar al sistema"}
        </button>
      </form>
    </div>
  );
}