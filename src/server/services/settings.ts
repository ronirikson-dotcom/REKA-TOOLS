import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { auditLogs, branches, companies, permissions, rolePermissions, roles, sessions, users, warehouses } from "@/server/db/schema";
import { requirePermission, type AuthContext } from "@/server/auth/context";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { bool, likeQ, nonNeg, num, optStr, optUuid, pageArgs, reqStr, reqUuid, type ListParams } from "@/server/validation";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { jakartaDayEnd, jakartaDayStart } from "@/lib/utils";
import { writeAudit } from "./audit";
import { DEFAULT_NUMBERING, DOC_TYPES } from "./numbering";

// ---------------------------------------------------------------------------
// Company: profil, pajak, penomoran, reminder
// ---------------------------------------------------------------------------
export async function getCompany(ctx: AuthContext) {
  const c = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
  if (!c) throw new NotFoundError("Perusahaan");
  return c;
}

const companyInput = z.object({
  name: reqStr("Nama perusahaan"),
  address: optStr,
  phone: optStr,
  email: optStr,
  taxId: optStr,
  taxRate: nonNeg("Tarif pajak").refine((n) => n <= 100, "Tarif pajak maksimal 100%"),
  reminderCarDays: num("Interval hari mobil"),
  reminderCarKm: num("Interval km mobil"),
  reminderMotorDays: num("Interval hari motor"),
  reminderMotorKm: num("Interval km motor"),
  estimateValidDays: num("Masa berlaku estimate"),
  sequencePadding: num("Digit sequence").refine((n) => n >= 2 && n <= 6, "Digit sequence 2-6"),
  numbering: z.record(z.string(), z.string().trim().min(1).max(8).regex(/^[A-Z0-9]+$/, "Prefix hanya huruf besar/angka")),
});

export async function updateCompany(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "settings.company");
  const input = companyInput.parse(raw);
  const old = await getCompany(ctx);
  const numbering = { ...DEFAULT_NUMBERING } as Record<string, string>;
  for (const key of Object.keys(DOC_TYPES)) if (input.numbering[key]) numbering[key] = input.numbering[key];
  const [row] = await db
    .update(companies)
    .set({
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      taxId: input.taxId,
      taxRate: input.taxRate,
      settings: {
        reminderCarDays: input.reminderCarDays,
        reminderCarKm: input.reminderCarKm,
        reminderMotorDays: input.reminderMotorDays,
        reminderMotorKm: input.reminderMotorKm,
        estimateValidDays: input.estimateValidDays,
        sequencePadding: input.sequencePadding,
        numbering,
      },
      updatedAt: new Date(),
      updatedBy: ctx.userId,
    })
    .where(eq(companies.id, ctx.companyId))
    .returning();
  await writeAudit(db, ctx, { action: "UPDATE", entity: "company", entityId: ctx.companyId, oldValue: old, newValue: row });
  return row;
}

// ---------------------------------------------------------------------------
// Cabang & gudang
// ---------------------------------------------------------------------------
export async function listBranches(ctx: AuthContext) {
  return db
    .select()
    .from(branches)
    .where(and(eq(branches.companyId, ctx.companyId), isNull(branches.deletedAt)))
    .orderBy(asc(branches.code));
}

export async function accessibleBranches(ctx: AuthContext) {
  const all = await listBranches(ctx);
  return all.filter((b) => ctx.branchIds.includes(b.id));
}

const branchInput = z.object({
  code: reqStr("Kode cabang").transform((s) => s.toUpperCase()),
  name: reqStr("Nama cabang"),
  address: optStr,
  phone: optStr,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function saveBranch(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.branch");
  const input = branchInput.parse(raw);
  return db.transaction(async (tx) => {
    if (id) {
      const old = await tx.query.branches.findFirst({ where: and(eq(branches.id, id), eq(branches.companyId, ctx.companyId)) });
      if (!old) throw new NotFoundError("Cabang");
      const [row] = await tx.update(branches).set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(branches.id, id)).returning();
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "branch", entityId: id, oldValue: old, newValue: row });
      return row;
    }
    const [row] = await tx.insert(branches).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId, updatedBy: ctx.userId }).returning();
    // Gudang default untuk cabang baru
    await tx.insert(warehouses).values({ companyId: ctx.companyId, branchId: row.id, code: `GD-${row.code}`, name: `Gudang Utama ${row.name}`, isDefault: true, createdBy: ctx.userId });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "branch", entityId: row.id, newValue: row });
    return row;
  });
}

export async function listWarehouses(ctx: AuthContext) {
  return db
    .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name, isDefault: warehouses.isDefault, status: warehouses.status, branchId: warehouses.branchId, branchName: branches.name })
    .from(warehouses)
    .innerJoin(branches, eq(branches.id, warehouses.branchId))
    .where(eq(warehouses.companyId, ctx.companyId))
    .orderBy(asc(branches.code), asc(warehouses.code));
}

