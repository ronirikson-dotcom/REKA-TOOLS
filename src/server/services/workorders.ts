import { and, asc, desc, eq, ilike, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx, type Tx } from "@/server/db";
import {
  customers,
  estimateItems,
  estimates,
  invoices,
  jobTimeLogs,
  partRequestItems,
  partRequests,
  parts,
  qualityControls,
  rolePermissions,
  services,
  users,
  vehicleCheckins,
  vehicles,
  workOrderJobs,
  workOrderMechanics,
  workOrders,
  workOrderStatusHistory,
} from "@/server/db/schema";
import { assertBranchAccess, branchScope, can, requireAnyPermission, requirePermission, type AuthContext } from "@/server/auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { likeQ, nonNeg, optStr, optUuid, pageArgs, reason, reqUuid, parseReason, type ListParams } from "@/server/validation";
import { minutesBetween, round2 } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";
import { notify } from "./notifications";

export const OPEN_WO_STATUSES = ["waiting", "assigned", "in_progress", "paused", "waiting_parts", "qc", "rework"] as const;
const JOB_ACTIVE_WO = ["waiting", "assigned", "in_progress", "paused", "waiting_parts", "rework"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export async function setWoStatus(tx: DbOrTx, ctx: AuthContext, woId: string, from: string, to: string, note?: string | null) {
  if (from === to) return;
  const patch: Partial<typeof workOrders.$inferInsert> = { status: to, updatedAt: new Date(), updatedBy: ctx.userId };
  await tx.update(workOrders).set(patch).where(eq(workOrders.id, woId));
  await tx.insert(workOrderStatusHistory).values({ workOrderId: woId, fromStatus: from, toStatus: to, note: note ?? null, changedBy: ctx.userId });
}

/** Hitung ulang status WO berdasarkan status job (lifecycle SRS 4.6) */
export async function recomputeWoStatus(tx: Tx, ctx: AuthContext, woId: string, opts: { clearWaitingParts?: boolean; note?: string } = {}) {
  const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, woId)).for("update");
  if (!wo || ["completed", "cancelled"].includes(wo.status)) return wo?.status;
  const jobs = (await tx.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, woId))).filter((j) => j.status !== "cancelled");
  const current = opts.clearWaitingParts && wo.status === "waiting_parts" ? "in_progress" : wo.status;
  let next: string;
  if (jobs.some((j) => j.status === "in_progress")) next = "in_progress";
  else if (jobs.length > 0 && jobs.every((j) => j.status === "completed")) next = "qc";
  else if (current === "waiting_parts") next = "waiting_parts";
  else if (current === "rework" && !jobs.some((j) => j.status === "paused")) next = "rework";
  else if (jobs.some((j) => j.status === "paused")) next = "paused";
  else if (jobs.some((j) => j.status === "completed" || j.startedAt)) next = "in_progress";
  else {
    const [active] = await tx
      .select({ id: workOrderMechanics.id })
      .from(workOrderMechanics)
      .where(and(eq(workOrderMechanics.workOrderId, woId), eq(workOrderMechanics.isActive, true)))
      .limit(1);
    next = active ? "assigned" : "waiting";
  }
  if (next !== wo.status) {
    await setWoStatus(tx, ctx, woId, wo.status, next, opts.note);
    if (next === "qc") {
      await notify(tx, {
        companyId: wo.companyId,
        branchId: wo.branchId,
        permission: "qc.execute",
        type: "waiting_qc",
        title: "Menunggu QC",
        message: `${wo.woNumber} siap untuk Quality Control`,
        link: `/qc/${wo.id}`,
      });
    }
  }
  return next;
}

/**
 * Part/material yang disetujui customer untuk WO (estimate awal + estimate tambahan) beserta pemakaian aktual.
 * Dipakai untuk kontrol BR-006/BR-007: part yang ditagih tidak boleh melebihi yang disetujui.
 */
