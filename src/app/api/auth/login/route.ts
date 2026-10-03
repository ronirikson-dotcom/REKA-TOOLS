import { NextResponse } from "next/server";
import { login } from "@/server/services/auth";
import { toUserMessage, AppError } from "@/server/errors";
import { setSessionCookie } from "@/server/auth/session";

/** POST /api/auth/login { identifier, password } -> { token, expiresAt } (Bearer untuk integrasi) */
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { identifier?: string; password?: string };
    const res = await login(b.identifier ?? "", b.password ?? "", {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    await setSessionCookie(res.token, res.expiresAt);
    return NextResponse.json({ data: { token: res.token, expiresAt: res.expiresAt } });
  } catch (err) {
    return NextResponse.json({ error: { message: toUserMessage(err) } }, { status: err instanceof AppError ? err.status : 500 });
  }
}
