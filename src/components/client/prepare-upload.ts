/**
 * Kecilkan foto di browser sebelum dikirim ke server action. Foto kamera HP bisa 3–8 MB,
 * sedangkan body request di Vercel dibatasi 4,5 MB per kiriman.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const SHRINK_ABOVE_BYTES = 400 * 1024;
/** Batas total satu kiriman (sisa ruang untuk field lain di bawah limit 4,5 MB Vercel) */
export const MAX_SUBMIT_BYTES = 4 * 1024 * 1024;

async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Format yang tidak bisa dibaca browser (mis. HEIC di Chrome) dikirim apa adanya
    return file;
  }
}

/** Kembalikan FormData dengan foto yang sudah dikecilkan, atau `tooLarge` bila total masih melebihi batas */
export async function prepareUpload(fd: FormData): Promise<{ fd: FormData; tooLarge: boolean }> {
  const hasFiles = [...fd.values()].some((v) => typeof v !== "string" && v.size > 0);
  if (!hasFiles) return { fd, tooLarge: false };
  const out = new FormData();
  let total = 0;
  for (const [key, value] of fd.entries()) {
    if (typeof value === "string") {
      out.append(key, value);
      total += value.length;
    } else {
      const file = value.size > 0 ? await shrinkImage(value) : value;
      out.append(key, file);
      total += file.size;
    }
  }
  return { fd: out, tooLarge: total > MAX_SUBMIT_BYTES };
}