export async function getPartAllowance(tx: DbOrTx, wo: { id: string; estimateId: string | null }) {
  const approvedItems = await tx
    .select({
      partId: estimateItems.partId,
      itemType: estimateItems.itemType,
      description: estimateItems.description,
      qty: estimateItems.qty,
      price: estimateItems.price,
      discount: estimateItems.discount,
    })
    .from(estimateItems)
    .innerJoin(estimates, eq(estimates.id, estimateItems.estimateId))
    .where(
      and(
        or(wo.estimateId ? eq(estimates.id, wo.estimateId) : sql`false`, eq(estimates.workOrderId, wo.id)),
        inArray(estimates.status, ["approved", "partially_approved"]),
        eq(estimateItems.approvalStatus, "approved"),
        inArray(estimateItems.itemType, ["part", "material"]),
      ),
    );
  const issued = await tx
    .select({
      partId: partRequestItems.partId,
      requested: sql<number>`sum(case when ${partRequests.status} <> 'cancelled' then ${partRequestItems.qtyRequested} - ${partRequestItems.qtyIssued} else 0 end)::float8`,
      issued: sql<number>`sum(${partRequestItems.qtyIssued} - ${partRequestItems.qtyReturned})::float8`,
    })
    .from(partRequestItems)
    .innerJoin(partRequests, eq(partRequests.id, partRequestItems.partRequestId))
    .where(eq(partRequests.workOrderId, wo.id))
    .groupBy(partRequestItems.partId);

  const map = new Map<
    string,
    { partId: string; itemType: string; description: string; approvedQty: number; price: number; approvedDiscount: number; netIssued: number; pendingRequest: number }
  >();
  for (const it of approvedItems) {
    if (!it.partId) continue;
    const cur = map.get(it.partId);
    if (cur) {
      cur.approvedQty = round2(cur.approvedQty + it.qty);
      cur.approvedDiscount = round2(cur.approvedDiscount + it.discount);
    } else {
      map.set(it.partId, {
        partId: it.partId,
        itemType: it.itemType,
        description: it.description,
        approvedQty: it.qty,
        price: it.price,
        approvedDiscount: it.discount,
        netIssued: 0,
        pendingRequest: 0,
      });
    }
  }
  const partIds = issued.map((i) => i.partId).filter((id) => !map.has(id));
  const extraParts = partIds.length ? await tx.select().from(parts).where(inArray(parts.id, partIds)) : [];
  for (const i of issued) {
    let cur = map.get(i.partId);
    if (!cur) {
      const p = extraParts.find((x) => x.id === i.partId)!;
      cur = { partId: i.partId, itemType: p.itemType, description: p.partName, approvedQty: 0, price: p.sellingPrice, approvedDiscount: 0, netIssued: 0, pendingRequest: 0 };
      map.set(i.partId, cur);
    }
    cur.netIssued = round2(i.issued ?? 0);
    cur.pendingRequest = round2(i.requested ?? 0);
  }
  return [...map.values()].map((a) => ({ ...a, unapprovedQty: round2(Math.max(0, a.netIssued - a.approvedQty)) }));
}

