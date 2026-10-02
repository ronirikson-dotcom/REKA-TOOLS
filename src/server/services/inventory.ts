import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx, type Tx } from "@/server/db";
import {
  branches,
  goodsReceiptItems,
  goodsReceipts,
  inventory,
  invoices,
  partCategories,
  partRequestItems,
  partRequests,
  parts,
  purchaseOrderItems,
  purchaseOrders,
  stockAdjustmentItems,
  stockAdjustments,
  stockMovements,
  stockTransferItems,
  stockTransfers,
  suppliers,
  users,
  vehicles,
  warehouses,
  workOrderMechanics,
  workOrders,
} from "@/server/db/schema";
import { assertBranchAccess, branchScope, can, requireActiveBranch, requireAnyPermission, requirePermission, scopeBranchIds, type AuthContext } from "@/server/auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isoDate, likeQ, nonNeg, optDate, optStr, optUuid, pageArgs, positive, reason, reqStr, reqUuid, parseReason, type ListParams } from "@/server/validation";
import { jakartaDayEnd, jakartaDayStart, round2, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";
import { notify } from "./notifications";
import { getPartAllowance, recomputeWoStatus, setWoStatus } from "./workorders";

// ---------------------------------------------------------------------------
// Low-level stock posting — satu-satunya jalur perubahan saldo inventory (BR-005, BR-009)
// ---------------------------------------------------------------------------
type StockPost = {
  companyId: string;
  branchId: string;
  warehouseId: string;
  partId: string;
  qty: number;
  type: string;
  refType: string;
  refId?: string | null;
  refNumber?: string | null;
  notes?: string | null;
  userId: string;
};

async function lockInventory(tx: DbOrTx, warehouseId: string, partId: string) {
  await tx.insert(inventory).values({ warehouseId, partId, quantity: 0, averageCost: 0 }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(inventory)
    .where(and(eq(inventory.warehouseId, warehouseId), eq(inventory.partId, partId)))
    .for("update");
  return row;
}

/** Stok masuk; updateAverage=true menghitung ulang moving average cost */
export async function stockIn(tx: DbOrTx, p: StockPost & { unitCost: number; updateAverage?: boolean }) {
  if (p.qty <= 0) throw new ValidationError("Qty harus lebih dari 0");
  const inv = await lockInventory(tx, p.warehouseId, p.partId);
  const newQty = round2(inv.quantity + p.qty);
  let avg = inv.averageCost;
  if (p.updateAverage !== false) {
    avg = inv.quantity <= 0 ? p.unitCost : round2((inv.quantity * inv.averageCost + p.qty * p.unitCost) / newQty);
  }
  await tx.update(inventory).set({ quantity: newQty, averageCost: avg, updatedAt: new Date() }).where(eq(inventory.id, inv.id));
  await tx.insert(stockMovements).values({
    companyId: p.companyId,
    branchId: p.branchId,
    warehouseId: p.warehouseId,
    partId: p.partId,
    transactionType: p.type,
    referenceType: p.refType,
    referenceId: p.refId ?? null,
    referenceNumber: p.refNumber ?? null,
    quantityIn: p.qty,
    quantityOut: 0,
    unitCost: p.unitCost,
    balanceAfter: newQty,
    notes: p.notes ?? null,
    createdBy: p.userId,
  });
  return { balance: newQty, averageCost: avg };
}

/** Stok keluar dengan row lock — menolak bila stok tidak cukup (tidak boleh negatif) */
export async function stockOut(tx: DbOrTx, p: StockPost) {
  if (p.qty <= 0) throw new ValidationError("Qty harus lebih dari 0");
  const inv = await lockInventory(tx, p.warehouseId, p.partId);
  if (inv.quantity + 1e-9 < p.qty) {
    const part = await tx.query.parts.findFirst({ where: eq(parts.id, p.partId) });
    throw new ValidationError(`Stok ${part?.partName ?? "part"} tidak cukup (tersedia ${inv.quantity}, diminta ${p.qty})`);
  }
  const newQty = round2(inv.quantity - p.qty);
  await tx.update(inventory).set({ quantity: newQty, updatedAt: new Date() }).where(eq(inventory.id, inv.id));
  await tx.insert(stockMovements).values({
    companyId: p.companyId,
    branchId: p.branchId,
    warehouseId: p.warehouseId,
    partId: p.partId,
    transactionType: p.type,
    referenceType: p.refType,
    referenceId: p.refId ?? null,
    referenceNumber: p.refNumber ?? null,
    quantityIn: 0,
    quantityOut: p.qty,
    unitCost: inv.averageCost,
    balanceAfter: newQty,
    notes: p.notes ?? null,
    createdBy: p.userId,
  });
  return { unitCost: inv.averageCost, balance: newQty };
}

/** Notifikasi low stock (SRS 4.11) */
export async function notifyLowStock(tx: DbOrTx, companyId: string, branchId: string, warehouseId: string, partIds: string[]) {
  if (!partIds.length) return;
  const rows = await tx
    .select({ partName: parts.partName, sku: parts.sku, qty: inventory.quantity, min: parts.minimumStock })
    .from(inventory)
    .innerJoin(parts, eq(parts.id, inventory.partId))
    .where(and(eq(inventory.warehouseId, warehouseId), inArray(inventory.partId, partIds), sql`${inventory.quantity} <= ${parts.minimumStock}`));
  for (const r of rows) {
    await notify(tx, {
      companyId,
      branchId,
      permission: "inventory.receive",
      type: "low_stock",
      title: "Stok menipis",
      message: `${r.partName} (${r.sku}) tersisa ${r.qty}, minimum ${r.min}`,
      link: `/inventory?low=1`,
    });
  }
}

export async function defaultWarehouse(tx: DbOrTx, branchId: string) {
  const wh = await tx.query.warehouses.findFirst({
    where: and(eq(warehouses.branchId, branchId), eq(warehouses.status, "active")),
    orderBy: [desc(warehouses.isDefault), asc(warehouses.code)],
  });
  if (!wh) throw new ValidationError("Cabang belum memiliki gudang aktif");
  return wh;
}

export async function warehouseOptions(ctx: AuthContext, all = false) {
  return db
    .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name, branchId: warehouses.branchId, branchName: branches.name, isDefault: warehouses.isDefault })
    .from(warehouses)
    .innerJoin(branches, eq(branches.id, warehouses.branchId))
    .where(and(eq(warehouses.companyId, ctx.companyId), eq(warehouses.status, "active"), all ? undefined : branchScope(ctx, warehouses.branchId)))
    .orderBy(asc(branches.name), asc(warehouses.code));
}

