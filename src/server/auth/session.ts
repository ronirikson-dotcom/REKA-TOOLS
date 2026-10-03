import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions } from "@/server/db/schema";
import { buildContext, type AuthContext } from "./context";
import { sha256 } from "./password";
import { UnauthorizedError } from "@/server/errors";

export const SESSION_COOKIE = "wms_session";

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Validasi token session dan bangun AuthContext */
export async function contextFromToken(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token) return null;
  const sessionId = sha256(token);
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
  });
  if (!session) return null;
  // Sliding update last_seen (maks tiap 5 menit)
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
  }
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  try {
    return await buildContext(session.userId, { activeBranchId: session.activeBranchId, sessionId, ...meta });
  } catch {
    return null;
  }
}

/** Context untuk server component / server action (cached per request) */
export const getContext = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  return contextFromToken(jar.get(SESSION_COOKIE)?.value);
});

/** Wajib login — redirect ke halaman login bila belum */
export async function requireContext(): Promise<AuthContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Untuk server action: lempar error (bukan redirect) agar bisa ditampilkan */
export async function actionContext(): Promise<AuthContext> {
  const ctx = await getContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export async function destroySession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function setActiveBranch(sessionId: string, branchId: string | null) {
  await db.update(sessions).set({ activeBranchId: branchId }).where(eq(sessions.id, sessionId));
}