async function loadWo(tx: DbOrTx, ctx: AuthContext, id: string) {
  const wo = await tx.query.workOrders.findFirst({ where: and(eq(workOrders.id, id), eq(workOrders.companyId, ctx.companyId)) });
  if (!wo) throw new NotFoundError("Work Order");
  assertBranchAccess(ctx, wo.branchId);
  return wo;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
export async function listWorkOrders(ctx: AuthContext, params: ListParams & { status?: string | null; open?: boolean } = {}) {
  requirePermission(ctx, "workorder.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(workOrders.companyId, ctx.companyId),
    branchScope(ctx, workOrders.branchId),
    params.status ? eq(workOrders.status, params.status) : undefined,
    params.open ? inArray(workOrders.status, [...OPEN_WO_STATUSES]) : undefined,
    like ? or(ilike(workOrders.woNumber, like), ilike(customers.name, like), ilike(vehicles.plateNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        woNumber: workOrders.woNumber,
        status: workOrders.status,
        priority: workOrders.priority,
        createdAt: workOrders.createdAt,
        completedAt: workOrders.completedAt,
        handoverAt: workOrders.handoverAt,
        customerName: customers.name,
        plateNumber: vehicles.plateNumber,
        vehicleType: vehicles.vehicleType,
        complaint: workOrders.complaint,
        mechanics: sql<string | null>`(select string_agg(distinct u.name, ', ') from ${workOrderMechanics} m join ${users} u on u.id = m.mechanic_id where m.work_order_id = ${workOrders.id} and m.is_active)`,
        invoiceStatus: sql<string | null>`(select i.payment_status from ${invoices} i where i.work_order_id = ${workOrders.id} and i.status <> 'void' limit 1)`,
      })
      .from(workOrders)
      .innerJoin(customers, eq(customers.id, workOrders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .where(where)
      .orderBy(desc(workOrders.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(workOrders)
      .innerJoin(customers, eq(customers.id, workOrders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** Mekanik hanya boleh melihat WO yang ditugaskan kepadanya (URS-WO-004) */
async function assertWoVisible(ctx: AuthContext, woId: string) {
  if (can(ctx, "workorder.view") || can(ctx, "qc.view") || can(ctx, "invoice.view") || can(ctx, "inventory.issue")) return;
  const [assigned] = await db
    .select({ id: workOrderMechanics.id })
    .from(workOrderMechanics)
    .where(and(eq(workOrderMechanics.workOrderId, woId), eq(workOrderMechanics.mechanicId, ctx.userId)))
    .limit(1);
  if (!assigned) throw new ForbiddenError("Work Order ini tidak ditugaskan kepada Anda");
}

export async function getWorkOrder(ctx: AuthContext, id: string) {
  requireAnyPermission(ctx, "workorder.view", "job.execute", "qc.view", "invoice.view", "inventory.issue");
  const wo = await db.query.workOrders.findFirst({
    where: and(eq(workOrders.id, id), eq(workOrders.companyId, ctx.companyId)),
    with: {
      checkin: true,
      customer: true,
      vehicle: { with: { brand: true, model: true } },
      branch: true,
      supervisor: { columns: { id: true, name: true } },
      serviceAdvisor: { columns: { id: true, name: true } },
      jobs: {
        orderBy: asc(workOrderJobs.sortOrder),
        with: { mechanics: { with: { mechanic: { columns: { id: true, name: true } } } }, service: true },
      },
      partRequests: {
        orderBy: desc(partRequests.requestDate),
        with: { items: { with: { part: true } }, mechanic: { columns: { id: true, name: true } }, warehouse: true },
      },
      qualityControls: { orderBy: desc(qualityControls.qcDate), with: { qcUser: { columns: { id: true, name: true } } } },
      statusHistory: { orderBy: desc(workOrderStatusHistory.changedAt) },
    },
  });
  if (!wo) throw new NotFoundError("Work Order");
  assertBranchAccess(ctx, wo.branchId);
  await assertWoVisible(ctx, id);
  const [allowance, additionalEstimates, invoice, historyUsers] = await Promise.all([
    getPartAllowance(db, wo),
    db.query.estimates.findMany({ where: eq(estimates.workOrderId, id), orderBy: desc(estimates.createdAt) }),
    db.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, id), ne(invoices.status, "void")) }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.companyId, ctx.companyId)),
  ]);
  const userName = (uid: string | null) => historyUsers.find((u) => u.id === uid)?.name ?? "-";
  return {
    ...wo,
    statusHistory: wo.statusHistory.map((h) => ({ ...h, changedByName: userName(h.changedBy) })),
    allowance,
    additionalEstimates,
    invoice: invoice ?? null,
    handoverByName: wo.handoverBy ? userName(wo.handoverBy) : null,
  };
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
const createWoInput = z.object({
  estimateId: reqUuid("Estimate"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  bay: optStr,
  supervisorId: optUuid,
  estimatedFinishAt: z.string().nullable().optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Estimasi selesai tidak valid"),
});

/** Work Order dibentuk dari pekerjaan yang disetujui customer (URS-WO-001, BR-001, BR-006) */
export async function createWorkOrder(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "workorder.create");
  const input = createWoInput.parse(raw);
  return db.transaction(async (tx) => {
    const [est] = await tx.select().from(estimates).where(and(eq(estimates.id, input.estimateId), eq(estimates.companyId, ctx.companyId))).for("update");
    if (!est) throw new NotFoundError("Estimate");
    assertBranchAccess(ctx, est.branchId);
    if (est.workOrderId) throw new ValidationError("Estimate tambahan otomatis masuk ke Work Order terkait");
    if (!["approved", "partially_approved"].includes(est.status)) {
      throw new ValidationError("Work Order hanya dapat dibuat dari estimate yang sudah disetujui customer (BR-006)");
    }
    const existing = await tx.query.workOrders.findFirst({ where: eq(workOrders.checkinId, est.checkinId) });
    if (existing) throw new ValidationError(`Check-in ini sudah memiliki Work Order ${existing.woNumber}`);
    const checkin = await tx.query.vehicleCheckins.findFirst({ where: eq(vehicleCheckins.id, est.checkinId) });
    if (!checkin || ["cancelled", "completed"].includes(checkin.status)) throw new ValidationError("Check-in tidak aktif");

    const items = await tx.select().from(estimateItems).where(and(eq(estimateItems.estimateId, est.id), eq(estimateItems.approvalStatus, "approved")));
    const serviceItems = items.filter((i) => i.itemType === "service");
    if (!serviceItems.length) throw new ValidationError("Estimate harus memiliki minimal 1 jasa yang disetujui untuk dibuat Work Order");

    const woNumber = await nextDocNumber(tx, ctx.companyId, est.branchId, "WO");
    const [wo] = await tx
      .insert(workOrders)
      .values({
        companyId: ctx.companyId,
        branchId: est.branchId,
        woNumber,
        checkinId: est.checkinId,
        estimateId: est.id,
        customerId: est.customerId,
        vehicleId: est.vehicleId,
        complaint: checkin.complaint,
        priority: input.priority,
        bay: input.bay,
        supervisorId: input.supervisorId,
        serviceAdvisorId: ctx.userId,
        odometer: checkin.odometer,
        estimatedFinishAt: input.estimatedFinishAt,
        status: "waiting",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await insertJobs(tx, ctx, wo.id, serviceItems, 0);
    await tx.insert(workOrderStatusHistory).values({ workOrderId: wo.id, fromStatus: null, toStatus: "waiting", note: `Dibuat dari ${est.estimateNumber}`, changedBy: ctx.userId });
    await tx.update(vehicleCheckins).set({ status: "in_progress", updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(vehicleCheckins.id, checkin.id));
    await writeAudit(tx, ctx, { action: "CREATE", entity: "work_order", entityId: wo.id, referenceNumber: woNumber, newValue: { estimate: est.estimateNumber, jobs: serviceItems.length }, branchId: wo.branchId });
    await notify(tx, {
      companyId: ctx.companyId,
      branchId: wo.branchId,
      permission: "workorder.assign",
      type: "wo_created",
      title: "Work Order baru",
      message: `${woNumber} menunggu penugasan mekanik`,
      link: `/work-orders/${wo.id}`,
    });
    return wo;
  });
}

async function insertJobs(tx: DbOrTx, ctx: AuthContext, woId: string, items: (typeof estimateItems.$inferSelect)[], startOrder: number) {
  if (!items.length) return;
  const svcIds = items.map((i) => i.serviceId).filter((x): x is string => !!x);
  const svc = svcIds.length ? await tx.select().from(services).where(inArray(services.id, svcIds)) : [];
  await tx.insert(workOrderJobs).values(
    items.map((it, i) => {
      const s = svc.find((x) => x.id === it.serviceId);
      return {
        workOrderId: woId,
        estimateItemId: it.id,
        serviceId: it.serviceId,
        description: it.description,
        standardHour: round2((s?.standardHour ?? 1) * it.qty),
        price: round2(it.qty * it.price),
        discount: it.discount,
        status: "pending",
        sortOrder: startOrder + i,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      };
    }),
  );
}

/** Dipanggil saat estimate tambahan disetujui (BR-006) */
export async function addApprovedJobsToWorkOrder(tx: Tx, ctx: AuthContext, woId: string, approvedItems: (typeof estimateItems.$inferSelect)[]) {
  const services = approvedItems.filter((i) => i.itemType === "service");
  const [{ maxOrder }] = await tx
    .select({ maxOrder: sql<number>`coalesce(max(${workOrderJobs.sortOrder}), -1)::int` })
    .from(workOrderJobs)
    .where(eq(workOrderJobs.workOrderId, woId));
  await insertJobs(tx, ctx, woId, services, maxOrder + 1);
  if (services.length) await recomputeWoStatus(tx, ctx, woId, { note: "Pekerjaan tambahan disetujui customer" });
  const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, woId) });
  if (wo) {
    await notify(tx, {
      companyId: wo.companyId,
      branchId: wo.branchId,
      permission: "workorder.assign",
      type: "additional_approved",
      title: "Pekerjaan tambahan disetujui",
      message: `${wo.woNumber}: ${approvedItems.length} item tambahan disetujui customer`,
      link: `/work-orders/${wo.id}`,
    });
  }
}

const updateWoInput = z.object({
  priority: z.enum(["low", "normal", "high", "urgent"]),
  bay: optStr,
  supervisorId: optUuid,
  estimatedFinishAt: createWoInput.shape.estimatedFinishAt,
});

export async function updateWorkOrder(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "workorder.edit");
  const input = updateWoInput.parse(raw);
  await db.transaction(async (tx) => {
    const wo = await loadWo(tx, ctx, id);
    if (["completed", "cancelled"].includes(wo.status)) throw new ValidationError("Work Order sudah ditutup");
    await tx.update(workOrders).set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(workOrders.id, id));
    await writeAudit(tx, ctx, {
      action: "UPDATE",
      entity: "work_order",
      entityId: id,
      referenceNumber: wo.woNumber,
      oldValue: { priority: wo.priority, bay: wo.bay, supervisorId: wo.supervisorId, estimatedFinishAt: wo.estimatedFinishAt },
      newValue: input,
      branchId: wo.branchId,
    });
  });
}

export async function mechanicOptions(ctx: AuthContext, branchId: string) {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, users.roleId), eq(rolePermissions.permissionCode, "job.execute")))
    .where(and(eq(users.companyId, ctx.companyId), eq(users.status, "active"), isNull(users.deletedAt), or(eq(users.branchId, branchId), eq(users.allBranches, true))))
    .orderBy(asc(users.name));
}