async function loadWarehouse(tx: DbOrTx, ctx: AuthContext, id: string, requireAccess = true) {
  const wh = await tx.query.warehouses.findFirst({ where: and(eq(warehouses.id, id), eq(warehouses.companyId, ctx.companyId)) });
  if (!wh) throw new NotFoundError("Gudang");
  if (requireAccess) assertBranchAccess(ctx, wh.branchId);
  return wh;
}

// ---------------------------------------------------------------------------
// Part request dari workshop (URS-INV-003/006)
// ---------------------------------------------------------------------------
const partRequestInput = z.object({
  warehouseId: optUuid,
  notes: optStr,
  items: z.array(z.object({ partId: reqUuid("Part"), qty: positive("Qty"), notes: optStr })).min(1, "Pilih minimal 1 part"),
});

export async function createPartRequest(ctx: AuthContext, woId: string, raw: unknown) {
  requirePermission(ctx, "partrequest.create");
  const input = partRequestInput.parse(raw);
  return db.transaction(async (tx) => {
    const wo = await tx.query.workOrders.findFirst({ where: and(eq(workOrders.id, woId), eq(workOrders.companyId, ctx.companyId)) });
    if (!wo) throw new NotFoundError("Work Order");
    assertBranchAccess(ctx, wo.branchId);
    if (!["waiting", "assigned", "in_progress", "paused", "waiting_parts", "rework"].includes(wo.status)) {
      throw new ValidationError("Permintaan part hanya untuk WO yang sedang berjalan");
    }
    if (!can(ctx, "workorder.edit") && !can(ctx, "workorder.assign")) {
      const [assigned] = await tx
        .select({ id: workOrderMechanics.id })
        .from(workOrderMechanics)
        .where(and(eq(workOrderMechanics.workOrderId, woId), eq(workOrderMechanics.mechanicId, ctx.userId), eq(workOrderMechanics.isActive, true)));
      if (!assigned) throw new ForbiddenError("Anda tidak ditugaskan pada Work Order ini");
    }
    const wh = input.warehouseId ? await loadWarehouse(tx, ctx, input.warehouseId) : await defaultWarehouse(tx, wo.branchId);
    if (wh.branchId !== wo.branchId) throw new ValidationError("Gudang harus berada di cabang Work Order");
    const allowance = await getPartAllowance(tx, wo);
    const partRows = await tx.select().from(parts).where(and(eq(parts.companyId, ctx.companyId), inArray(parts.id, input.items.map((i) => i.partId))));
    const stock = await tx.select().from(inventory).where(and(eq(inventory.warehouseId, wh.id), inArray(inventory.partId, input.items.map((i) => i.partId))));

    const requestNumber = await nextDocNumber(tx, ctx.companyId, wo.branchId, "PR");
    const [pr] = await tx
      .insert(partRequests)
      .values({
        companyId: ctx.companyId,
        branchId: wo.branchId,
        requestNumber,
        workOrderId: wo.id,
        mechanicId: ctx.userId,
        warehouseId: wh.id,
        status: "requested",
        notes: input.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    const warnings: string[] = [];
    let shortage = false;
    for (const it of input.items) {
      const part = partRows.find((p) => p.id === it.partId);
      if (!part) throw new NotFoundError("Part");
      const allow = allowance.find((a) => a.partId === it.partId);
      const remainingApproved = allow ? round2(allow.approvedQty - allow.netIssued - allow.pendingRequest) : 0;
      if (it.qty > remainingApproved) {
        warnings.push(`${part.partName}: melebihi qty yang disetujui customer — perlu estimate tambahan sebelum invoice (BR-006)`);
      }
      const available = stock.find((s) => s.partId === it.partId)?.quantity ?? 0;
      if (available < it.qty) shortage = true;
      await tx.insert(partRequestItems).values({
        partRequestId: pr.id,
        partId: it.partId,
        qtyRequested: it.qty,
        unitPrice: allow?.price ?? part.sellingPrice,
        notes: it.notes,
      });
    }
    await writeAudit(tx, ctx, { action: "CREATE", entity: "part_request", entityId: pr.id, referenceNumber: requestNumber, newValue: { wo: wo.woNumber, items: input.items }, branchId: wo.branchId });
    await notify(tx, {
      companyId: ctx.companyId,
      branchId: wo.branchId,
      permission: "inventory.issue",
      type: shortage ? "waiting_parts" : "part_request",
      title: shortage ? "Part tidak tersedia" : "Permintaan part baru",
      message: `${requestNumber} untuk ${wo.woNumber}${shortage ? " — stok tidak mencukupi" : ""}`,
      link: `/part-requests/${pr.id}`,
    });
    if (shortage && wo.status !== "waiting_parts") {
      await setWoStatus(tx, ctx, wo.id, wo.status, "waiting_parts", `${requestNumber}: stok part tidak mencukupi`);
    }
    return { ...pr, warnings, shortage };
  });
}

export async function listPartRequests(ctx: AuthContext, params: ListParams & { status?: string | null } = {}) {
  requireAnyPermission(ctx, "partrequest.view", "inventory.issue");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(partRequests.companyId, ctx.companyId),
    branchScope(ctx, partRequests.branchId),
    params.status === "open" ? inArray(partRequests.status, ["requested", "partially_issued"]) : params.status ? eq(partRequests.status, params.status) : undefined,
    like ? or(ilike(partRequests.requestNumber, like), ilike(workOrders.woNumber, like), ilike(vehicles.plateNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: partRequests.id,
        requestNumber: partRequests.requestNumber,
        requestDate: partRequests.requestDate,
        status: partRequests.status,
        woId: workOrders.id,
        woNumber: workOrders.woNumber,
        woStatus: workOrders.status,
        plateNumber: vehicles.plateNumber,
        mechanicName: users.name,
        warehouseName: warehouses.name,
        itemCount: sql<number>`(select count(*)::int from ${partRequestItems} i where i.part_request_id = ${partRequests.id})`,
      })
      .from(partRequests)
      .innerJoin(workOrders, eq(workOrders.id, partRequests.workOrderId))
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .innerJoin(warehouses, eq(warehouses.id, partRequests.warehouseId))
      .leftJoin(users, eq(users.id, partRequests.mechanicId))
      .where(where)
      .orderBy(desc(partRequests.requestDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(partRequests)
      .innerJoin(workOrders, eq(workOrders.id, partRequests.workOrderId))
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getPartRequest(ctx: AuthContext, id: string) {
  requireAnyPermission(ctx, "partrequest.view", "inventory.issue");
  const pr = await db.query.partRequests.findFirst({
    where: and(eq(partRequests.id, id), eq(partRequests.companyId, ctx.companyId)),
    with: { items: { with: { part: true } }, workOrder: { with: { vehicle: true, customer: true } }, mechanic: { columns: { id: true, name: true } }, warehouse: true },
  });
  if (!pr) throw new NotFoundError("Permintaan part");
  assertBranchAccess(ctx, pr.branchId);
  const stock = await db
    .select({ partId: inventory.partId, quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.warehouseId, pr.warehouseId), inArray(inventory.partId, pr.items.map((i) => i.partId))));
  return { ...pr, items: pr.items.map((i) => ({ ...i, available: stock.find((s) => s.partId === i.partId)?.quantity ?? 0 })) };
}

/** Issue part (penuh / sebagian) — stok berkurang secara transactional (BR-009, AC-003) */
export async function issuePartRequest(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "inventory.issue");
  const input = z.object({ items: z.array(z.object({ itemId: z.uuid(), qty: nonNeg("Qty") })).min(1) }).parse(raw);
  return db.transaction(async (tx) => {
    const [pr] = await tx.select().from(partRequests).where(and(eq(partRequests.id, id), eq(partRequests.companyId, ctx.companyId))).for("update");
    if (!pr) throw new NotFoundError("Permintaan part");
    assertBranchAccess(ctx, pr.branchId);
    if (!["requested", "partially_issued"].includes(pr.status)) throw new ValidationError("Permintaan part sudah selesai/dibatalkan");
    const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, pr.workOrderId) });
    if (!wo || ["completed", "cancelled"].includes(wo.status)) throw new ValidationError("Work Order sudah ditutup");
    const items = await tx.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, id));
    let issuedAny = false;
    for (const req of input.items) {
      if (req.qty <= 0) continue;
      const item = items.find((i) => i.id === req.itemId);
      if (!item) throw new NotFoundError("Item permintaan");
      const remaining = round2(item.qtyRequested - item.qtyIssued);
      if (req.qty > remaining + 1e-9) throw new ValidationError(`Qty issue melebihi sisa permintaan (${remaining})`);
      const { unitCost } = await stockOut(tx, {
        companyId: ctx.companyId,
        branchId: pr.branchId,
        warehouseId: pr.warehouseId,
        partId: item.partId,
        qty: req.qty,
        type: "issue",
        refType: "part_request",
        refId: pr.id,
        refNumber: `${pr.requestNumber} / ${wo.woNumber}`,
        userId: ctx.userId,
      });
      const net = round2(item.qtyIssued - item.qtyReturned);
      const newCost = net + req.qty > 0 ? round2((net * item.unitCost + req.qty * unitCost) / (net + req.qty)) : unitCost;
      await tx
        .update(partRequestItems)
        .set({ qtyIssued: round2(item.qtyIssued + req.qty), unitCost: newCost })
        .where(eq(partRequestItems.id, item.id));
      item.qtyIssued = round2(item.qtyIssued + req.qty);
      issuedAny = true;
    }
    if (!issuedAny) throw new ValidationError("Isi qty yang akan di-issue");
    const fully = items.every((i) => i.qtyIssued + 1e-9 >= i.qtyRequested);
    const status = fully ? "issued" : "partially_issued";
    await tx.update(partRequests).set({ status, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(partRequests.id, id));
    await writeAudit(tx, ctx, { action: "ISSUE", entity: "part_request", entityId: id, referenceNumber: pr.requestNumber, newValue: { items: input.items, status }, branchId: pr.branchId });
    await notifyLowStock(tx, ctx.companyId, pr.branchId, pr.warehouseId, items.map((i) => i.partId));
    if (fully && wo.status === "waiting_parts") {
      const [open] = await tx
        .select({ id: partRequests.id })
        .from(partRequests)
        .where(and(eq(partRequests.workOrderId, wo.id), inArray(partRequests.status, ["requested", "partially_issued"])));
      if (!open) await recomputeWoStatus(tx as Tx, ctx, wo.id, { clearWaitingParts: true, note: `Part ${pr.requestNumber} sudah diterima` });
    }
    if (pr.mechanicId) {
      await notify(tx, {
        companyId: ctx.companyId,
        branchId: pr.branchId,
        userId: pr.mechanicId,
        type: "part_issued",
        title: fully ? "Part siap diambil" : "Part keluar sebagian",
        message: `${pr.requestNumber} untuk ${wo.woNumber}`,
        link: `/work-orders/${wo.id}`,
      });
    }
    return { status };
  });
}

