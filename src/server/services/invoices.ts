import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import {
  companies,
  customers,
  invoiceItems,
  invoices,
  partRequestItems,
  partRequests,
  parts,
  paymentMethods,
  payments,
  users,
  vehicles,
  warehouses,
  workOrderJobs,
  workOrders,
} from "@/server/db/schema";
import { assertBranchAccess, branchScope, can, requireActiveBranch, requirePermission, type AuthContext } from "@/server/auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isoDate, likeQ, nonNeg, optStr, optUuid, pageArgs, positive, reason, reqUuid, parseReason, type ListParams } from "@/server/validation";
import { jakartaDayEnd, jakartaDayStart, round2, sum, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";
import { notify } from "./notifications";
import { calcLine, calcTotals } from "./estimates";
import { getPartAllowance } from "./workorders";
import { defaultWarehouse, stockIn, stockOut } from "./inventory";

type DraftItem = {
  itemType: string;
  itemId: string | null;
  referenceId: string | null;
  description: string;
  qty: number;
  price: number;
  discount: number;
  total: number;
  unitCost: number;
};

/**
 * Invoice berasal dari pekerjaan & part aktual (BR-007).
 * Part yang dipakai melebihi persetujuan customer memblokir invoice (BR-006, AC-002).
 */
export async function buildWorkOrderInvoiceDraft(tx: DbOrTx, wo: typeof workOrders.$inferSelect) {
  const blockers: string[] = [];
  const jobs = (await tx.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, wo.id)).orderBy(asc(workOrderJobs.sortOrder))).filter(
    (j) => j.status !== "cancelled",
  );
  const items: DraftItem[] = [];
  for (const j of jobs) {
    if (j.status !== "completed") {
      blockers.push(`Job "${j.description}" belum selesai`);
      continue;
    }
    items.push({
      itemType: "service",
      itemId: j.serviceId,
      referenceId: j.id,
      description: j.description,
      qty: 1,
      price: j.price,
      discount: j.discount,
      total: calcLine(1, j.price, j.discount),
      unitCost: 0,
    });
  }
  const allowance = await getPartAllowance(tx, wo);
  const costRows = await tx
    .select({
      partId: partRequestItems.partId,
      net: sql<number>`sum(${partRequestItems.qtyIssued} - ${partRequestItems.qtyReturned})::float8`,
      cost: sql<number>`sum((${partRequestItems.qtyIssued} - ${partRequestItems.qtyReturned}) * ${partRequestItems.unitCost})::float8`,
    })
    .from(partRequestItems)
    .innerJoin(partRequests, eq(partRequests.id, partRequestItems.partRequestId))
    .where(eq(partRequests.workOrderId, wo.id))
    .groupBy(partRequestItems.partId);
  for (const a of allowance) {
    if (a.netIssued <= 0) continue;
    if (a.unapprovedQty > 0) {
      blockers.push(`${a.description}: terpakai ${a.netIssued}, disetujui customer ${a.approvedQty}. Ajukan estimate tambahan atau retur part (BR-006).`);
      continue;
    }
    const c = costRows.find((r) => r.partId === a.partId);
    const unitCost = c && c.net > 0 ? round2(c.cost / c.net) : 0;
    // Diskon proporsional terhadap qty aktual vs qty disetujui
    const discount = a.approvedQty > 0 ? round2((a.approvedDiscount * a.netIssued) / a.approvedQty) : 0;
    items.push({
      itemType: a.itemType,
      itemId: a.partId,
      referenceId: null,
      description: a.description,
      qty: a.netIssued,
      price: a.price,
      discount,
      total: calcLine(a.netIssued, a.price, discount),
      unitCost,
    });
  }
  const pending = allowance.filter((a) => a.pendingRequest > 0);
  for (const p of pending) blockers.push(`Permintaan part ${p.description} masih terbuka (${p.pendingRequest}) — issue atau batalkan`);
  return { items, blockers };
}