/** Penugasan mekanik per job (BR-004, URS-WO-003) */
export async function assignMechanic(ctx: AuthContext, woId: string, raw: unknown) {
  requirePermission(ctx, "workorder.assign");
  const input = z.object({ jobId: reqUuid("Job"), mechanicId: reqUuid("Mekanik") }).parse(raw);
  await db.transaction(async (tx) => {
    const wo = await loadWo(tx, ctx, woId);
    if (!JOB_ACTIVE_WO.includes(wo.status)) throw new ValidationError("Penugasan hanya dapat dilakukan pada WO yang sedang berjalan");
    const [job] = await tx.select().from(workOrderJobs).where(and(eq(workOrderJobs.id, input.jobId), eq(workOrderJobs.workOrderId, woId))).for("update");
    if (!job) throw new NotFoundError("Job");
    if (["completed", "cancelled"].includes(job.status)) throw new ValidationError("Job sudah selesai/dibatalkan");
    if (job.status === "in_progress") throw new ValidationError("Pause job terlebih dahulu sebelum mengganti mekanik");
    const mechanics = await mechanicOptions(ctx, wo.branchId);
    const mech = mechanics.find((m) => m.id === input.mechanicId);
    if (!mech) throw new ValidationError("User yang dipilih bukan mekanik aktif di cabang ini");
    const [prev] = await tx
      .select()
      .from(workOrderMechanics)
      .where(and(eq(workOrderMechanics.jobId, job.id), eq(workOrderMechanics.isActive, true)));
    if (prev?.mechanicId === mech.id) return;
    if (prev) await tx.update(workOrderMechanics).set({ isActive: false, finishTime: new Date() }).where(eq(workOrderMechanics.id, prev.id));
    await tx.insert(workOrderMechanics).values({ workOrderId: woId, jobId: job.id, mechanicId: mech.id, assignedBy: ctx.userId });
    await writeAudit(tx, ctx, {
      action: "UPDATE",
      entity: "work_order_job",
      entityId: job.id,
      referenceNumber: wo.woNumber,
      oldValue: prev ? { mechanicId: prev.mechanicId } : null,
      newValue: { mechanicId: mech.id, mechanic: mech.name, job: job.description },
      branchId: wo.branchId,
    });
    await notify(tx, {
      companyId: ctx.companyId,
      branchId: wo.branchId,
      userId: mech.id,
      type: "job_assigned",
      title: "Job baru ditugaskan",
      message: `${wo.woNumber}: ${job.description}`,
      link: `/mechanic`,
    });
    await recomputeWoStatus(tx, ctx, woId, { note: `Mekanik ${mech.name} ditugaskan` });
  });
}

