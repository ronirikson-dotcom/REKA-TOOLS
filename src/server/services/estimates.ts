import { and, asc, desc, eq, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { companies, customers, estimateApprovals, estimateItems, estimates, invoices, parts, services, vehicleCheckins, vehicles, workOrders } from "@/server/db/schema";
import { assertBranchAccess, branchScope, requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { likeQ, nonNeg, optStr, optUuid, pageArgs, positive, reqStr, parseReason, type ListParams } from "@/server/validation";
import { addDaysISO, round2, sum, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";
import { addAttachments, listAttachments } from "./attachments";
import { notify } from "./notifications";
import { addApprovedJobsToWorkOrder } from "./workorders";
import type { UploadFile } from "@/server/storage";

const itemInput = z
  .object({
    itemType: z.enum(["service", "part", "material"]),
    serviceId: optUuid,
    partId: optUuid,
    description: optStr,
    qty: positive("Qty"),
    price: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
    discount: nonNeg("Diskon").default(0),
  })
  .refine((v) => (v.itemType === "service" ? !!v.serviceId || !!v.description : !!v.partId), {
    message: "Pilih jasa/part untuk setiap baris estimate",
  });

const estimateInput = z.object({
  checkinId: optUuid,
  workOrderId: optUuid,
  notes: optStr,
  items: z.array(itemInput).min(1, "Estimate minimal berisi 1 item"),
});

export function calcLine(qty: number, price: number, discount: number) {
  const gross = round2(qty * price);
  if (discount > gross) throw new ValidationError("Diskon baris tidak boleh melebihi nilai baris");
  return round2(gross - discount);
}

export function calcTotals(lines: { qty: number; price: number; discount: number }[], taxRate: number, extraDiscount = 0) {
  const subtotal = sum(lines, (l) => l.qty * l.price);
  const discount = round2(sum(lines, (l) => l.discount) + extraDiscount);
  const taxable = round2(subtotal - discount);
  if (taxable < 0) throw new ValidationError("Total diskon melebihi subtotal");
  const tax = round2((taxable * taxRate) / 100);
  return { subtotal, discount, tax, grandTotal: round2(taxable + tax) };
}

async function resolveItems(tx: DbOrTx, ctx: AuthContext, items: z.infer<typeof itemInput>[]) {
  const serviceIds = items.map((i) => i.serviceId).filter((x): x is string => !!x);
  const partIds = items.map((i) => i.partId).filter((x): x is string => !!x);
  const svc = serviceIds.length
    ? await tx.select().from(services).where(and(eq(services.companyId, ctx.companyId), inArray(services.id, serviceIds)))
    : [];
  const prt = partIds.length ? await tx.select().from(parts).where(and(eq(parts.companyId, ctx.companyId), inArray(parts.id, partIds))) : [];
  return items.map((it, idx) => {
    if (it.itemType === "service") {
      const s = it.serviceId ? svc.find((x) => x.id === it.serviceId) : null;
      if (it.serviceId && !s) throw new NotFoundError("Jasa");
      const price = it.price ?? s?.sellingPrice ?? 0;
      return {
        itemType: "service" as const,
        serviceId: s?.id ?? null,
        partId: null,
        description: it.description ?? s!.serviceName,
        qty: it.qty,
        price,
        discount: it.discount,
        total: calcLine(it.qty, price, it.discount),
        sortOrder: idx,
      };
    }
    const p = prt.find((x) => x.id === it.partId);
    if (!p) throw new NotFoundError("Spare part");
    const price = it.price ?? p.sellingPrice;
    return {
      itemType: it.itemType,
      serviceId: null,
      partId: p.id,
      description: it.description ?? p.partName,
      qty: it.qty,
      price,
      discount: it.discount,
      total: calcLine(it.qty, price, it.discount),
      sortOrder: idx,
    };
  });
}

/** Tandai estimate yang lewat masa berlaku sebagai Expired */
export async function expireOverdueEstimates(companyId: string) {
  await db
    .update(estimates)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(estimates.companyId, companyId), inArray(estimates.status, ["draft", "sent"]), lt(estimates.validUntil, todayISO())));
}

export async function listEstimates(ctx: AuthContext, params: ListParams & { status?: string | null } = {}) {
  requirePermission(ctx, "estimate.view");
  await expireOverdueEstimates(ctx.companyId);
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(estimates.companyId, ctx.companyId),
    branchScope(ctx, estimates.branchId),
    params.status ? eq(estimates.status, params.status) : undefined,
    like ? or(ilike(estimates.estimateNumber, like), ilike(customers.name, like), ilike(vehicles.plateNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: estimates.id,
        estimateNumber: estimates.estimateNumber,
        status: estimates.status,
        grandTotal: estimates.grandTotal,
        createdAt: estimates.createdAt,
        validUntil: estimates.validUntil,
        customerName: customers.name,
        plateNumber: vehicles.plateNumber,
        workOrderId: estimates.workOrderId,
        checkinId: estimates.checkinId,
      })
      .from(estimates)
      .innerJoin(customers, eq(customers.id, estimates.customerId))
      .innerJoin(vehicles, eq(vehicles.id, estimates.vehicleId))
      .where(where)
      .orderBy(desc(estimates.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(estimates)
      .innerJoin(customers, eq(customers.id, estimates.customerId))
      .innerJoin(vehicles, eq(vehicles.id, estimates.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getEstimate(ctx: AuthContext, id: string) {
  requirePermission(ctx, "estimate.view");
  const e = await db.query.estimates.findFirst({
    where: and(eq(estimates.id, id), eq(estimates.companyId, ctx.companyId)),
    with: {
      items: { orderBy: asc(estimateItems.sortOrder), with: { part: true, service: true } },
      approvals: { with: { recorder: { columns: { id: true, name: true } } }, orderBy: desc(estimateApprovals.approvedAt) },
      checkin: true,
      customer: true,
      vehicle: { with: { brand: true, model: true } },
      workOrder: true,
    },
  });
  if (!e) throw new NotFoundError("Estimate");
  assertBranchAccess(ctx, e.branchId);
  const [createdWo, evidence] = await Promise.all([
    db.query.workOrders.findFirst({ where: eq(workOrders.estimateId, id) }),
    listAttachments(ctx, "estimate_approval", id),
  ]);
  return { ...e, createdWorkOrder: createdWo ?? null, evidence };
}

export async function createEstimate(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "estimate.create");
  const input = estimateInput.parse(raw);
  return db.transaction(async (tx) => {
    let checkin;
    let workOrderId: string | null = null;
    if (input.workOrderId) {
      // Estimate tambahan untuk WO berjalan (BR-006)
      const wo = await tx.query.workOrders.findFirst({ where: and(eq(workOrders.id, input.workOrderId), eq(workOrders.companyId, ctx.companyId)) });
      if (!wo) throw new NotFoundError("Work Order");
      if (wo.status === "cancelled" || wo.handoverAt) throw new ValidationError("Work Order sudah ditutup");
      const activeInvoice = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, wo.id), ne(invoices.status, "void")) });
      if (activeInvoice) throw new ValidationError(`Invoice ${activeInvoice.invoiceNumber} sudah terbit. Void invoice untuk menambah pekerjaan.`);
      if (wo.status === "completed" && input.items.some((i) => i.itemType === "service")) {
        throw new ValidationError("Work Order sudah lulus QC: estimate tambahan hanya untuk part/material yang sudah terpakai");
      }
      checkin = await tx.query.vehicleCheckins.findFirst({ where: eq(vehicleCheckins.id, wo.checkinId) });
      workOrderId = wo.id;
    } else {
      if (!input.checkinId) throw new ValidationError("Check-in wajib dipilih");
      checkin = await tx.query.vehicleCheckins.findFirst({ where: and(eq(vehicleCheckins.id, input.checkinId), eq(vehicleCheckins.companyId, ctx.companyId)) });
      if (checkin) {
        const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.checkinId, checkin.id) });
        if (wo) throw new ValidationError(`Check-in sudah memiliki Work Order ${wo.woNumber}. Buat estimate tambahan dari Work Order.`);
      }
    }
    if (!checkin) throw new NotFoundError("Check-in");
    assertBranchAccess(ctx, checkin.branchId);
    if (["cancelled", "completed"].includes(checkin.status)) throw new ValidationError("Check-in sudah ditutup");

    const company = await tx.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
    const lines = await resolveItems(tx, ctx, input.items);
    const totals = calcTotals(lines, company!.taxRate);
    const estimateNumber = await nextDocNumber(tx, ctx.companyId, checkin.branchId, "EST");
    const [row] = await tx
      .insert(estimates)
      .values({
        companyId: ctx.companyId,
        branchId: checkin.branchId,
        estimateNumber,
        checkinId: checkin.id,
        workOrderId,
        customerId: checkin.customerId,
        vehicleId: checkin.vehicleId,
        taxRate: company!.taxRate,
        ...totals,
        status: "draft",
        validUntil: addDaysISO(todayISO(), company!.settings.estimateValidDays ?? 7),
        notes: input.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await tx.insert(estimateItems).values(lines.map((l) => ({ ...l, estimateId: row.id })));
    await writeAudit(tx, ctx, { action: "CREATE", entity: "estimate", entityId: row.id, referenceNumber: estimateNumber, newValue: { ...totals, items: lines.length }, branchId: row.branchId });
    return row;
  });
}