export async function previewWorkOrderInvoice(ctx: AuthContext, woId: string) {
  requirePermission(ctx, "invoice.view");
  const wo = await db.query.workOrders.findFirst({ where: and(eq(workOrders.id, woId), eq(workOrders.companyId, ctx.companyId)) });
  if (!wo) throw new NotFoundError("Work Order");
  assertBranchAccess(ctx, wo.branchId);
  const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
  const draft = await buildWorkOrderInvoiceDraft(db, wo);
  if (wo.status !== "completed") draft.blockers.unshift("Work Order belum lulus QC (QC adalah gate sebelum invoice)");
  const totals = draft.items.length ? calcTotals(draft.items, company!.taxRate) : { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 };
  return { ...draft, totals, taxRate: company!.taxRate };
}

const invoiceInput = z.object({ additionalDiscount: nonNeg("Diskon").default(0), notes: optStr });

async function insertInvoice(
  tx: DbOrTx,
  ctx: AuthContext,
  base: {
    branchId: string;
    invoiceType: "workshop" | "counter";
    workOrderId?: string | null;
    customerId?: string | null;
    vehicleId?: string | null;
    warehouseId?: string | null;
    notes?: string | null;
    additionalDiscount: number;
  },
  items: DraftItem[],
) {
  if (!items.length) throw new ValidationError("Invoice tidak memiliki item yang dapat ditagihkan");
  if (base.additionalDiscount > 0 && !can(ctx, "invoice.discount")) throw new ForbiddenError("Diskon tambahan membutuhkan permission invoice.discount");
  const company = await tx.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
  const totals = calcTotals(items, company!.taxRate, base.additionalDiscount);
  const invoiceNumber = await nextDocNumber(tx, ctx.companyId, base.branchId, "INV");
  const [inv] = await tx
    .insert(invoices)
    .values({
      companyId: ctx.companyId,
      branchId: base.branchId,
      invoiceNumber,
      invoiceType: base.invoiceType,
      workOrderId: base.workOrderId ?? null,
      customerId: base.customerId ?? null,
      vehicleId: base.vehicleId ?? null,
      warehouseId: base.warehouseId ?? null,
      subtotal: totals.subtotal,
      itemDiscount: sum(items, (i) => i.discount),
      additionalDiscount: base.additionalDiscount,
      taxRate: company!.taxRate,
      tax: totals.tax,
      grandTotal: totals.grandTotal,
      costTotal: sum(items, (i) => i.qty * i.unitCost),
      paymentStatus: "unpaid",
      status: "issued",
      notes: base.notes ?? null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    })
    .returning();
  await tx.insert(invoiceItems).values(items.map((it, i) => ({ ...it, invoiceId: inv.id, sortOrder: i })));
  await writeAudit(tx, ctx, {
    action: "CREATE",
    entity: "invoice",
    entityId: inv.id,
    referenceNumber: invoiceNumber,
    newValue: { ...totals, additionalDiscount: base.additionalDiscount, items: items.length },
    branchId: base.branchId,
  });
  return inv;
}

/** Final invoice dari Work Order yang lulus QC */
export async function createWorkOrderInvoice(ctx: AuthContext, woId: string, raw: unknown = {}) {
  requirePermission(ctx, "invoice.create");
  const input = invoiceInput.parse(raw);
  return db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrders).where(and(eq(workOrders.id, woId), eq(workOrders.companyId, ctx.companyId))).for("update");
    if (!wo) throw new NotFoundError("Work Order");
    assertBranchAccess(ctx, wo.branchId);
    if (wo.status !== "completed") throw new ValidationError("Invoice hanya dapat dibuat setelah Work Order lulus QC");
    const existing = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, woId), ne(invoices.status, "void")) });
    if (existing) throw new ValidationError(`Work Order sudah memiliki invoice ${existing.invoiceNumber}`);
    const draft = await buildWorkOrderInvoiceDraft(tx, wo);
    if (draft.blockers.length) throw new ValidationError(draft.blockers.join("; "));
    const inv = await insertInvoice(
      tx,
      ctx,
      {
        branchId: wo.branchId,
        invoiceType: "workshop",
        workOrderId: wo.id,
        customerId: wo.customerId,
        vehicleId: wo.vehicleId,
        notes: input.notes,
        additionalDiscount: input.additionalDiscount,
      },
      draft.items,
    );
    await notify(tx, {
      companyId: ctx.companyId,
      branchId: wo.branchId,
      permission: "payment.receive",
      type: "invoice_ready",
      title: "Invoice siap dibayar",
      message: `${inv.invoiceNumber} (${wo.woNumber})`,
      link: `/invoices/${inv.id}`,
    });
    return inv;
  });
}