/** Retur part yang tidak terpakai ke gudang */
export async function returnPartItem(ctx: AuthContext, itemId: string, raw: unknown) {
  requirePermission(ctx, "inventory.issue");
  const input = z.object({ qty: positive("Qty"), reason }).parse(raw);
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(partRequestItems).where(eq(partRequestItems.id, itemId)).for("update");
    if (!item) throw new NotFoundError("Item permintaan");
    const [pr] = await tx.select().from(partRequests).where(and(eq(partRequests.id, item.partRequestId), eq(partRequests.companyId, ctx.companyId)));
    if (!pr) throw new NotFoundError("Permintaan part");
    assertBranchAccess(ctx, pr.branchId);
    const inv = await tx.query.invoices.findFirst({ where: and(eq(invoices.workOrderId, pr.workOrderId), ne(invoices.status, "void")) });
    if (inv) throw new ValidationError(`Invoice ${inv.invoiceNumber} sudah terbit. Void invoice terlebih dahulu.`);
    const net = round2(item.qtyIssued - item.qtyReturned);
    if (input.qty > net + 1e-9) throw new ValidationError(`Qty retur melebihi qty terpakai (${net})`);
    await stockIn(tx, {
      companyId: ctx.companyId,
      branchId: pr.branchId,
      warehouseId: pr.warehouseId,
      partId: item.partId,
      qty: input.qty,
      unitCost: item.unitCost,
      type: "return",
      refType: "part_request",
      refId: pr.id,
      refNumber: pr.requestNumber,
      notes: input.reason,
      userId: ctx.userId,
    });
    await tx.update(partRequestItems).set({ qtyReturned: round2(item.qtyReturned + input.qty) }).where(eq(partRequestItems.id, itemId));
    await writeAudit(tx, ctx, { action: "RETURN", entity: "part_request", entityId: pr.id, referenceNumber: pr.requestNumber, newValue: { partId: item.partId, qty: input.qty }, reason: input.reason, branchId: pr.branchId });
  });
}

