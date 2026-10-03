import { and, eq, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { branches, rolePermissions, roles, users } from "@/server/db/schema";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/server/errors";
import type { Permission } from "@/lib/permissions";

export type AuthContext = {
  userId: string;
  userName: string;
  companyId: string;
  roleId: string;
  roleName: string;
  homeBranchId: string | null;
  allBranches: boolean;
  /** Seluruh cabang yang boleh diakses user */
  branchIds: string[];
  /** Cabang aktif; null = semua cabang yang diizinkan (hanya untuk user multi-cabang) */
  activeBranchId: string | null;
  permissions: Set<string>;
  sessionId?: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function buildContext(
  userId: string,
  opts: { activeBranchId?: string | null; sessionId?: string; ip?: string | null; userAgent?: string | null } = {},
): Promise<AuthContext> {
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), isNull(users.deletedAt)) });
  if (!user || user.status !== "active") throw new UnauthorizedError();
  const role = await db.query.roles.findFirst({ where: eq(roles.id, user.roleId) });
  if (!role) throw new UnauthorizedError();
  const perms = await db.select({ code: rolePermissions.permissionCode }).from(rolePermissions).where(eq(rolePermissions.roleId, role.id));

  let branchIds: string[];
  if (user.allBranches) {
    const rows = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.companyId, user.companyId), isNull(branches.deletedAt)));
    branchIds = rows.map((r) => r.id);
  } else {
    branchIds = user.branchId ? [user.branchId] : [];
  }

  let activeBranchId: string | null;
  if (opts.activeBranchId !== undefined) {
    activeBranchId = opts.activeBranchId && branchIds.includes(opts.activeBranchId) ? opts.activeBranchId : null;
  } else {
    activeBranchId = user.branchId && branchIds.includes(user.branchId) ? user.branchId : null;
  }
  // User non multi-cabang selalu terkunci pada cabangnya
  if (!user.allBranches) activeBranchId = user.branchId;

  return {
    userId: user.id,
    userName: user.name,
    companyId: user.companyId,
    roleId: role.id,
    roleName: role.name,
    homeBranchId: user.branchId,
    allBranches: user.allBranches,
    branchIds,
    activeBranchId,
    permissions: new Set(perms.map((p) => p.code)),
    sessionId: opts.sessionId,
    ip: opts.ip,
    userAgent: opts.userAgent,
  };
}

export function can(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: AuthContext, ...permissions: Permission[]): void {
  for (const p of permissions) {
    if (!ctx.permissions.has(p)) throw new ForbiddenError(`Akses ditolak: membutuhkan permission "${p}"`);
  }
}

export function requireAnyPermission(ctx: AuthContext, ...permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.has(p))) {
    throw new ForbiddenError(`Akses ditolak: membutuhkan salah satu permission ${permissions.join(", ")}`);
  }
}

/** Cabang yang menjadi scope query saat ini (BR-013) */
export function scopeBranchIds(ctx: AuthContext): string[] {
  return ctx.activeBranchId ? [ctx.activeBranchId] : ctx.branchIds;
}

/** Kondisi SQL scope cabang untuk kolom branch_id */
export function branchScope(ctx: AuthContext, column: PgColumn): SQL {
  const ids = scopeBranchIds(ctx);
  if (ids.length === 0) return inArray(column, ["00000000-0000-0000-0000-000000000000"]);
  return inArray(column, ids);
}

export function assertBranchAccess(ctx: AuthContext, branchId: string | null | undefined): void {
  if (!branchId || !ctx.branchIds.includes(branchId)) {
    throw new ForbiddenError("Data berada di luar cabang yang Anda akses");
  }
}

export function assertCompany(ctx: AuthContext, companyId: string | null | undefined): void {
  if (companyId !== ctx.companyId) throw new ForbiddenError("Data berada di luar perusahaan Anda");
}

/** Transaksi operasional wajib memiliki cabang aktif (BR-012) */
export function requireActiveBranch(ctx: AuthContext): string {
  if (!ctx.activeBranchId) {
    throw new ValidationError("Pilih cabang aktif terlebih dahulu (menu cabang di bagian atas) sebelum membuat transaksi");
  }
  return ctx.activeBranchId;
}