export async function setWaitingParts(ctx: AuthContext, woId: string, waiting: boolean, note?: string | null) {
  requireAnyPermission(ctx, "workorder.edit", "job.execute");
  await db.transaction(async (tx) => {
    const wo = await loadWo(tx, ctx, woId);
    if (waiting) {
      if (!JOB_ACTIVE_WO.includes(wo.status) || wo.status === "waiting_parts") throw new ValidationError("Status WO tidak dapat diubah ke Waiting Parts");
      await setWoStatus(tx, ctx, woId, wo.status, "waiting_parts", note ?? "Menunggu part");
      await notify(tx, {
        companyId: ctx.companyId,
        branchId: wo.branchId,
        permission: "inventory.issue",
        type: "waiting_parts",
        title: "WO menunggu part",
        message: `${wo.woNumber} berstatus Waiting Parts${note ? `: ${note}` : ""}`,
        link: `/part-requests`,
      });
    } else {
      if (wo.status !== "waiting_parts") return;
      await recomputeWoStatus(tx, ctx, woId, { clearWaitingParts: true, note: note ?? "Part tersedia" });
    }
  });
}

/** Pembatalan WO wajib alasan (BR-011); part yang sudah keluar harus dikembalikan dulu (BR-005) */
export async function cancelWorkOrder(ctx: AuthContext, woId: string, rawReason: unknown) {
  requirePermission(ctx, "workorder.cancel");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const wo = await loadWo(tx, ctx, woId);
    if (["completed", "cancelled"].includes(wo.status)) throw new ValidationError("Work Order sudah ditutup");
    const inv = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, woId), ne(invoices.status, "void")) });
    if (inv) throw new ValidationError(`Void invoice ${inv.invoiceNumber} terlebih dahulu`);
    const allowance = await getPartAllowance(tx, wo);
    const outstanding = allowance.filter((a) => a.netIssued > 0);
    if (outstanding.length) {
      throw new ValidationError(`Kembalikan part yang sudah keluar terlebih dahulu: ${outstanding.map((o) => `${o.description} (${o.netIssued})`).join(", ")}`);
    }
    await tx.update(workOrderJobs).set({ status: "cancelled", runningSince: null, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(workOrderJobs.workOrderId, woId), ne(workOrderJobs.status, "completed")));
    await tx.update(workOrderMechanics).set({ isActive: false }).where(eq(workOrderMechanics.workOrderId, woId));
    await tx
      .update(partRequests)
      .set({ status: "cancelled", cancelReason: "WO dibatalkan", updatedAt: new Date() })
      .where(and(eq(partRequests.workOrderId, woId), inArray(partRequests.status, ["requested", "partially_issued"])));
    await tx.update(workOrders).set({ cancelReason: why }).where(eq(workOrders.id, woId));
    await setWoStatus(tx, ctx, woId, wo.status, "cancelled", why);
    await tx.update(vehicleCheckins).set({ status: "cancelled", cancelReason: `WO ${wo.woNumber} dibatalkan: ${why}`, updatedAt: new Date() }).where(eq(vehicleCheckins.id, wo.checkinId));
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "work_order", entityId: woId, referenceNumber: wo.woNumber, reason: why, branchId: wo.branchId });
  });
}

