import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { companies, invoices, serviceReminders, services, vehicleCheckins, vehicles, workOrderJobs, workOrders } from "@/server/db/schema";
import { assertBranchAccess, can, requirePermission, type AuthContext } from "@/server/auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { optStr, reqStr } from "@/server/validation";
import { addDaysISO, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";
import { setWoStatus } from "./workorders";

/** Evaluasi syarat serah terima kendaraan (BRD 1.5 Vehicle Handover, BR-008) */
export async function handoverReadiness(tx: DbOrTx, wo: typeof workOrders.$inferSelect) {
  const unmet: string[] = [];
  if (wo.status !== "completed") unmet.push("Work Order belum lulus QC (QC Pass)");
  const inv = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, wo.id), ne(invoices.status, "void")) });
  if (!inv) unmet.push("Invoice belum dibuat");
  else if (inv.paymentStatus !== "paid" && !inv.arAuthorizedAt) unmet.push("Pembayaran belum lunas dan tidak ada otorisasi piutang");
  return { ready: unmet.length === 0, unmet, invoice: inv ?? null };
}

const handoverInput = z.object({
  receivedBy: reqStr("Nama penerima kendaraan"),
  notes: optStr,
  overrideReason: optStr,
});

export async function handoverVehicle(ctx: AuthContext, woId: string, raw: unknown) {
  requirePermission(ctx, "handover.execute");
  const input = handoverInput.parse(raw);
  return db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrders).where(and(eq(workOrders.id, woId), eq(workOrders.companyId, ctx.companyId))).for("update");
    if (!wo) throw new NotFoundError("Work Order");
    assertBranchAccess(ctx, wo.branchId);
    if (wo.handoverAt) throw new ValidationError("Kendaraan sudah diserahkan");
    if (wo.status === "cancelled") throw new ValidationError("Work Order dibatalkan");
    const readiness = await handoverReadiness(tx, wo);
    let override = false;
    if (!readiness.ready) {
      if (!input.overrideReason) throw new ValidationError(`Syarat serah terima belum terpenuhi: ${readiness.unmet.join("; ")}`);
      if (!can(ctx, "handover.override")) throw new ForbiddenError("Override serah terima membutuhkan otorisasi (handover.override)");
      override = true;
    }
    const now = new Date();
    await tx
      .update(workOrders)
      .set({
        handoverAt: now,
        handoverBy: ctx.userId,
        handoverReceivedBy: input.receivedBy,
        handoverNotes: input.notes,
        handoverOverrideReason: override ? input.overrideReason : null,
        completedAt: wo.completedAt ?? now,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(eq(workOrders.id, woId));
    if (wo.status !== "completed") await setWoStatus(tx, ctx, woId, wo.status, "completed", `Ditutup via override serah terima: ${input.overrideReason}`);
    await tx.update(vehicleCheckins).set({ status: "completed", updatedAt: now, updatedBy: ctx.userId }).where(eq(vehicleCheckins.id, wo.checkinId));

    const reminders = await createRemindersAfterService(tx, ctx, wo);
    await writeAudit(tx, ctx, {
      action: override ? "OVERRIDE" : "UPDATE",
      entity: "vehicle_handover",
      entityId: woId,
      referenceNumber: wo.woNumber,
      newValue: { receivedBy: input.receivedBy, unmet: readiness.unmet, reminders: reminders.length },
      reason: override ? input.overrideReason : null,
      branchId: wo.branchId,
    });
    return { override, reminders };
  });
}

/**
 * After sales: buat service reminder berbasis tanggal & odometer (BRD 1.5 Service Reminder, URS-CRM-001).
 * Reminder lama untuk kendaraan yang sama dianggap terpenuhi.
 */
export async function createRemindersAfterService(tx: DbOrTx, ctx: AuthContext, wo: typeof workOrders.$inferSelect) {
  const company = await tx.query.companies.findFirst({ where: eq(companies.id, wo.companyId) });
  const vehicle = await tx.query.vehicles.findFirst({ where: eq(vehicles.id, wo.vehicleId) });
  if (!company || !vehicle) return [];
  const odo = Math.max(wo.odometer ?? 0, vehicle.lastOdometer);
  const today = todayISO();

  await tx
    .update(serviceReminders)
    .set({ status: "done", followUpNotes: `Kunjungan ${wo.woNumber}`, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(serviceReminders.vehicleId, vehicle.id), inArray(serviceReminders.status, ["pending", "contacted", "booked"])));

  const jobs = await tx.select().from(workOrderJobs).where(and(eq(workOrderJobs.workOrderId, wo.id), eq(workOrderJobs.status, "completed")));
  const svcIds = jobs.map((j) => j.serviceId).filter((x): x is string => !!x);
  const svc = svcIds.length ? await tx.select().from(services).where(inArray(services.id, svcIds)) : [];
  const rows: (typeof serviceReminders.$inferInsert)[] = [];
  for (const s of svc) {
    if (!s.reminderDays && !s.reminderKm) continue;
    rows.push({
      companyId: wo.companyId,
      branchId: wo.branchId,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      workOrderId: wo.id,
      serviceId: s.id,
      reminderType: "service",
      description: `${s.serviceName} berikutnya`,
      dueDate: s.reminderDays ? addDaysISO(today, s.reminderDays) : null,
      dueOdometer: s.reminderKm ? odo + s.reminderKm : null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
  }
  if (!rows.length) {
    const st = company.settings;
    const isCar = vehicle.vehicleType === "car";
    rows.push({
      companyId: wo.companyId,
      branchId: wo.branchId,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      workOrderId: wo.id,
      serviceId: null,
      reminderType: "periodic",
      description: "Servis berkala berikutnya",
      dueDate: addDaysISO(today, isCar ? st.reminderCarDays : st.reminderMotorDays),
      dueOdometer: odo + (isCar ? st.reminderCarKm : st.reminderMotorKm),
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
  }
  return tx.insert(serviceReminders).values(rows).returning();
}