/** Ubah item estimate — hanya saat Draft/Sent (belum ada keputusan customer) */
export async function updateEstimate(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "estimate.create");
  const input = estimateInput.pick({ items: true, notes: true }).parse(raw);
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(estimates).where(and(eq(estimates.id, id), eq(estimates.companyId, ctx.companyId))).for("update");
    if (!e) throw new NotFoundError("Estimate");
    assertBranchAccess(ctx, e.branchId);
    if (!["draft", "sent"].includes(e.status)) {
      throw new ValidationError("Estimate yang sudah diputuskan customer tidak dapat diubah (BR-010). Buat estimate tambahan.");
    }
    const oldItems = await tx.select().from(estimateItems).where(eq(estimateItems.estimateId, id));
    const lines = await resolveItems(tx, ctx, input.items);
    const totals = calcTotals(lines, e.taxRate);
    await tx.delete(estimateItems).where(eq(estimateItems.estimateId, id));
    await tx.insert(estimateItems).values(lines.map((l) => ({ ...l, estimateId: id })));
    await tx
      .update(estimates)
      .set({ ...totals, notes: input.notes, status: "draft", updatedAt: new Date(), updatedBy: ctx.userId })
      .where(eq(estimates.id, id));
    await writeAudit(tx, ctx, {
      action: "UPDATE",
      entity: "estimate",
      entityId: id,
      referenceNumber: e.estimateNumber,
      oldValue: { grandTotal: e.grandTotal, items: oldItems.map((i) => ({ d: i.description, q: i.qty, p: i.price, disc: i.discount })) },
      newValue: { grandTotal: totals.grandTotal, items: lines.map((i) => ({ d: i.description, q: i.qty, p: i.price, disc: i.discount })) },
      branchId: e.branchId,
    });
  });
}