export async function cancelPartRequest(ctx: AuthContext, id: string, rawReason: unknown) {
  requireAnyPermission(ctx, "partrequest.create", "inventory.issue");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const [pr] = await tx.select().from(partRequests).where(and(eq(partRequests.id, id), eq(partRequests.companyId, ctx.companyId))).for("update");
    if (!pr) throw new NotFoundError("Permintaan part");
    assertBranchAccess(ctx, pr.branchId);
    if (!["requested", "partially_issued"].includes(pr.status)) throw new ValidationError("Permintaan part tidak dapat dibatalkan");
    const items = await tx.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, id));
    // Sisa yang belum di-issue dibatalkan; yang sudah keluar tetap tercatat
    const anyIssued = items.some((i) => i.qtyIssued > 0);
    await tx.update(partRequests).set({ status: anyIssued ? "issued" : "cancelled", cancelReason: why, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(partRequests.id, id));
    if (anyIssued) {
      for (const i of items) await tx.update(partRequestItems).set({ qtyRequested: i.qtyIssued }).where(eq(partRequestItems.id, i.id));
    }
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "part_request", entityId: id, referenceNumber: pr.requestNumber, reason: why, branchId: pr.branchId });
    const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, pr.workOrderId) });
    if (wo?.status === "waiting_parts") await recomputeWoStatus(tx as Tx, ctx, wo.id, { clearWaitingParts: true, note: "Permintaan part dibatalkan" });
  });
}

// ---------------------------------------------------------------------------
// Stock balance & movement (URS-INV-001/002/004/005)
// ---------------------------------------------------------------------------
export async function listStock(ctx: AuthContext, params: ListParams & { warehouseId?: string | null; lowOnly?: boolean; categoryId?: string | null } = {}) {
  requirePermission(ctx, "inventory.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const whIds = params.warehouseId
    ? [params.warehouseId]
    : (await db.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.companyId, ctx.companyId), branchScope(ctx, warehouses.branchId)))).map((w) => w.id);
  if (params.warehouseId) await loadWarehouse(db, ctx, params.warehouseId);
  const whList = whIds.length ? whIds : ["00000000-0000-0000-0000-000000000000"];
  const qtyExpr = sql<number>`coalesce((select sum(i.quantity) from ${inventory} i where i.part_id = ${parts.id} and i.warehouse_id in ${whList}), 0)::float8`;
  const valueExpr = sql<number>`coalesce((select sum(i.quantity * i.average_cost) from ${inventory} i where i.part_id = ${parts.id} and i.warehouse_id in ${whList}), 0)::float8`;
  const where = and(
    eq(parts.companyId, ctx.companyId),
    sql`${parts.deletedAt} is null`,
    params.categoryId ? eq(parts.categoryId, params.categoryId) : undefined,
    like ? or(ilike(parts.partName, like), ilike(parts.sku, like), ilike(parts.barcode, like)) : undefined,
    params.lowOnly ? sql`${qtyExpr} <= ${parts.minimumStock}` : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: parts.id,
        sku: parts.sku,
        barcode: parts.barcode,
        partName: parts.partName,
        itemType: parts.itemType,
        unit: parts.unit,
        category: partCategories.name,
        sellingPrice: parts.sellingPrice,
        minimumStock: parts.minimumStock,
        quantity: qtyExpr,
        stockValue: valueExpr,
      })
      .from(parts)
      .leftJoin(partCategories, eq(partCategories.id, parts.categoryId))
      .where(where)
      .orderBy(asc(parts.partName))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(parts).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, low: r.quantity <= r.minimumStock })), total, page, pageSize };
}