const counterSaleInput = z.object({
  customerId: optUuid,
  warehouseId: optUuid,
  additionalDiscount: nonNeg("Diskon").default(0),
  notes: optStr,
  items: z
    .array(
      z.object({
        partId: reqUuid("Part"),
        qty: positive("Qty"),
        price: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === "" || v == null ? null : Number(v))),
        discount: nonNeg("Diskon").default(0),
      }),
    )
    .min(1, "Minimal 1 item"),
});

/** Penjualan part langsung (counter) — stok keluar melalui transaksi sah (BR-005) */
export async function createCounterSale(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "invoice.create");
  const branchId = requireActiveBranch(ctx);
  const input = counterSaleInput.parse(raw);
  return db.transaction(async (tx) => {
    const wh = input.warehouseId
      ? await tx.query.warehouses.findFirst({ where: and(eq(warehouses.id, input.warehouseId), eq(warehouses.branchId, branchId)) })
      : await defaultWarehouse(tx, branchId);
    if (!wh) throw new ValidationError("Gudang tidak valid untuk cabang aktif");
    if (input.customerId) {
      const c = await tx.query.customers.findFirst({ where: and(eq(customers.id, input.customerId), eq(customers.companyId, ctx.companyId)) });
      if (!c) throw new NotFoundError("Customer");
    }
    const draftItems: DraftItem[] = [];
    for (const it of input.items) {
      const part = await tx.query.parts.findFirst({ where: and(eq(parts.id, it.partId), eq(parts.companyId, ctx.companyId)) });
      if (!part) throw new NotFoundError("Part");
      const price = it.price ?? part.sellingPrice;
      draftItems.push({
        itemType: part.itemType,
        itemId: part.id,
        referenceId: null,
        description: part.partName,
        qty: it.qty,
        price,
        discount: it.discount,
        total: calcLine(it.qty, price, it.discount),
        unitCost: 0,
      });
    }
    const inv = await insertInvoice(
      tx,
      ctx,
      { branchId, invoiceType: "counter", customerId: input.customerId, warehouseId: wh.id, notes: input.notes, additionalDiscount: input.additionalDiscount },
      draftItems,
    );
    let costTotal = 0;
    const saved = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    for (const item of saved) {
      const { unitCost } = await stockOut(tx, {
        companyId: ctx.companyId,
        branchId,
        warehouseId: wh.id,
        partId: item.itemId!,
        qty: item.qty,
        type: "sale",
        refType: "invoice",
        refId: inv.id,
        refNumber: inv.invoiceNumber,
        userId: ctx.userId,
      });
      costTotal += item.qty * unitCost;
      await tx.update(invoiceItems).set({ unitCost }).where(eq(invoiceItems.id, item.id));
    }
    await tx.update(invoices).set({ costTotal: round2(costTotal) }).where(eq(invoices.id, inv.id));
    return inv;
  });
}

export async function voidInvoice(ctx: AuthContext, id: string, rawReason: unknown) {
  requirePermission(ctx, "invoice.void");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.companyId, ctx.companyId))).for("update");
    if (!inv) throw new NotFoundError("Invoice");
    assertBranchAccess(ctx, inv.branchId);
    if (inv.status === "void") throw new ValidationError("Invoice sudah void");
    if (inv.paidAmount > 0) throw new ValidationError("Invoice sudah memiliki pembayaran. Refund / void pembayaran terlebih dahulu.");
    if (inv.workOrderId) {
      const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, inv.workOrderId) });
      if (wo?.handoverAt) throw new ValidationError("Kendaraan sudah diserahkan; invoice tidak dapat di-void");
    }
    if (inv.invoiceType === "counter" && inv.warehouseId) {
      const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      for (const it of items) {
        if (!it.itemId) continue;
        await stockIn(tx, {
          companyId: ctx.companyId,
          branchId: inv.branchId,
          warehouseId: inv.warehouseId,
          partId: it.itemId,
          qty: it.qty,
          unitCost: it.unitCost,
          type: "sale_void",
          refType: "invoice",
          refId: inv.id,
          refNumber: inv.invoiceNumber,
          notes: why,
          userId: ctx.userId,
        });
      }
    }
    await tx.update(invoices).set({ status: "void", voidReason: why, voidedAt: new Date(), voidedBy: ctx.userId, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(invoices.id, id));
    await writeAudit(tx, ctx, { action: "VOID", entity: "invoice", entityId: id, referenceNumber: inv.invoiceNumber, oldValue: { grandTotal: inv.grandTotal }, reason: why, branchId: inv.branchId });
  });
}

