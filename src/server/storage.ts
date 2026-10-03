import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Penyimpanan file (foto kendaraan, evidence approval).
 * - Supabase Storage (bucket privat) bila SUPABASE_URL + SUPABASE_SECRET_KEY diset — wajib di Vercel/serverless.
 * - Selain itu folder lokal STORAGE_DIR (development / server Node biasa).
 * Path yang disimpan di database sama untuk kedua mode: `<companyId>/<yyyymm>/<uuid>.<ext>`.
 */
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const STORAGE_PATH = /^[0-9a-f-]{36}\/\d{6}\/[0-9a-f-]{36}(\.[a-z0-9]+)?$/;

export type UploadFile = { fileName: string; mimeType: string; data: Buffer };

type SupabaseStorage = { url: string; key: string; bucket: string };

function supabaseStorage(): SupabaseStorage | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "wms-files" };
}

/** Secret key baru (`sb_secret_...`) cukup di header apikey; key JWT lama (service_role) juga dikirim sebagai Bearer */
function authHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function objectUrl(s: SupabaseStorage, storagePath: string) {
  return `${s.url}/storage/v1/object/${encodeURIComponent(s.bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export async function saveFile(companyId: string, file: UploadFile): Promise<string> {
  if (!ALLOWED.includes(file.mimeType)) throw new ValidationError(`Tipe file ${file.mimeType} tidak didukung (gunakan JPG/PNG/WEBP/PDF)`);
  if (file.data.length > MAX_FILE_BYTES) throw new ValidationError("Ukuran file maksimal 5MB");
  const ext = path.extname(file.fileName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const now = new Date();
  const rel = path.posix.join(companyId, `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`, `${randomUUID()}${ext}`);

  const remote = supabaseStorage();
  if (remote) {
    const res = await fetch(objectUrl(remote, rel), {
      method: "POST",
      headers: { ...authHeaders(remote.key), "content-type": file.mimeType, "x-upsert": "false", "cache-control": "3600" },
      body: new Uint8Array(file.data),
    });
    if (!res.ok) throw new Error(`Upload ke Supabase Storage gagal (${res.status}): ${await res.text()}`);
    return rel;
  }
  // Filesystem Vercel read-only: tanpa Supabase Storage upload tidak bisa disimpan permanen
  if (process.env.VERCEL) throw new ValidationError("Penyimpanan file belum dikonfigurasi (set SUPABASE_URL dan SUPABASE_SECRET_KEY)");

  const abs = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(abs), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ abs, file.data);
  return rel;
}

export async function loadFile(storagePath: string): Promise<Buffer> {
  const remote = supabaseStorage();
  if (remote) {
    if (!STORAGE_PATH.test(storagePath)) throw new ValidationError("Path tidak valid");
    const res = await fetch(objectUrl(remote, storagePath), { headers: authHeaders(remote.key) });
    if (res.status === 400 || res.status === 404) throw new NotFoundError("File");
    if (!res.ok) throw new Error(`Unduh dari Supabase Storage gagal (${res.status}): ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const abs = path.resolve(/*turbopackIgnore: true*/ ROOT, storagePath);
  if (!abs.startsWith(ROOT + path.sep)) throw new ValidationError("Path tidak valid");
  return readFile(/*turbopackIgnore: true*/ abs);
}
