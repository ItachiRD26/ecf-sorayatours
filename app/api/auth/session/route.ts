import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const SESSION_COOKIE  = "__session";
const SESSION_MS      = parseInt(process.env.SESSION_DURATION_MS ?? "432000000");
const SESSION_SECONDS = Math.floor(SESSION_MS / 1000);
const IS_PROD         = process.env.NODE_ENV === "production";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.idToken || typeof body.idToken !== "string")
      return NextResponse.json({ error: "ID token requerido" }, { status: 400 });

    const decoded  = await adminAuth.verifyIdToken(body.idToken);
    const tokenAge = Date.now() / 1000 - decoded.iat;
    if (tokenAge > 300)
      return NextResponse.json({ error: "Token expirado. Inicia sesión nuevamente." }, { status: 401 });

    const user = await adminAuth.getUser(decoded.uid);
    if (user.disabled)
      return NextResponse.json({ error: "Cuenta deshabilitada. Contacta al administrador." }, { status: 403 });

    const sessionCookie = await adminAuth.createSessionCookie(body.idToken, { expiresIn: SESSION_MS });

    import("@/lib/firebase-admin")
      .then(({ adminDb }) =>
        adminDb.collection("usuarios").doc(decoded.uid)
          .set({ ultimoAcceso: new Date().toISOString() }, { merge: true })
          .catch(console.error)
      ).catch(console.error);

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      maxAge: SESSION_SECONDS, httpOnly: true,
      secure: IS_PROD, sameSite: "lax", path: "/",
    });
    return response;
  } catch (error: unknown) {
    console.error("[POST /api/auth/session]", error);
    const code = (error as { code?: string }).code ?? "";
    const messages: Record<string, string> = {
      "auth/id-token-expired": "Sesión expirada. Inicia sesión nuevamente.",
      "auth/invalid-id-token": "Token inválido.",
      "auth/user-not-found":   "Usuario no encontrado.",
      "auth/user-disabled":    "Cuenta deshabilitada.",
    };
    return NextResponse.json({ error: messages[code] ?? "Error al crear sesión" }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie).catch(() => null);
      if (decoded) await adminAuth.revokeRefreshTokens(decoded.uid).catch(console.error);
    }
  } catch { /* silenciar */ }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: IS_PROD, sameSite: "lax", path: "/",
  });
  return response;
}