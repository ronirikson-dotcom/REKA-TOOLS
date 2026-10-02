import { z } from "zod";

/** String opsional dari form: "" -> null */
export const optStr = z.string().nullable().optional()
  .transform((v) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === "" ? null : t;
  });

export const reqStr = (label: string) => z.string({ error: `${label} wajib diisi` }).trim().min(1, `${label} wajib diisi`);

export const optUuid = z.string().nullable().optional()
  .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "ID tidak valid");

export const reqUuid = (label: string) => z.uuid({ error: `${label} wajib dipilih` });

export const num = (label: string) =>
  z.coerce.number({ error: `${label} harus berupa angka` }).refine((n) => Number.isFinite(n), `${label} tidak valid`);

export const nonNeg = (label: string) => num(label).refine((n) => n >= 0, `${label} tidak boleh negatif`);
export const positive = (label: string) => num(label).refine((n) => n > 0, `${label} harus lebih dari 0`);

export const optNum = z.union([z.string(), z.number()]).nullable().optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "Angka tidak valid");

export const optInt = optNum.refine((v) => v === null || Number.isInteger(v), "Harus bilangan bulat");

export const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} tidak valid (YYYY-MM-DD)`);
export const optDate = z.string().nullable().optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Tanggal tidak valid");

export const reason = z.string({ error: "Alasan wajib diisi" }).trim().min(3, "Alasan wajib diisi (min. 3 karakter)");

/** Terima alasan sebagai string atau objek { reason } */
export function parseReason(raw: unknown): string {
  const value = raw && typeof raw === "object" && "reason" in raw ? (raw as { reason: unknown }).reason : raw;
  return reason.parse(value);
}

export const bool = z.union([z.boolean(), z.string()]).nullable().optional()
  .transform((v) => v === true || v === "true" || v === "on" || v === "1");

export type ListParams = { q?: string | null; page?: number; pageSize?: number };

export function pageArgs(params: ListParams) {
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
  const page = Math.max(params.page ?? 1, 1);
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

export function likeQ(q?: string | null) {
  const t = (q ?? "").trim();
  return t ? `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
}