/** Otorisasi piutang/tempo — syarat handover alternatif selain lunas */
export async function authorizeReceivable(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "payment.receivable");
  const input = z.object({ dueDate: isoDate("Jatuh tempo"), note: z.string().trim().min(3, "Catatan otorisasi wajib diisi") }).parse(raw);
  if (input.dueDate < todayISO()) throw new ValidationError("Jatuh tempo tidak boleh di masa lalu");
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.companyId, ctx.companyId))).for("update");
    if (!inv) throw new NotFoundError("Invoice");
    assertBranchAccess(ctx, inv.branchId);
    if (inv.status !== "issued") throw new ValidationError("Invoice tidak aktif");
    if (inv.paidAmount >= inv.grandTotal) throw new ValidationError("Invoice sudah lunas");
    await tx
      .update(invoices)
      .set({ arAuthorizedBy: ctx.userId, arAuthorizedAt: new Date(), arDueDate: input.dueDate, arNote: input.note, updatedAt: new Date(), updatedBy: ctx.userId })
      .where(eq(invoices.id, id));
    await writeAudit(tx, ctx, {
      action: "APPROVE",
      entity: "invoice_receivable",
      entityId: id,
      referenceNumber: inv.invoiceNumber,
      newValue: { outstanding: round2(inv.grandTotal - inv.paidAmount), dueDate: input.dueDate },
      reason: input.note,
      branchId: inv.branchId,
    });
  });
}

export async function listInvoices(
  ctx: AuthContext,
  params: ListParams & { paymentStatus?: string | null; from?: string | null; to?: string | null; outstanding?: boolean } = {},
) {
  requirePermission(ctx, "invoice.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(invoices.companyId, ctx.companyId),
    branchScope(ctx, invoices.branchId),
    params.paymentStatus ? eq(invoices.paymentStatus, params.paymentStatus) : undefined,
    params.outstanding ? and(eq(invoices.status, "issued"), sql`${invoices.paidAmount} < ${invoices.grandTotal}`) : undefined,
    params.from ? gte(invoices.invoiceDate, jakartaDayStart(params.from)) : undefined,
    params.to ? lte(invoices.invoiceDate, jakartaDayEnd(params.to)) : undefined,
    like ? or(ilike(invoices.invoiceNumber, like), ilike(customers.name, like), ilike(vehicles.plateNumber, like), ilike(workOrders.woNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceType: invoices.invoiceType,
        invoiceDate: invoices.invoiceDate,
        grandTotal: invoices.grandTotal,
        paidAmount: invoices.paidAmount,
        paymentStatus: invoices.paymentStatus,
        status: invoices.status,
        arDueDate: invoices.arDueDate,
        customerName: customers.name,
        plateNumber: vehicles.plateNumber,
        woNumber: workOrders.woNumber,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .leftJoin(vehicles, eq(vehicles.id, invoices.vehicleId))
      .leftJoin(workOrders, eq(workOrders.id, invoices.workOrderId))
      .where(where)
      .orderBy(desc(invoices.invoiceDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .leftJoin(vehicles, eq(vehicles.id, invoices.vehicleId))
      .leftJoin(workOrders, eq(workOrders.id, invoices.workOrderId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** WO yang lulus QC dan belum memiliki invoice (antrian kasir) */
export async function readyToInvoice(ctx: AuthContext) {
  requirePermission(ctx, "invoice.view");
  return db
    .select({
      id: workOrders.id,
      woNumber: workOrders.woNumber,
      completedAt: workOrders.completedAt,
      customerName: customers.name,
      plateNumber: vehicles.plateNumber,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
    .where(
      and(
        eq(workOrders.companyId, ctx.companyId),
        branchScope(ctx, workOrders.branchId),
        eq(workOrders.status, "completed"),
        isNull(workOrders.handoverAt),
        notExists(db.select({ x: sql`1` }).from(invoices).where(and(eq(invoices.workOrderId, workOrders.id), ne(invoices.status, "void")))),
      ),
    )
    .orderBy(asc(workOrders.completedAt));
}

export async function getInvoice(ctx: AuthContext, id: string) {
  requirePermission(ctx, "invoice.view");
  const inv = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.companyId, ctx.companyId)),
    with: {
      items: { orderBy: asc(invoiceItems.sortOrder) },
      payments: { with: { method: true, receiver: { columns: { id: true, name: true } } }, orderBy: asc(payments.paymentDate) },
      customer: true,
      vehicle: { with: { brand: true, model: true } },
      workOrder: true,
      branch: true,
    },
  });
  if (!inv) throw new NotFoundError("Invoice");
  assertBranchAccess(ctx, inv.branchId);
  const [company, arUser] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) }),
    inv.arAuthorizedBy ? db.query.users.findFirst({ where: eq(users.id, inv.arAuthorizedBy), columns: { name: true } }) : null,
  ]);
  return { ...inv, company: company!, arAuthorizedByName: arUser?.name ?? null, outstanding: round2(inv.grandTotal - inv.paidAmount) };
}

// ---------------------------------------------------------------------------
// Payment (URS-CAS-002, AC-005, AC-006)
// ---------------------------------------------------------------------------
export async function paymentMethodOptions(ctx: AuthContext) {
  return db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.companyId, ctx.companyId), eq(paymentMethods.status, "active")))
    .orderBy(asc(paymentMethods.sortOrder));
}