/** Perubahan harga job setelah approval wajib otorisasi & audit (BR-010) */
export async function overrideJobPrice(ctx: AuthContext, jobId: string, raw: unknown) {
  requirePermission(ctx, "workorder.price_override");
  const input = z.object({ price: nonNeg("Harga"), discount: nonNeg("Diskon").default(0), reason }).parse(raw);
  if (input.discount > input.price) throw new ValidationError("Diskon melebihi harga");
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(workOrderJobs).where(eq(workOrderJobs.id, jobId)).for("update");
    if (!job) throw new NotFoundError("Job");
    const wo = await loadWo(tx, ctx, job.workOrderId);
    const inv = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, wo.id), ne(invoices.status, "void")) });
    if (inv) throw new ValidationError("Harga tidak dapat diubah setelah invoice terbit");
    await tx.update(workOrderJobs).set({ price: input.price, discount: input.discount, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(workOrderJobs.id, jobId));
    await writeAudit(tx, ctx, {
      action: "OVERRIDE",
      entity: "work_order_job_price",
      entityId: jobId,
      referenceNumber: wo.woNumber,
      oldValue: { price: job.price, discount: job.discount },
      newValue: { price: input.price, discount: input.discount },
      reason: input.reason,
      branchId: wo.branchId,
    });
  });
}