export async function partStockByWarehouse(ctx: AuthContext, partId: string) {
  requirePermission(ctx, "inventory.view");
  return db
    .select({ warehouseId: warehouses.id, warehouseName: warehouses.name, branchName: branches.name, quantity: inventory.quantity, averageCost: inventory.averageCost })
    .from(inventory)
    .innerJoin(warehouses, eq(warehouses.id, inventory.warehouseId))
    .innerJoin(branches, eq(branches.id, warehouses.branchId))
    .where(and(eq(inventory.partId, partId), eq(warehouses.companyId, ctx.companyId), branchScope(ctx, warehouses.branchId)));
}

export async function listMovements(
  ctx: AuthContext,
  params: ListParams & { partId?: string | null; warehouseId?: string | null; type?: string | null; from?: string | null; to?: string | null } = {},
) {
  requirePermission(ctx, "inventory.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(stockMovements.companyId, ctx.companyId),
    branchScope(ctx, stockMovements.branchId),
    params.partId ? eq(stockMovements.partId, params.partId) : undefined,
    params.warehouseId ? eq(stockMovements.warehouseId, params.warehouseId) : undefined,
    params.type ? eq(stockMovements.transactionType, params.type) : undefined,
    params.from ? gte(stockMovements.transactionDate, jakartaDayStart(params.from)) : undefined,
    params.to ? lte(stockMovements.transactionDate, jakartaDayEnd(params.to)) : undefined,
    like ? or(ilike(parts.partName, like), ilike(parts.sku, like), ilike(stockMovements.referenceNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        transactionDate: stockMovements.transactionDate,
        transactionType: stockMovements.transactionType,
        referenceType: stockMovements.referenceType,
        referenceId: stockMovements.referenceId,
        referenceNumber: stockMovements.referenceNumber,
        quantityIn: stockMovements.quantityIn,
        quantityOut: stockMovements.quantityOut,
        unitCost: stockMovements.unitCost,
        balanceAfter: stockMovements.balanceAfter,
        notes: stockMovements.notes,
        sku: parts.sku,
        partName: parts.partName,
        warehouseName: warehouses.name,
        userName: users.name,
      })
      .from(stockMovements)
      .innerJoin(parts, eq(parts.id, stockMovements.partId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.createdBy))
      .where(where)
      .orderBy(desc(stockMovements.transactionDate), desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(stockMovements).innerJoin(parts, eq(parts.id, stockMovements.partId)).where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** Pencarian part (nama/SKU/barcode) + stok di gudang tertentu */
export async function searchParts(ctx: AuthContext, q: string | null, warehouseId?: string | null) {
  const like = likeQ(q);
  const rows = await db
    .select({
      id: parts.id,
      sku: parts.sku,
      barcode: parts.barcode,
      partName: parts.partName,
      itemType: parts.itemType,
      unit: parts.unit,
      sellingPrice: parts.sellingPrice,
      purchasePrice: parts.purchasePrice,
      quantity: warehouseId
        ? sql<number>`coalesce((select i.quantity from ${inventory} i where i.part_id = ${parts.id} and i.warehouse_id = ${warehouseId}), 0)::float8`
        : sql<number>`0::float8`,
    })
    .from(parts)
    .where(
      and(
        eq(parts.companyId, ctx.companyId),
        eq(parts.status, "active"),
        sql`${parts.deletedAt} is null`,
        like ? or(ilike(parts.partName, like), ilike(parts.sku, like), eq(parts.barcode, (q ?? "").trim())) : undefined,
      ),
    )
    .orderBy(asc(parts.partName))
    .limit(30);
  return rows;
}

// ---------------------------------------------------------------------------
// Receiving (goods receipt)
// ---------------------------------------------------------------------------
const receiptInput = z.object({
  warehouseId: reqUuid("Gudang"),
  supplierId: optUuid,
  purchaseOrderId: optUuid,
  supplierInvoiceNo: optStr,
  notes: optStr,
  items: z
    .array(z.object({ partId: reqUuid("Part"), qty: positive("Qty"), unitCost: nonNeg("Harga beli"), purchaseOrderItemId: optUuid }))
    .min(1, "Minimal 1 item"),
});

export async function receiveGoods(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "inventory.receive");
  const input = receiptInput.parse(raw);
  return db.transaction(async (tx) => {
    const wh = await loadWarehouse(tx, ctx, input.warehouseId);
    let po = null;
    if (input.purchaseOrderId) {
      [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.companyId, ctx.companyId))).for("update");
      if (!po) throw new NotFoundError("Purchase Order");
      if (!["ordered", "partially_received"].includes(po.status)) throw new ValidationError("PO belum dikirim ke supplier / sudah selesai");
      if (po.warehouseId !== wh.id) throw new ValidationError("Gudang penerimaan harus sesuai PO");
    }
    const receiptNumber = await nextDocNumber(tx, ctx.companyId, wh.branchId, "RCV");
    const total = round2(input.items.reduce((a, i) => a + i.qty * i.unitCost, 0));
    const [gr] = await tx
      .insert(goodsReceipts)
      .values({
        companyId: ctx.companyId,
        branchId: wh.branchId,
        receiptNumber,
        purchaseOrderId: po?.id ?? null,
        supplierId: input.supplierId ?? po?.supplierId ?? null,
        warehouseId: wh.id,
        supplierInvoiceNo: input.supplierInvoiceNo,
        total,
        notes: input.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    const poItems = po ? await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)) : [];
    for (const it of input.items) {
      const part = await tx.query.parts.findFirst({ where: and(eq(parts.id, it.partId), eq(parts.companyId, ctx.companyId)) });
      if (!part) throw new NotFoundError("Part");
      let poItemId: string | null = null;
      if (po) {
        const poItem = poItems.find((p) => (it.purchaseOrderItemId ? p.id === it.purchaseOrderItemId : p.partId === it.partId));
        if (!poItem) throw new ValidationError(`${part.partName} tidak ada di PO`);
        const remaining = round2(poItem.qtyOrdered - poItem.qtyReceived);
        if (it.qty > remaining + 1e-9) throw new ValidationError(`Qty terima ${part.partName} melebihi sisa PO (${remaining})`);
        poItem.qtyReceived = round2(poItem.qtyReceived + it.qty);
        await tx.update(purchaseOrderItems).set({ qtyReceived: poItem.qtyReceived }).where(eq(purchaseOrderItems.id, poItem.id));
        poItemId = poItem.id;
      }
      await tx.insert(goodsReceiptItems).values({ goodsReceiptId: gr.id, partId: it.partId, purchaseOrderItemId: poItemId, qty: it.qty, unitCost: it.unitCost, total: round2(it.qty * it.unitCost) });
      await stockIn(tx, {
        companyId: ctx.companyId,
        branchId: wh.branchId,
        warehouseId: wh.id,
        partId: it.partId,
        qty: it.qty,
        unitCost: it.unitCost,
        type: "receive",
        refType: "goods_receipt",
        refId: gr.id,
        refNumber: receiptNumber,
        userId: ctx.userId,
      });
      await tx.update(parts).set({ purchasePrice: it.unitCost, updatedAt: new Date() }).where(eq(parts.id, it.partId));
    }
    if (po) {
      const done = poItems.every((p) => p.qtyReceived + 1e-9 >= p.qtyOrdered);
      await tx.update(purchaseOrders).set({ status: done ? "received" : "partially_received", updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(purchaseOrders.id, po.id));
    }
    await writeAudit(tx, ctx, { action: "RECEIVE", entity: "goods_receipt", entityId: gr.id, referenceNumber: receiptNumber, newValue: { total, items: input.items.length, po: po?.poNumber }, branchId: wh.branchId });
    return gr;
  });
}

export async function listReceipts(ctx: AuthContext, params: ListParams = {}) {
  requirePermission(ctx, "inventory.view");
  const { limit, offset } = pageArgs(params);
  return db
    .select({
      id: goodsReceipts.id,
      receiptNumber: goodsReceipts.receiptNumber,
      receiptDate: goodsReceipts.receiptDate,
      total: goodsReceipts.total,
      supplierName: suppliers.name,
      warehouseName: warehouses.name,
      poNumber: purchaseOrders.poNumber,
      supplierInvoiceNo: goodsReceipts.supplierInvoiceNo,
    })
    .from(goodsReceipts)
    .innerJoin(warehouses, eq(warehouses.id, goodsReceipts.warehouseId))
    .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
    .where(and(eq(goodsReceipts.companyId, ctx.companyId), branchScope(ctx, goodsReceipts.branchId)))
    .orderBy(desc(goodsReceipts.receiptDate))
    .limit(limit)
    .offset(offset);
}

export async function getReceipt(ctx: AuthContext, id: string) {
  requirePermission(ctx, "inventory.view");
  const gr = await db.query.goodsReceipts.findFirst({
    where: and(eq(goodsReceipts.id, id), eq(goodsReceipts.companyId, ctx.companyId)),
    with: { items: { with: { part: true } }, supplier: true, warehouse: true, purchaseOrder: true },
  });
  if (!gr) throw new NotFoundError("Penerimaan barang");
  assertBranchAccess(ctx, gr.branchId);
  return gr;
}

// ---------------------------------------------------------------------------
// Stock opname / adjustment
// ---------------------------------------------------------------------------
const adjustmentInput = z.object({
  warehouseId: reqUuid("Gudang"),
  adjustmentType: z.enum(["opname", "adjustment"]),
  reason: reqStr("Alasan"),
  items: z.array(z.object({ partId: reqUuid("Part"), countedQty: nonNeg("Qty fisik"), unitCost: z.union([z.number(), z.string()]).nullable().optional().optional() })).min(1, "Minimal 1 item"),
});

export async function createAdjustment(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "inventory.adjust");
  const input = adjustmentInput.parse(raw);
  return db.transaction(async (tx) => {
    const wh = await loadWarehouse(tx, ctx, input.warehouseId);
    const number = await nextDocNumber(tx, ctx.companyId, wh.branchId, "ADJ");
    const [adj] = await tx
      .insert(stockAdjustments)
      .values({ companyId: ctx.companyId, branchId: wh.branchId, adjustmentNumber: number, warehouseId: wh.id, adjustmentType: input.adjustmentType, reason: input.reason, createdBy: ctx.userId, updatedBy: ctx.userId })
      .returning();
    let changed = 0;
    for (const it of input.items) {
      const part = await tx.query.parts.findFirst({ where: and(eq(parts.id, it.partId), eq(parts.companyId, ctx.companyId)) });
      if (!part) throw new NotFoundError("Part");
      const inv = await lockInventory(tx, wh.id, it.partId);
      const diff = round2(it.countedQty - inv.quantity);
      const cost = inv.averageCost || part.purchasePrice;
      await tx.insert(stockAdjustmentItems).values({ adjustmentId: adj.id, partId: it.partId, systemQty: inv.quantity, countedQty: it.countedQty, differenceQty: diff, unitCost: cost });
      if (diff === 0) continue;
      changed++;
      const post = { companyId: ctx.companyId, branchId: wh.branchId, warehouseId: wh.id, partId: it.partId, refType: "stock_adjustment", refId: adj.id, refNumber: number, notes: input.reason, userId: ctx.userId };
      if (diff > 0) await stockIn(tx, { ...post, qty: diff, unitCost: cost, type: "adjust_in" });
      else await stockOut(tx, { ...post, qty: -diff, type: "adjust_out" });
    }
    await writeAudit(tx, ctx, { action: "ADJUST", entity: "stock_adjustment", entityId: adj.id, referenceNumber: number, newValue: { type: input.adjustmentType, items: input.items.length, changed }, reason: input.reason, branchId: wh.branchId });
    await notifyLowStock(tx, ctx.companyId, wh.branchId, wh.id, input.items.map((i) => i.partId));
    return adj;
  });
}