/** Hitung ulang paid amount & payment status dari tabel payment (source of truth) */
async function recomputeInvoicePayment(tx: DbOrTx, invoiceId: string) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  const [agg] = await tx
    .select({
      paid: sql<number>`coalesce(sum(case when ${payments.type} = 'payment' then ${payments.amount} else 0 end), 0)::float8`,
      refunded: sql<number>`coalesce(sum(case when ${payments.type} = 'refund' then ${payments.amount} else 0 end), 0)::float8`,
    })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "posted")));
  const net = round2(agg.paid - agg.refunded);
  const status = net >= inv.grandTotal - 0.001 && net > 0 ? "paid" : net > 0 ? "partial" : agg.refunded > 0 ? "refunded" : "unpaid";
  await tx.update(invoices).set({ paidAmount: net, paymentStatus: status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  return { paidAmount: net, paymentStatus: status, grandTotal: inv.grandTotal };
}

const paymentInput = z.object({
  idempotencyKey: z.string().min(8, "Idempotency key tidak valid"),
  notes: optStr,
  lines: z
    .array(
      z.object({
        paymentMethodId: reqUuid("Metode pembayaran"),
        amount: positive("Nominal"),
        tenderedAmount: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === "" || v == null ? null : Number(v))),
        referenceNumber: optStr,
      }),
    )
    .min(1, "Minimal 1 baris pembayaran"),
});

/**
 * Terima pembayaran (single / split). Row lock invoice + idempotency key mencegah duplicate payment;
 * total tidak boleh melebihi outstanding (AC-006).
 */
