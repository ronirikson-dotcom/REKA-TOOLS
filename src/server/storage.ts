import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/server/errors";

/**
 * Penyimpanan file (foto kendaraan, evidence approval). Implementasi lokal (folder STORAGE_DIR);
 * untuk production dapat diganti object storage (Supabase Storage / S3) dengan interface yang sama.
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export type UploadFile = { fileName: string; mimeType: string; data: Buffer };

export async function saveFile(companyId: string, file: UploadFile): Promise<string> {
  if (!ALLOWED.includes(file.mimeType)) throw new ValidationError(`Tipe file ${file.mimeType} tidak didukung (gunakan JPG/PNG/WEBP/PDF)`);
  if (file.data.length > MAX_FILE_BYTES) throw new ValidationError("Ukuran file maksimal 5MB");
  const ext = path.extname(file.fileName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const now = new Date();
  const rel = path.join(companyId, `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`, `${randomUUID()}${ext}`);
  const abs = path.join(ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, file.data);
  return rel;
}

export async function loadFile(storagePath: string): Promise<Buffer> {
  const abs = path.resolve(ROOT, storagePath);
  if (!abs.startsWith(ROOT)) throw new ValidationError("Path tidak valid");
  return readFile(abs);
}