export async function listAdjustments(ctx: AuthContext, params: ListParams = {}) {
  requirePermission(ctx, "inventory.view");
  const { limit, offset } = pageArgs(params);
  return db
    .select({
      id: stockAdjustments.id,
      adjustmentNumber: stockAdjustments.adjustmentNumber,
      adjustmentDate: stockAdjustments.adjustmentDate,
      adjustmentType: stockAdjustments.adjustmentType,
      reason: stockAdjustments.reason,
      warehouseName: warehouses.name,
      userName: users.name,
      itemCount: sql<number>`(select count(*)::int from ${stockAdjustmentItems} i where i.adjustment_id = ${stockAdjustments.id})`,
    })
    .from(stockAdjustments)
    .innerJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouseId))
    .leftJoin(users, eq(users.id, stockAdjustments.createdBy))
    .where(and(eq(stockAdjustments.companyId, ctx.companyId), branchScope(ctx, stockAdjustments.branchId)))
    .orderBy(desc(stockAdjustments.adjustmentDate))
    .limit(limit)
    .offset(offset);
}

export async function getAdjustment(ctx: AuthContext, id: string) {
  requirePermission(ctx, "inventory.view");
  const a = await db.query.stockAdjustments.findFirst({
    where: and(eq(stockAdjustments.id, id), eq(stockAdjustments.companyId, ctx.companyId)),
    with: { items: { with: { part: true } }, warehouse: true },
  });
  if (!a) throw new NotFoundError("Adjustment");
  assertBranchAccess(ctx, a.branchId);
  return a;
}

