import { and, asc, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { customers, serviceReminders, vehicles } from "@/server/db/schema";
import { requirePermission, scopeBranchIds, type AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { likeQ, optDate, optInt, optStr, pageArgs, reqStr, reqUuid, type ListParams } from "@/server/validation";
import { addDaysISO, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";

/**
 * Daftar reminder jatuh tempo (URS-CRM-002).
 * Due bila tanggal jatuh tempo ≤ hari ini + window, atau odometer terakhir sudah mencapai due odometer.
 */
export async function listReminders(ctx: AuthContext, params: ListParams & { status?: string | null; window?: number; dueOnly?: boolean } = {}) {
  requirePermission(ctx, "reminder.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const branchIds = scopeBranchIds(ctx);
  const until = addDaysISO(todayISO(), params.window ?? 14);
  const where = and(
    eq(serviceReminders.companyId, ctx.companyId),
    branchIds.length ? or(inArray(serviceReminders.branchId, branchIds), sql`${serviceReminders.branchId} is null`) : sql`false`,
    params.status ? eq(serviceReminders.status, params.status) : inArray(serviceReminders.status, ["pending", "contacted"]),
    params.dueOnly !== false ? or(lte(serviceReminders.dueDate, until), sql`${vehicles.lastOdometer} >= ${serviceReminders.dueOdometer}`) : undefined,
    like ? or(ilike(customers.name, like), ilike(vehicles.plateNumber, like), ilike(serviceReminders.description, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: serviceReminders.id,
        description: serviceReminders.description,
        reminderType: serviceReminders.reminderType,
        dueDate: serviceReminders.dueDate,
        dueOdometer: serviceReminders.dueOdometer,
        status: serviceReminders.status,
        followUpNotes: serviceReminders.followUpNotes,
        lastContactedAt: serviceReminders.lastContactedAt,
        customerId: customers.id,
        customerName: customers.name,
        whatsapp: customers.whatsapp,
        phone: customers.phone,
        vehicleId: vehicles.id,
        plateNumber: vehicles.plateNumber,
        lastOdometer: vehicles.lastOdometer,
        overdue: sql<boolean>`(${serviceReminders.dueDate} < ${todayISO()}) or (${vehicles.lastOdometer} >= ${serviceReminders.dueOdometer})`,
      })
      .from(serviceReminders)
      .innerJoin(customers, eq(customers.id, serviceReminders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, serviceReminders.vehicleId))
      .where(where)
      .orderBy(asc(serviceReminders.dueDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(serviceReminders)
      .innerJoin(customers, eq(customers.id, serviceReminders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, serviceReminders.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function vehicleReminders(ctx: AuthContext, vehicleId: string) {
  requirePermission(ctx, "reminder.view");
  return db.query.serviceReminders.findMany({
    where: and(eq(serviceReminders.companyId, ctx.companyId), eq(serviceReminders.vehicleId, vehicleId)),
    orderBy: asc(serviceReminders.dueDate),
  });
}

const followUpInput = z.object({
  status: z.enum(["pending", "contacted", "booked", "done", "cancelled"]),
  notes: optStr,
});

export async function followUpReminder(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "reminder.manage");
  const input = followUpInput.parse(raw);
  await db.transaction(async (tx) => {
    const r = await tx.query.serviceReminders.findFirst({ where: and(eq(serviceReminders.id, id), eq(serviceReminders.companyId, ctx.companyId)) });
    if (!r) throw new NotFoundError("Reminder");
    const stamp = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const notes = [r.followUpNotes, input.notes ? `[${stamp} ${ctx.userName}] ${input.notes}` : null].filter(Boolean).join("\n");
    await tx
      .update(serviceReminders)
      .set({
        status: input.status,
        followUpNotes: notes || null,
        lastContactedAt: input.status === "contacted" ? new Date() : r.lastContactedAt,
        contactedBy: input.status === "contacted" ? ctx.userId : r.contactedBy,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(serviceReminders.id, id));
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "service_reminder", entityId: id, oldValue: { status: r.status }, newValue: { status: input.status }, reason: input.notes });
  });
}

const manualInput = z.object({
  vehicleId: reqUuid("Kendaraan"),
  description: reqStr("Deskripsi"),
  dueDate: optDate,
  dueOdometer: optInt,
});

export async function createManualReminder(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "reminder.manage");
  const input = manualInput.parse(raw);
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, ctx.companyId)) });
  if (!v) throw new NotFoundError("Kendaraan");
  const [row] = await db
    .insert(serviceReminders)
    .values({
      companyId: ctx.companyId,
      branchId: ctx.activeBranchId,
      customerId: v.customerId,
      vehicleId: v.id,
      reminderType: "custom",
      description: input.description,
      dueDate: input.dueDate,
      dueOdometer: input.dueOdometer,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    })
    .returning();
  await writeAudit(db, ctx, { action: "CREATE", entity: "service_reminder", entityId: row.id, newValue: row });
  return row;
}