// ---------------------------------------------------------------------------
// Mechanic job execution (URS-WO-005)
// ---------------------------------------------------------------------------
export type JobAction = "start" | "pause" | "resume" | "complete";

export async function jobAction(ctx: AuthContext, jobId: string, action: JobAction, note?: string | null) {
  requirePermission(ctx, "job.execute");
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(workOrderJobs).where(eq(workOrderJobs.id, jobId)).for("update");
    if (!job) throw new NotFoundError("Job");
    const wo = await loadWo(tx, ctx, job.workOrderId);
    if (!JOB_ACTIVE_WO.includes(wo.status)) throw new ValidationError(`Job tidak dapat dikerjakan saat WO berstatus ${wo.status}`);
    const [assignment] = await tx
      .select()
      .from(workOrderMechanics)
      .where(and(eq(workOrderMechanics.jobId, jobId), eq(workOrderMechanics.isActive, true)));
    if (!assignment) throw new ValidationError("Job belum ditugaskan ke mekanik");
    if (assignment.mechanicId !== ctx.userId && !can(ctx, "workorder.assign")) {
      throw new ForbiddenError("Job ini ditugaskan ke mekanik lain");
    }
    const now = new Date();
    const running = job.runningSince ? minutesBetween(job.runningSince, now) : 0;
    let patch: Partial<typeof workOrderJobs.$inferInsert>;
    switch (action) {
      case "start":
        if (job.status !== "pending") throw new ValidationError("Job sudah dimulai");
        patch = { status: "in_progress", runningSince: now, startedAt: job.startedAt ?? now };
        if (!assignment.startTime) await tx.update(workOrderMechanics).set({ startTime: now }).where(eq(workOrderMechanics.id, assignment.id));
        if (!wo.startedAt) await tx.update(workOrders).set({ startedAt: now }).where(eq(workOrders.id, wo.id));
        break;
      case "pause":
        if (job.status !== "in_progress") throw new ValidationError("Hanya job yang sedang berjalan yang dapat di-pause");
        patch = { status: "paused", runningSince: null, actualMinutes: job.actualMinutes + running };
        break;
      case "resume":
        if (job.status !== "paused") throw new ValidationError("Job tidak dalam status pause");
        patch = { status: "in_progress", runningSince: now };
        break;
      case "complete":
        if (!["in_progress", "paused"].includes(job.status)) throw new ValidationError("Job harus dimulai sebelum diselesaikan");
        patch = { status: "completed", runningSince: null, actualMinutes: job.actualMinutes + running, completedAt: now, notes: note ?? job.notes };
        await tx.update(workOrderMechanics).set({ finishTime: now }).where(eq(workOrderMechanics.id, assignment.id));
        break;
    }
    if (running > 0) {
      await tx
        .update(workOrderMechanics)
        .set({ durationMinutes: sql`${workOrderMechanics.durationMinutes} + ${running}` })
        .where(eq(workOrderMechanics.id, assignment.id));
    }
    await tx.update(workOrderJobs).set({ ...patch, updatedAt: now, updatedBy: ctx.userId }).where(eq(workOrderJobs.id, jobId));
    await tx.insert(jobTimeLogs).values({ workOrderId: wo.id, jobId, mechanicId: ctx.userId, action, note: note ?? null, loggedAt: now });
    await recomputeWoStatus(tx, ctx, wo.id);
  });
}