// ---------------------------------------------------------------------------
// Transfer antar gudang / cabang
// ---------------------------------------------------------------------------
const transferInput = z.object({
  fromWarehouseId: reqUuid("Gudang asal"),
  toWarehouseId: reqUuid("Gudang tujuan"),
  notes: optStr,
  items: z.array(z.object({ partId: reqUuid("Part"), qty: positive("Qty") })).min(1, "Minimal 1 item"),
});

export async function createTransfer(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "inventory.transfer");
  const input = transferInput.parse(raw);
  if (input.fromWarehouseId === input.toWarehouseId) throw new ValidationError("Gudang asal dan tujuan tidak boleh sama");
  return db.transaction(async (tx) => {
    const from = await loadWarehouse(tx, ctx, input.fromWarehouseId);
    const to = await loadWarehouse(tx, ctx, input.toWarehouseId, false);
    const number = await nextDocNumber(tx, ctx.companyId, from.branchId, "TRF");
    const [trf] = await tx
      .insert(stockTransfers)
      .values({ companyId: ctx.companyId, branchId: from.branchId, transferNumber: number, fromWarehouseId: from.id, toWarehouseId: to.id, notes: input.notes, createdBy: ctx.userId, updatedBy: ctx.userId })
      .returning();
    for (const it of input.items) {
      const { unitCost } = await stockOut(tx, {
        companyId: ctx.companyId,
        branchId: from.branchId,
        warehouseId: from.id,
        partId: it.partId,
        qty: it.qty,
        type: "transfer_out",
        refType: "stock_transfer",
        refId: trf.id,
        refNumber: number,
        notes: `Ke ${to.name}`,
        userId: ctx.userId,
      });
      await stockIn(tx, {
        companyId: ctx.companyId,
        branchId: to.branchId,
        warehouseId: to.id,
        partId: it.partId,
        qty: it.qty,
        unitCost,
        type: "transfer_in",
        refType: "stock_transfer",
        refId: trf.id,
        refNumber: number,
        notes: `Dari ${from.name}`,
        userId: ctx.userId,
      });
      await tx.insert(stockTransferItems).values({ transferId: trf.id, partId: it.partId, qty: it.qty, unitCost });
    }
    await writeAudit(tx, ctx, { action: "TRANSFER", entity: "stock_transfer", entityId: trf.id, referenceNumber: number, newValue: { from: from.name, to: to.name, items: input.items }, branchId: from.branchId });
    await notifyLowStock(tx, ctx.companyId, from.branchId, from.id, input.items.map((i) => i.partId));
    return trf;
  });
}

