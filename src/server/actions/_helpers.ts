import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext } from "@/server/auth/session";
import type { AuthContext } from "@/server/auth/context";
import { toUserMessage } from "@/server/errors";
import type { UploadFile } from "@/server/storage";

export type ActionState = { ok: boolean; message?: string; error?: string; data?: Record<string, unknown> } | null;

type ActOptions<T> = {
  revalidate?: string[];
  redirect?: string | ((result: T) => string);
  success?: string | ((result: T) => string);
  data?: (result: T) => Record<string, unknown>;
};

/** Jalankan service dengan context login, tangani error menjadi pesan yang ramah user */
export async function act<T>(fn: (ctx: AuthContext) => Promise<T>, opts: ActOptions<T> = {}): Promise<ActionState> {
  let result: T;
  try {
    const ctx = await actionContext();
    result = await fn(ctx);
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
  for (const p of opts.revalidate ?? ["/", "layout"]) {
    if (p === "layout") revalidatePath("/", "layout");
    else revalidatePath(p);
  }
  if (opts.redirect) redirect(typeof opts.redirect === "function" ? opts.redirect(result) : opts.redirect);
  const message = typeof opts.success === "function" ? opts.success(result) : (opts.success ?? "Berhasil disimpan");
  return { ok: true, message, data: opts.data?.(result) };
}

/** FormData -> object (nilai terakhir menang, abaikan field internal Next) */
export function formObj(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function payload<T = unknown>(fd: FormData): T {
  const raw = fd.get("payload");
  if (typeof raw !== "string" || !raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function files(fd: FormData, key: string): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  for (const v of fd.getAll(key)) {
    if (typeof v === "string" || !v || v.size === 0) continue;
    out.push({ fileName: v.name, mimeType: v.type || "application/octet-stream", data: Buffer.from(await v.arrayBuffer()) });
  }
  return out;
}