export async function receivePayment(ctx: AuthContext, invoiceId: string, raw: unknown) {
  requirePermission(ctx, "payment.receive");
  const input = paymentInput.parse(raw);
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, ctx.companyId))).for("update");
    if (!inv) throw new NotFoundError("Invoice");
    assertBranchAccess(ctx, inv.branchId);
    const dup = await tx.query.payments.findFirst({ where: and(eq(payments.companyId, ctx.companyId), eq(payments.idempotencyKey, `${input.idempotencyKey}:0`)) });
    if (dup) {
      const existing = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.companyId, ctx.companyId), sql`${payments.idempotencyKey} like ${`${input.idempotencyKey}:%`}`));
      return { duplicate: true, payments: existing, ...(await recomputeInvoicePayment(tx, invoiceId)) };
    }
    if (inv.status !== "issued") throw new ValidationError("Invoice tidak aktif (void)");
    const outstanding = round2(inv.grandTotal - inv.paidAmount);
    const total = sum(input.lines, (l) => l.amount);
    if (outstanding <= 0) throw new ValidationError("Invoice sudah lunas");
    if (total > outstanding + 0.001) {
      throw new ValidationError(`Total pembayaran Rp${total.toLocaleString("id-ID")} melebihi sisa tagihan Rp${outstanding.toLocaleString("id-ID")} (AC-006)`);
    }
    const methods = await paymentMethodOptions(ctx);
    const created = [];
    for (const [i, line] of input.lines.entries()) {
      const m = methods.find((x) => x.id === line.paymentMethodId);
      if (!m) throw new NotFoundError("Metode pembayaran");
      let change: number | null = null;
      if (m.type === "cash" && line.tenderedAmount != null) {
        if (line.tenderedAmount < line.amount) throw new ValidationError("Uang diterima kurang dari nominal pembayaran tunai");
        change = round2(line.tenderedAmount - line.amount);
      }
      if (m.requiresReference && !line.referenceNumber) throw new ValidationError(`Nomor referensi wajib diisi untuk ${m.name}`);
      const paymentNumber = await nextDocNumber(tx, ctx.companyId, inv.branchId, "PAY");
      const [p] = await tx
        .insert(payments)
        .values({
          companyId: ctx.companyId,
          branchId: inv.branchId,
          paymentNumber,
          invoiceId,
          paymentMethodId: m.id,
          type: "payment",
          amount: line.amount,
          tenderedAmount: m.type === "cash" ? line.tenderedAmount : null,
          changeAmount: change,
          referenceNumber: line.referenceNumber,
          notes: input.notes,
          idempotencyKey: `${input.idempotencyKey}:${i}`,
          receivedBy: ctx.userId,
        })
        .returning();
      created.push(p);
    }
    const res = await recomputeInvoicePayment(tx, invoiceId);
    await writeAudit(tx, ctx, {
      action: "CREATE",
      entity: "payment",
      entityId: invoiceId,
      referenceNumber: inv.invoiceNumber,
      newValue: { lines: created.map((c) => ({ number: c.paymentNumber, amount: c.amount, method: c.paymentMethodId })), status: res.paymentStatus },
      branchId: inv.branchId,
    });
    if (res.paymentStatus === "paid" && inv.workOrderId) {
      await notify(tx, {
        companyId: ctx.companyId,
        branchId: inv.branchId,
        permission: "handover.execute",
        type: "ready_handover",
        title: "Siap serah terima",
        message: `${inv.invoiceNumber} lunas — kendaraan siap diserahkan`,
        link: `/work-orders/${inv.workOrderId}`,
      });
    }
    return { duplicate: false, payments: created, ...res };
  });
}

export async function voidPayment(ctx: AuthContext, paymentId: string, rawReason: unknown) {
  requirePermission(ctx, "payment.void");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.companyId, ctx.companyId))).for("update");
    if (!p) throw new NotFoundError("Pembayaran");
    assertBranchAccess(ctx, p.branchId);
    if (p.status === "void") throw new ValidationError("Pembayaran sudah void");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId)).for("update");
    if (inv.workOrderId) {
      const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, inv.workOrderId) });
      if (wo?.handoverAt && p.type === "payment") throw new ValidationError("Kendaraan sudah diserahkan; gunakan refund bila diperlukan");
    }
    await tx.update(payments).set({ status: "void", voidReason: why, voidedAt: new Date(), voidedBy: ctx.userId }).where(eq(payments.id, paymentId));
    const res = await recomputeInvoicePayment(tx, p.invoiceId);
    if (res.paidAmount < 0) throw new ValidationError("Void pembayaran menyebabkan saldo negatif — void refund terlebih dahulu");
    await writeAudit(tx, ctx, { action: "VOID", entity: "payment", entityId: paymentId, referenceNumber: p.paymentNumber, oldValue: { amount: p.amount, type: p.type }, reason: why, branchId: p.branchId });
  });
}

const refundInput = z.object({ paymentMethodId: reqUuid("Metode refund"), amount: positive("Nominal refund"), reason, referenceNumber: optStr });