export async function listTransfers(ctx: AuthContext, params: ListParams = {}) {
  requirePermission(ctx, "inventory.view");
  const { limit, offset } = pageArgs(params);
  const ids = scopeBranchIds(ctx);
  const rows = await db.query.stockTransfers.findMany({
    where: and(eq(stockTransfers.companyId, ctx.companyId), ids.length ? inArray(stockTransfers.branchId, ids) : sql`false`),
    with: { fromWarehouse: true, toWarehouse: true, items: { with: { part: true } } },
    orderBy: desc(stockTransfers.transferDate),
    limit,
    offset,
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Purchasing (Phase 2)
// ---------------------------------------------------------------------------
const poInput = z.object({
  supplierId: reqUuid("Supplier"),
  warehouseId: reqUuid("Gudang"),
  orderDate: isoDate("Tanggal PO").default(todayISO()),
  expectedDate: optDate,
  notes: optStr,
  items: z.array(z.object({ partId: reqUuid("Part"), qty: positive("Qty"), unitCost: nonNeg("Harga") })).min(1, "Minimal 1 item"),
});

export async function createPurchaseOrder(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "purchase.create");
  const input = poInput.parse(raw);
  return db.transaction(async (tx) => {
    const wh = await loadWarehouse(tx, ctx, input.warehouseId);
    const sup = await tx.query.suppliers.findFirst({ where: and(eq(suppliers.id, input.supplierId), eq(suppliers.companyId, ctx.companyId)) });
    if (!sup) throw new NotFoundError("Supplier");
    const poNumber = await nextDocNumber(tx, ctx.companyId, wh.branchId, "PO");
    const total = round2(input.items.reduce((a, i) => a + i.qty * i.unitCost, 0));
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        companyId: ctx.companyId,
        branchId: wh.branchId,
        poNumber,
        supplierId: sup.id,
        warehouseId: wh.id,
        orderDate: input.orderDate,
        expectedDate: input.expectedDate,
        notes: input.notes,
        total,
        status: "draft",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await tx.insert(purchaseOrderItems).values(input.items.map((i) => ({ purchaseOrderId: po.id, partId: i.partId, qtyOrdered: i.qty, unitCost: i.unitCost, total: round2(i.qty * i.unitCost) })));
    await writeAudit(tx, ctx, { action: "CREATE", entity: "purchase_order", entityId: po.id, referenceNumber: poNumber, newValue: { supplier: sup.name, total }, branchId: wh.branchId });
    return po;
  });
}

export async function submitPurchaseOrder(ctx: AuthContext, id: string) {
  requirePermission(ctx, "purchase.approve");
  await db.transaction(async (tx) => {
    const po = await tx.query.purchaseOrders.findFirst({ where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, ctx.companyId)) });
    if (!po) throw new NotFoundError("Purchase Order");
    assertBranchAccess(ctx, po.branchId);
    if (po.status !== "draft") throw new ValidationError("Hanya PO draft yang dapat disetujui");
    await tx.update(purchaseOrders).set({ status: "ordered", updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(purchaseOrders.id, id));
    await writeAudit(tx, ctx, { action: "APPROVE", entity: "purchase_order", entityId: id, referenceNumber: po.poNumber, newValue: { status: "ordered" }, branchId: po.branchId });
  });
}

export async function cancelPurchaseOrder(ctx: AuthContext, id: string, rawReason: unknown) {
  requirePermission(ctx, "purchase.approve");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const po = await tx.query.purchaseOrders.findFirst({ where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, ctx.companyId)) });
    if (!po) throw new NotFoundError("Purchase Order");
    assertBranchAccess(ctx, po.branchId);
    if (!["draft", "ordered"].includes(po.status)) throw new ValidationError("PO yang sudah diterima tidak dapat dibatalkan");
    await tx.update(purchaseOrders).set({ status: "cancelled", cancelReason: why, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(purchaseOrders.id, id));
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "purchase_order", entityId: id, referenceNumber: po.poNumber, reason: why, branchId: po.branchId });
  });
}

export async function listPurchaseOrders(ctx: AuthContext, params: ListParams & { status?: string | null } = {}) {
  requirePermission(ctx, "purchase.view");
  const { limit, offset } = pageArgs(params);
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
      status: purchaseOrders.status,
      total: purchaseOrders.total,
      supplierName: suppliers.name,
      warehouseName: warehouses.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(warehouses, eq(warehouses.id, purchaseOrders.warehouseId))
    .where(and(eq(purchaseOrders.companyId, ctx.companyId), branchScope(ctx, purchaseOrders.branchId), params.status ? eq(purchaseOrders.status, params.status) : undefined))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getPurchaseOrder(ctx: AuthContext, id: string) {
  requirePermission(ctx, "purchase.view");
  const po = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, ctx.companyId)),
    with: { items: { with: { part: true } }, supplier: true, warehouse: true },
  });
  if (!po) throw new NotFoundError("Purchase Order");
  assertBranchAccess(ctx, po.branchId);
  const receipts = await db.query.goodsReceipts.findMany({ where: eq(goodsReceipts.purchaseOrderId, id), orderBy: desc(goodsReceipts.receiptDate) });
  return { ...po, receipts };
}

/** Saran reorder: part di bawah minimum stok */
export async function reorderSuggestions(ctx: AuthContext, warehouseId: string) {
  requireAnyPermission(ctx, "purchase.create", "inventory.receive");
  await loadWarehouse(db, ctx, warehouseId);
  return db
    .select({
      id: parts.id,
      sku: parts.sku,
      partName: parts.partName,
      minimumStock: parts.minimumStock,
      purchasePrice: parts.purchasePrice,
      quantity: sql<number>`coalesce(${inventory.quantity}, 0)::float8`,
    })
    .from(parts)
    .leftJoin(inventory, and(eq(inventory.partId, parts.id), eq(inventory.warehouseId, warehouseId)))
    .where(and(eq(parts.companyId, ctx.companyId), eq(parts.status, "active"), sql`coalesce(${inventory.quantity}, 0) <= ${parts.minimumStock}`))
    .orderBy(asc(parts.partName));
}

export function ensureBranch(ctx: AuthContext) {
  return requireActiveBranch(ctx);
}
