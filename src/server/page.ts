import "server-only";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { requireContext } from "@/server/auth/session";
import type { AuthContext } from "@/server/auth/context";
import type { Permission } from "@/lib/permissions";

/** Jalankan loader halaman: NotFound -> 404, Forbidden -> halaman akses ditolak */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (e instanceof ForbiddenError) redirect(`/forbidden?m=${encodeURIComponent(e.message)}`);
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
}

/** Wajib login + salah satu permission */
export async function pageContext(...any: Permission[]): Promise<AuthContext> {
  const ctx = await requireContext();
  if (any.length && !any.some((p) => ctx.permissions.has(p))) {
    redirect(`/forbidden?m=${encodeURIComponent(`Membutuhkan permission: ${any.join(" / ")}`)}`);
  }
  return ctx;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function params(sp: SP) {
  const raw = await sp;
  const get = (k: string) => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };
  return {
    get,
    page: Math.max(1, Number(get("page") ?? 1) || 1),
    q: get("q") ?? "",
    all: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>,
  };
}