/** Refund hanya dengan permission dan wajib alasan (URS-CAS-004) */
export async function refundPayment(ctx: AuthContext, invoiceId: string, raw: unknown) {
  requirePermission(ctx, "payment.refund");
  const input = refundInput.parse(raw);
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, ctx.companyId))).for("update");
    if (!inv) throw new NotFoundError("Invoice");
    assertBranchAccess(ctx, inv.branchId);
    if (input.amount > inv.paidAmount + 0.001) throw new ValidationError(`Refund melebihi jumlah yang sudah dibayar (Rp${inv.paidAmount.toLocaleString("id-ID")})`);
    const paymentNumber = await nextDocNumber(tx, ctx.companyId, inv.branchId, "PAY");
    const [p] = await tx
      .insert(payments)
      .values({
        companyId: ctx.companyId,
        branchId: inv.branchId,
        paymentNumber,
        invoiceId,
        paymentMethodId: input.paymentMethodId,
        type: "refund",
        amount: input.amount,
        referenceNumber: input.referenceNumber,
        notes: input.reason,
        receivedBy: ctx.userId,
      })
      .returning();
    const res = await recomputeInvoicePayment(tx, invoiceId);
    await writeAudit(tx, ctx, { action: "REFUND", entity: "payment", entityId: p.id, referenceNumber: `${paymentNumber} / ${inv.invoiceNumber}`, newValue: { amount: input.amount }, reason: input.reason, branchId: inv.branchId });
    return { payment: p, ...res };
  });
}

export async function listPayments(ctx: AuthContext, params: ListParams & { from?: string | null; to?: string | null; methodId?: string | null } = {}) {
  requirePermission(ctx, "payment.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(payments.companyId, ctx.companyId),
    branchScope(ctx, payments.branchId),
    params.methodId ? eq(payments.paymentMethodId, params.methodId) : undefined,
    params.from ? gte(payments.paymentDate, jakartaDayStart(params.from)) : undefined,
    params.to ? lte(payments.paymentDate, jakartaDayEnd(params.to)) : undefined,
    like ? or(ilike(payments.paymentNumber, like), ilike(invoices.invoiceNumber, like), ilike(payments.referenceNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        paymentDate: payments.paymentDate,
        type: payments.type,
        amount: payments.amount,
        status: payments.status,
        referenceNumber: payments.referenceNumber,
        methodName: paymentMethods.name,
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        receivedBy: users.name,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .leftJoin(users, eq(users.id, payments.receivedBy))
      .where(where)
      .orderBy(desc(payments.paymentDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** Rekap closing kasir per metode & kasir pada tanggal tertentu */
export async function cashierClosing(ctx: AuthContext, date: string) {
  requirePermission(ctx, "payment.view");
  const where = and(
    eq(payments.companyId, ctx.companyId),
    branchScope(ctx, payments.branchId),
    eq(payments.status, "posted"),
    gte(payments.paymentDate, jakartaDayStart(date)),
    lte(payments.paymentDate, jakartaDayEnd(date)),
  );
  const byMethod = await db
    .select({
      method: paymentMethods.name,
      type: paymentMethods.type,
      received: sql<number>`coalesce(sum(case when ${payments.type}='payment' then ${payments.amount} else 0 end),0)::float8`,
      refunded: sql<number>`coalesce(sum(case when ${payments.type}='refund' then ${payments.amount} else 0 end),0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
    .where(where)
    .groupBy(paymentMethods.name, paymentMethods.type, paymentMethods.sortOrder)
    .orderBy(asc(paymentMethods.sortOrder));
  const byCashier = await db
    .select({
      cashier: users.name,
      received: sql<number>`coalesce(sum(case when ${payments.type}='payment' then ${payments.amount} else -${payments.amount} end),0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.receivedBy))
    .where(where)
    .groupBy(users.name);
  return { byMethod, byCashier, total: round2(byMethod.reduce((a, m) => a + m.received - m.refunded, 0)) };
}

export async function invoicesForWorkOrders(woIds: string[]) {
  if (!woIds.length) return [];
  return db.select().from(invoices).where(and(inArray(invoices.workOrderId, woIds), ne(invoices.status, "void")));
}
