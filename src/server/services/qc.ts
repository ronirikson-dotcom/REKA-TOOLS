import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { customers, jobTimeLogs, qualityControls, vehicles, workOrderJobs, workOrderMechanics, workOrders } from "@/server/db/schema";
import { assertBranchAccess, branchScope, requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { optStr } from "@/server/validation";
import { writeAudit } from "./audit";
import { notify } from "./notifications";
import { setWoStatus } from "./workorders";

export const QC_DEFAULT_CHECKLIST = [
  "Seluruh pekerjaan sesuai Work Order",
  "Tidak ada kebocoran oli / cairan",
  "Baut & komponen terpasang kencang",
  "Test jalan / test fungsi OK",
  "Kendaraan bersih dari kotoran bengkel",
  "Barang customer lengkap",
];

const qcInput = z
  .object({
    result: z.enum(["pass", "fail", "rework"]),
    notes: optStr,
    checklist: z.array(z.object({ item: z.string(), ok: z.boolean() })).default([]),
    reworkJobIds: z.array(z.uuid()).default([]),
  })
  .refine((v) => v.result === "pass" || (v.notes && v.notes.length >= 3), { message: "Catatan koreksi wajib diisi untuk hasil Fail/Rework" });

export async function qcQueue(ctx: AuthContext) {
  requirePermission(ctx, "qc.view");
  return db
    .select({
      id: workOrders.id,
      woNumber: workOrders.woNumber,
      status: workOrders.status,
      priority: workOrders.priority,
      updatedAt: workOrders.updatedAt,
      plateNumber: vehicles.plateNumber,
      vehicleType: vehicles.vehicleType,
      customerName: customers.name,
      qcCount: sql<number>`(select count(*)::int from ${qualityControls} q where q.work_order_id = ${workOrders.id})`,
    })
    .from(workOrders)
    .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(and(eq(workOrders.companyId, ctx.companyId), branchScope(ctx, workOrders.branchId), eq(workOrders.status, "qc")))
    .orderBy(asc(workOrders.updatedAt));
}

/**
 * QC sebagai gate sebelum invoice/handover (BRD 1.5).
 * Fail/Rework mengembalikan job ke mekanik dan tercatat di histori (AC-004).
 */
export async function submitQc(ctx: AuthContext, woId: string, raw: unknown) {
  requirePermission(ctx, "qc.execute");
  const input = qcInput.parse(raw);
  return db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrders).where(and(eq(workOrders.id, woId), eq(workOrders.companyId, ctx.companyId))).for("update");
    if (!wo) throw new NotFoundError("Work Order");
    assertBranchAccess(ctx, wo.branchId);
    if (wo.status !== "qc") throw new ValidationError("Work Order belum berada di tahap QC");
    const jobs = (await tx.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, woId))).filter((j) => j.status !== "cancelled");

    const [qc] = await tx
      .insert(qualityControls)
      .values({
        companyId: ctx.companyId,
        branchId: wo.branchId,
        workOrderId: woId,
        qcUserId: ctx.userId,
        result: input.result,
        notes: input.notes,
        checklist: input.checklist,
        reworkJobIds: input.reworkJobIds,
      })
      .returning();

    if (input.result === "pass") {
      const now = new Date();
      await tx.update(workOrders).set({ completedAt: now, updatedAt: now, updatedBy: ctx.userId }).where(eq(workOrders.id, woId));
      await setWoStatus(tx, ctx, woId, wo.status, "completed", "QC Pass");
      await notify(tx, {
        companyId: ctx.companyId,
        branchId: wo.branchId,
        permission: "invoice.create",
        type: "ready_invoice",
        title: "Siap invoice",
        message: `${wo.woNumber} lulus QC dan siap dibuatkan invoice`,
        link: `/work-orders/${woId}`,
      });
    } else {
      const targets = input.reworkJobIds.length ? jobs.filter((j) => input.reworkJobIds.includes(j.id)) : jobs;
      if (!targets.length) throw new ValidationError("Pilih job yang harus dikerjakan ulang");
      await tx
        .update(workOrderJobs)
        .set({ status: "pending", completedAt: null, reworkCount: sql`${workOrderJobs.reworkCount} + 1`, updatedAt: new Date(), updatedBy: ctx.userId })
        .where(inArray(workOrderJobs.id, targets.map((t) => t.id)));
      for (const t of targets) {
        await tx.insert(jobTimeLogs).values({ workOrderId: woId, jobId: t.id, mechanicId: null, action: "rework", note: input.notes });
      }
      await setWoStatus(tx, ctx, woId, wo.status, "rework", `QC ${input.result.toUpperCase()}: ${input.notes}`);
      const mechs = await tx
        .select({ mechanicId: workOrderMechanics.mechanicId })
        .from(workOrderMechanics)
        .where(and(inArray(workOrderMechanics.jobId, targets.map((t) => t.id)), eq(workOrderMechanics.isActive, true)));
      for (const m of new Set(mechs.map((x) => x.mechanicId))) {
        await notify(tx, {
          companyId: ctx.companyId,
          branchId: wo.branchId,
          userId: m,
          type: "rework",
          title: "Rework dari QC",
          message: `${wo.woNumber}: ${input.notes}`,
          link: `/mechanic`,
        });
      }
    }
    await writeAudit(tx, ctx, {
      action: input.result === "pass" ? "APPROVE" : "REJECT",
      entity: "quality_control",
      entityId: qc.id,
      referenceNumber: wo.woNumber,
      newValue: { result: input.result, reworkJobs: input.reworkJobIds.length },
      reason: input.notes,
      branchId: wo.branchId,
    });
    return qc;
  });
}