export async function sendEstimate(ctx: AuthContext, id: string) {
  requirePermission(ctx, "estimate.create");
  await db.transaction(async (tx) => {
    const e = await tx.query.estimates.findFirst({ where: and(eq(estimates.id, id), eq(estimates.companyId, ctx.companyId)) });
    if (!e) throw new NotFoundError("Estimate");
    assertBranchAccess(ctx, e.branchId);
    if (e.status !== "draft") throw new ValidationError("Hanya estimate Draft yang dapat dikirim");
    await tx.update(estimates).set({ status: "sent", sentAt: new Date(), updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(estimates.id, id));
    await writeAudit(tx, ctx, { action: "STATUS", entity: "estimate", entityId: id, referenceNumber: e.estimateNumber, newValue: { status: "sent" }, branchId: e.branchId });
    await notify(tx, {
      companyId: ctx.companyId,
      branchId: e.branchId,
      permission: "estimate.approve",
      type: "approval_pending",
      title: "Approval estimate tertunda",
      message: `${e.estimateNumber} menunggu persetujuan customer`,
      link: `/estimates/${id}`,
    });
  });
}

const approvalInput = z.object({
  decisions: z.array(z.object({ itemId: z.uuid(), decision: z.enum(["approved", "rejected"]) })).min(1, "Keputusan item wajib diisi"),
  customerName: reqStr("Nama yang menyetujui"),
  channel: z.enum(["in_person", "phone", "whatsapp", "email"]),
  evidenceNote: optStr,
});

/**
 * Customer approval (URS-EST-002/003): approve penuh, sebagian atau reject.
 * Menyimpan waktu, user perekam dan evidence. Untuk estimate tambahan, item jasa yang disetujui
 * otomatis menjadi job baru pada Work Order (BR-006).
 */
export async function recordApproval(ctx: AuthContext, id: string, raw: unknown, evidenceFiles: UploadFile[] = []) {
  requirePermission(ctx, "estimate.approve");
  const input = approvalInput.parse(raw);
  if (!input.evidenceNote && !evidenceFiles.some((f) => f.data.length)) {
    throw new ValidationError("Evidence approval wajib diisi (catatan atau lampiran foto/screenshot)");
  }
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(estimates).where(and(eq(estimates.id, id), eq(estimates.companyId, ctx.companyId))).for("update");
    if (!e) throw new NotFoundError("Estimate");
    assertBranchAccess(ctx, e.branchId);
    if (!["draft", "sent"].includes(e.status)) throw new ValidationError("Estimate sudah diputuskan / tidak aktif");
    if (e.validUntil && e.validUntil < todayISO()) {
      await tx.update(estimates).set({ status: "expired" }).where(eq(estimates.id, id));
      throw new ValidationError("Estimate sudah kedaluwarsa. Buat estimate baru.");
    }
    const items = await tx.select().from(estimateItems).where(eq(estimateItems.estimateId, id));
    const decisionMap = new Map(input.decisions.map((d) => [d.itemId, d.decision]));
    for (const it of items) {
      if (!decisionMap.has(it.id)) throw new ValidationError(`Keputusan untuk item "${it.description}" belum diisi`);
    }
    for (const it of items) {
      await tx.update(estimateItems).set({ approvalStatus: decisionMap.get(it.id)! }).where(eq(estimateItems.id, it.id));
    }
    const approved = items.filter((it) => decisionMap.get(it.id) === "approved");
    const status = approved.length === 0 ? "rejected" : approved.length === items.length ? "approved" : "partially_approved";
    const approvedTotals = calcTotals(approved, e.taxRate);

    let attachmentId: string | null = null;
    const saved = await addAttachments(tx, ctx, "estimate_approval", id, evidenceFiles, "Evidence approval");
    if (saved.length) attachmentId = saved[0].id;

    await tx.insert(estimateApprovals).values({
      estimateId: id,
      decision: status,
      customerName: input.customerName,
      channel: input.channel,
      evidenceNote: input.evidenceNote,
      attachmentId,
      approvedTotal: approvedTotals.grandTotal,
      recordedBy: ctx.userId,
    });
    await tx.update(estimates).set({ status, decidedAt: new Date(), updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(estimates.id, id));
    await writeAudit(tx, ctx, {
      action: status === "rejected" ? "REJECT" : "APPROVE",
      entity: "estimate",
      entityId: id,
      referenceNumber: e.estimateNumber,
      newValue: { status, approvedItems: approved.length, totalItems: items.length, approvedTotal: approvedTotals.grandTotal, channel: input.channel, by: input.customerName },
      branchId: e.branchId,
    });

    // Estimate tambahan -> job baru pada WO berjalan
    if (e.workOrderId && approved.length) {
      await addApprovedJobsToWorkOrder(tx, ctx, e.workOrderId, approved);
    }
    return { status };
  });
}

export async function cancelEstimate(ctx: AuthContext, id: string, rawReason: unknown) {
  requirePermission(ctx, "estimate.cancel");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const e = await tx.query.estimates.findFirst({ where: and(eq(estimates.id, id), eq(estimates.companyId, ctx.companyId)) });
    if (!e) throw new NotFoundError("Estimate");
    assertBranchAccess(ctx, e.branchId);
    const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.estimateId, id) });
    if (wo) throw new ValidationError(`Estimate sudah menjadi Work Order ${wo.woNumber}`);
    if (["cancelled"].includes(e.status)) throw new ValidationError("Estimate sudah dibatalkan");
    if (e.workOrderId && ["approved", "partially_approved"].includes(e.status)) {
      throw new ValidationError("Estimate tambahan yang sudah disetujui tidak dapat dibatalkan");
    }
    await tx.update(estimates).set({ status: "cancelled", cancelReason: why, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(estimates.id, id));
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "estimate", entityId: id, referenceNumber: e.estimateNumber, reason: why, branchId: e.branchId });
  });
}