export async function updateJobNotes(ctx: AuthContext, jobId: string, notes: string | null) {
  requirePermission(ctx, "job.execute");
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(workOrderJobs).where(eq(workOrderJobs.id, jobId));
    if (!job) throw new NotFoundError("Job");
    await loadWo(tx, ctx, job.workOrderId);
    await tx.update(workOrderJobs).set({ notes, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(workOrderJobs.id, jobId));
  });
}

/** Mechanic view: hanya job yang ditugaskan (URS-WO-004, SRS 4.7) */
export async function listMyJobs(ctx: AuthContext) {
  requirePermission(ctx, "job.execute");
  return db
    .select({
      jobId: workOrderJobs.id,
      description: workOrderJobs.description,
      jobStatus: workOrderJobs.status,
      standardHour: workOrderJobs.standardHour,
      actualMinutes: workOrderJobs.actualMinutes,
      runningSince: workOrderJobs.runningSince,
      reworkCount: workOrderJobs.reworkCount,
      notes: workOrderJobs.notes,
      woId: workOrders.id,
      woNumber: workOrders.woNumber,
      woStatus: workOrders.status,
      priority: workOrders.priority,
      bay: workOrders.bay,
      complaint: workOrders.complaint,
      plateNumber: vehicles.plateNumber,
      vehicleType: vehicles.vehicleType,
      customerName: customers.name,
    })
    .from(workOrderMechanics)
    .innerJoin(workOrderJobs, eq(workOrderJobs.id, workOrderMechanics.jobId))
    .innerJoin(workOrders, eq(workOrders.id, workOrderMechanics.workOrderId))
    .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(
      and(
        eq(workOrderMechanics.mechanicId, ctx.userId),
        eq(workOrderMechanics.isActive, true),
        inArray(workOrders.status, JOB_ACTIVE_WO),
        notInArray(workOrderJobs.status, ["cancelled"]),
      ),
    )
    .orderBy(sql`case ${workOrders.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, asc(workOrders.createdAt), asc(workOrderJobs.sortOrder));
}

/** Workshop board: status & aging setiap WO (URS-WO-006) */
export async function workshopBoard(ctx: AuthContext) {
  requirePermission(ctx, "workorder.view");
  return db
    .select({
      id: workOrders.id,
      woNumber: workOrders.woNumber,
      status: workOrders.status,
      priority: workOrders.priority,
      bay: workOrders.bay,
      createdAt: workOrders.createdAt,
      estimatedFinishAt: workOrders.estimatedFinishAt,
      arrivalTime: vehicleCheckins.arrivalTime,
      plateNumber: vehicles.plateNumber,
      vehicleType: vehicles.vehicleType,
      customerName: customers.name,
      jobsTotal: sql<number>`(select count(*)::int from ${workOrderJobs} j where j.work_order_id = ${workOrders.id} and j.status <> 'cancelled')`,
      jobsDone: sql<number>`(select count(*)::int from ${workOrderJobs} j where j.work_order_id = ${workOrders.id} and j.status = 'completed')`,
      mechanics: sql<string | null>`(select string_agg(distinct u.name, ', ') from ${workOrderMechanics} m join ${users} u on u.id = m.mechanic_id where m.work_order_id = ${workOrders.id} and m.is_active)`,
    })
    .from(workOrders)
    .innerJoin(vehicleCheckins, eq(vehicleCheckins.id, workOrders.checkinId))
    .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(
      and(
        eq(workOrders.companyId, ctx.companyId),
        branchScope(ctx, workOrders.branchId),
        or(inArray(workOrders.status, [...OPEN_WO_STATUSES]), and(eq(workOrders.status, "completed"), isNull(workOrders.handoverAt))),
      ),
    )
    .orderBy(asc(vehicleCheckins.arrivalTime));
}