const warehouseInput = z.object({
  branchId: reqUuid("Cabang"),
  code: reqStr("Kode gudang").transform((s) => s.toUpperCase()),
  name: reqStr("Nama gudang"),
  isDefault: bool,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function saveWarehouse(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.branch");
  const input = warehouseInput.parse(raw);
  const branch = await db.query.branches.findFirst({ where: and(eq(branches.id, input.branchId), eq(branches.companyId, ctx.companyId)) });
  if (!branch) throw new NotFoundError("Cabang");
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(warehouses).set({ isDefault: false }).where(eq(warehouses.branchId, input.branchId));
    if (id) {
      const [row] = await tx
        .update(warehouses)
        .set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId })
        .where(and(eq(warehouses.id, id), eq(warehouses.companyId, ctx.companyId)))
        .returning();
      if (!row) throw new NotFoundError("Gudang");
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "warehouse", entityId: id, newValue: row });
      return row;
    }
    const [row] = await tx.insert(warehouses).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId }).returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "warehouse", entityId: row.id, newValue: row });
    return row;
  });
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export async function listUsers(ctx: AuthContext, params: ListParams = {}) {
  requirePermission(ctx, "settings.user");
  const like = likeQ(params.q);
  return db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      phone: users.phone,
      status: users.status,
      allBranches: users.allBranches,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      roleId: users.roleId,
      roleName: roles.name,
      branchId: users.branchId,
      branchName: branches.name,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(
      and(
        eq(users.companyId, ctx.companyId),
        isNull(users.deletedAt),
        like ? or(ilike(users.name, like), ilike(users.username, like), ilike(users.email, like)) : undefined,
      ),
    )
    .orderBy(asc(users.name));
}

const userInput = z.object({
  name: reqStr("Nama"),
  username: reqStr("Username").regex(/^[a-zA-Z0-9._-]+$/, "Username hanya huruf, angka, titik, - dan _"),
  email: z.email("Email tidak valid"),
  phone: optStr,
  roleId: reqUuid("Role"),
  branchId: optUuid,
  allBranches: bool,
  status: z.enum(["active", "inactive"]).default("active"),
  password: optStr,
});

export async function saveUser(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.user");
  const input = userInput.parse(raw);
  const role = await db.query.roles.findFirst({ where: and(eq(roles.id, input.roleId), eq(roles.companyId, ctx.companyId)) });
  if (!role) throw new NotFoundError("Role");
  if (!input.allBranches && !input.branchId) throw new ValidationError("Cabang wajib dipilih untuk user single-branch");
  if (input.branchId) {
    const b = await db.query.branches.findFirst({ where: and(eq(branches.id, input.branchId), eq(branches.companyId, ctx.companyId)) });
    if (!b) throw new NotFoundError("Cabang");
  }
  if (input.password) {
    const weak = validatePasswordStrength(input.password);
    if (weak) throw new ValidationError(weak);
  }
  const values = {
    name: input.name,
    username: input.username.toLowerCase(),
    email: input.email.toLowerCase(),
    phone: input.phone,
    roleId: input.roleId,
    branchId: input.branchId,
    allBranches: input.allBranches,
    status: input.status,
  };
  return db.transaction(async (tx) => {
    if (id) {
      const old = await tx.query.users.findFirst({ where: and(eq(users.id, id), eq(users.companyId, ctx.companyId)) });
      if (!old) throw new NotFoundError("User");
      if (id === ctx.userId && input.status !== "active") throw new ValidationError("Tidak dapat menonaktifkan akun sendiri");
      const patch: Partial<typeof users.$inferInsert> = { ...values, updatedAt: new Date(), updatedBy: ctx.userId };
      if (input.password) {
        patch.passwordHash = await hashPassword(input.password);
        patch.failedLoginCount = 0;
        patch.lockedUntil = null;
      }
      const [row] = await tx.update(users).set(patch).where(eq(users.id, id)).returning({ id: users.id });
      if (input.status !== "active" || input.password || old.roleId !== input.roleId) await tx.delete(sessions).where(eq(sessions.userId, id));
      const { passwordHash: _o, ...oldSafe } = old;
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "user", entityId: id, oldValue: oldSafe, newValue: { ...values, passwordChanged: !!input.password } });
      return row;
    }
    if (!input.password) throw new ValidationError("Password wajib diisi untuk user baru");
    const [row] = await tx
      .insert(users)
      .values({ ...values, companyId: ctx.companyId, passwordHash: await hashPassword(input.password), createdBy: ctx.userId, updatedBy: ctx.userId })
      .returning({ id: users.id });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "user", entityId: row.id, newValue: values });
    return row;
  });
}

