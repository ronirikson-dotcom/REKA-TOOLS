export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Data") {
    super(`${entity} tidak ditemukan`, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki akses untuk aksi ini") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sesi berakhir, silakan login kembali") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export function invariant(condition: unknown, message: string, status = 422): asserts condition {
  if (!condition) throw new AppError(message, status, status === 422 ? "VALIDATION_ERROR" : "BAD_REQUEST");
}

/** Ubah error apa pun menjadi pesan yang aman ditampilkan ke user */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") return "Data duplikat: nilai unik sudah digunakan";
  if (pgCode === "23514") return "Transaksi ditolak karena melanggar aturan data (mis. stok tidak boleh negatif)";
  if (pgCode === "23503") return "Data masih terhubung dengan transaksi lain";
  console.error(err);
  return "Terjadi kesalahan pada server";
}
