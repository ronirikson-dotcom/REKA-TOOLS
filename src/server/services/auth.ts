import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { passwordResetTokens, sessions, users } from "@/server/db/schema";
import { hashPassword, randomToken, sha256, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { AppError, ValidationError } from "@/server/errors";
import { writeAudit } from "./audit";
import type { AuthContext } from "@/server/auth/context";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

type Meta = { ip?: string | null; userAgent?: string | null };

export async function createSession(userId: string, activeBranchId: string | null, meta: Meta) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    activeBranchId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  return { token, expiresAt };
}

/** Login dengan email/username + password, dengan lockout setelah 5x gagal (SRS 4.3) */
export async function login(identifier: string, password: string, meta: Meta) {
  const ident = identifier.trim().toLowerCase();
  if (!ident || !password) throw new ValidationError("Username/email dan password wajib diisi");
  const user = await db.query.users.findFirst({
    where: and(or(sql`lower(${users.username}) = ${ident}`, sql`lower(${users.email}) = ${ident}`), isNull(users.deletedAt)),
  });
  const generic = new AppError("Username/email atau password salah", 401, "INVALID_CREDENTIALS");
  if (!user) throw generic;
  if (user.status !== "active") throw new AppError("Akun tidak aktif. Hubungi administrator.", 403, "INACTIVE");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi setelah ${user.lockedUntil.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`,
      423,
      "LOCKED",
    );
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
    await db.update(users).set({ failedLoginCount: lockedUntil ? 0 : failed, lockedUntil }).where(eq(users.id, user.id));
    await writeAudit(db, null, {
      companyId: user.companyId,
      userId: user.id,
      action: "LOGIN_FAILED",
      entity: "user",
      entityId: user.id,
      newValue: { failed, locked: !!lockedUntil, ip: meta.ip },
    });
    throw generic;
  }
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(user.id, user.branchId, meta);
  await writeAudit(db, null, {
    companyId: user.companyId,
    userId: user.id,
    branchId: user.branchId,
    action: "LOGIN",
    entity: "user",
    entityId: user.id,
    newValue: { ip: meta.ip, userAgent: meta.userAgent },
  });
  return { userId: user.id, ...session };
}

export async function logout(ctx: AuthContext) {
  if (ctx.sessionId) await db.delete(sessions).where(eq(sessions.id, ctx.sessionId));
  await writeAudit(db, ctx, { action: "LOGOUT", entity: "user", entityId: ctx.userId });
}

/** Membuat token reset password. Mengembalikan token (untuk dikirim via email) atau null bila user tidak ada. */
export async function requestPasswordReset(identifier: string) {
  const ident = identifier.trim().toLowerCase();
  const user = await db.query.users.findFirst({
    where: and(or(sql`lower(${users.username}) = ${ident}`, sql`lower(${users.email}) = ${ident}`), isNull(users.deletedAt)),
  });
  if (!user || user.status !== "active") return null;
  const token = randomToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { token, email: user.email, name: user.name };
}

export async function resetPassword(token: string, newPassword: string) {
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new ValidationError(weak);
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(eq(passwordResetTokens.tokenHash, sha256(token)), gt(passwordResetTokens.expiresAt, new Date()), isNull(passwordResetTokens.usedAt)),
  });
  if (!row) throw new ValidationError("Link reset password tidak valid atau sudah kedaluwarsa");
  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  if (!user) throw new ValidationError("User tidak ditemukan");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    // cabut seluruh session aktif
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await writeAudit(tx, null, { companyId: user.companyId, userId: user.id, action: "PASSWORD_RESET", entity: "user", entityId: user.id });
  });
}

export async function changePassword(ctx: AuthContext, currentPassword: string, newPassword: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new ValidationError("Password saat ini salah");
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new ValidationError(weak);
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(users.id, ctx.userId));
  await writeAudit(db, ctx, { action: "UPDATE", entity: "user", entityId: ctx.userId, newValue: { password: "changed" } });
}