export async function unlockUser(ctx: AuthContext, id: string) {
  requirePermission(ctx, "settings.user");
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(users.id, id), eq(users.companyId, ctx.companyId)));
  await writeAudit(db, ctx, { action: "UPDATE", entity: "user", entityId: id, newValue: { unlocked: true } });
}

// ---------------------------------------------------------------------------
// Role & permission
// ---------------------------------------------------------------------------
export async function listRoles(ctx: AuthContext) {
  const rows = await db.query.roles.findMany({ where: eq(roles.companyId, ctx.companyId), with: { permissions: true }, orderBy: asc(roles.name) });
  const counts = await db
    .select({ roleId: users.roleId, count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.companyId, ctx.companyId), isNull(users.deletedAt)))
    .groupBy(users.roleId);
  return rows.map((r) => ({ ...r, permissionCodes: r.permissions.map((p) => p.permissionCode), userCount: counts.find((c) => c.roleId === r.id)?.count ?? 0 }));
}

export async function listPermissionCatalog() {
  return db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.code));
}

const roleInput = z.object({ name: reqStr("Nama role"), description: optStr, permissions: z.array(z.string()).default([]) });

export async function saveRole(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.role");
  const input = roleInput.parse(raw);
  const perms = input.permissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  return db.transaction(async (tx) => {
    let roleId = id;
    if (id) {
      const old = await tx.query.roles.findFirst({ where: and(eq(roles.id, id), eq(roles.companyId, ctx.companyId)), with: { permissions: true } });
      if (!old) throw new NotFoundError("Role");
      if (old.id === ctx.roleId && !perms.includes("settings.role")) throw new ForbiddenError("Tidak dapat menghapus permission settings.role dari role Anda sendiri");
      await tx.update(roles).set({ name: input.name, description: input.description, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(roles.id, id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await writeAudit(tx, ctx, {
        action: "UPDATE",
        entity: "role",
        entityId: id,
        oldValue: { name: old.name, permissions: old.permissions.map((p) => p.permissionCode) },
        newValue: { name: input.name, permissions: perms },
      });
    } else {
      const [row] = await tx.insert(roles).values({ companyId: ctx.companyId, name: input.name, description: input.description, createdBy: ctx.userId }).returning();
      roleId = row.id;
      await writeAudit(tx, ctx, { action: "CREATE", entity: "role", entityId: row.id, newValue: { name: input.name, permissions: perms } });
    }
    if (perms.length) await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId: roleId!, permissionCode: p })));
    return { id: roleId! };
  });
}

// ---------------------------------------------------------------------------
// Audit log viewer (SRS 4.4, AC-008)
// ---------------------------------------------------------------------------
export async function listAuditLogs(
  ctx: AuthContext,
  params: ListParams & { action?: string | null; entity?: string | null; userId?: string | null; from?: string | null; to?: string | null } = {},
) {
  requirePermission(ctx, "audit.view");
  const { limit, offset, page, pageSize } = pageArgs({ pageSize: 50, ...params });
  const like = likeQ(params.q);
  const where = and(
    eq(auditLogs.companyId, ctx.companyId),
    ctx.allBranches ? undefined : or(isNull(auditLogs.branchId), sql`${auditLogs.branchId} in ${ctx.branchIds.length ? ctx.branchIds : ["00000000-0000-0000-0000-000000000000"]}`),
    params.action ? eq(auditLogs.action, params.action) : undefined,
    params.entity ? eq(auditLogs.entity, params.entity) : undefined,
    params.userId ? eq(auditLogs.userId, params.userId) : undefined,
    params.from ? gte(auditLogs.createdAt, jakartaDayStart(params.from)) : undefined,
    params.to ? lte(auditLogs.createdAt, jakartaDayEnd(params.to)) : undefined,
    like ? or(ilike(auditLogs.referenceNumber, like), ilike(auditLogs.entity, like), ilike(auditLogs.reason, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        referenceNumber: auditLogs.referenceNumber,
        reason: auditLogs.reason,
        oldValue: auditLogs.oldValue,
        newValue: auditLogs.newValue,
        ip: auditLogs.ip,
        userName: users.name,
        branchName: branches.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .leftJoin(branches, eq(branches.id, auditLogs.branchId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function userOptions(ctx: AuthContext) {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.companyId, ctx.companyId)).orderBy(asc(users.name));
}

/** User aktif dengan permission tertentu di cabang (mis. supervisor untuk WO) */
export async function usersWithPermission(ctx: AuthContext, permission: string, branchId?: string | null) {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, users.roleId), eq(rolePermissions.permissionCode, permission)))
    .where(
      and(
        eq(users.companyId, ctx.companyId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        branchId ? or(eq(users.branchId, branchId), eq(users.allBranches, true)) : undefined,
      ),
    )
    .orderBy(asc(users.name));
}
