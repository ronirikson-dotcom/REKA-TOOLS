import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AppError, ForbiddenError, UnauthorizedError, toUserMessage } from "@/server/errors";
import { contextFromToken, SESSION_COOKIE } from "@/server/auth/session";
import type { AuthContext } from "@/server/auth/context";

/**
 * Autentikasi API: Bearer token (integrasi/mobile) atau cookie session (web).
 * Request cookie-based yang mengubah data wajib berasal dari origin yang sama (proteksi CSRF).
 */
export async function apiContext(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
  const ctx = await contextFromToken(token);
  if (!ctx) throw new UnauthorizedError();
  if (!bearer && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new ForbiddenError("Origin request tidak valid");
  }
  return ctx;
}

type Handler<P> = (req: Request, ctx: AuthContext, params: P) => Promise<unknown>;

export function api<P = Record<string, string>>(fn: Handler<P>, successStatus = 200) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const ctx = await apiContext(req);
      const data = await fn(req, ctx, await route.params);
      if (data instanceof Response) return data;
      return NextResponse.json({ data }, { status: successStatus });
    } catch (err) {
      const status = err instanceof AppError ? err.status : (err as { issues?: unknown })?.issues ? 422 : 500;
      const code = err instanceof AppError ? err.code : status === 422 ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
      return NextResponse.json({ error: { code, message: toUserMessage(err) } }, { status });
    }
  };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function query(req: Request) {
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k);
  return { get, page: Number(get("page") ?? 1) || 1, pageSize: Number(get("pageSize") ?? 25) || 25, q: get("q") };
}
