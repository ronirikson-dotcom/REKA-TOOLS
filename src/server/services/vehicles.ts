import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  customers,
  invoices,
  partRequestItems,
  partRequests,
  parts,
  vehicleBrands,
  vehicleCheckins,
  vehicleModels,
  vehicleOwnerships,
  vehicles,
  workOrderJobs,
  workOrders,
  branches,
} from "@/server/db/schema";
import { requirePermission, scopeBranchIds, type AuthContext } from "@/server/auth/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { likeQ, optInt, optStr, optUuid, pageArgs, reqStr, reqUuid, type ListParams } from "@/server/validation";
import { formatPlate, normalizePlate, todayISO } from "@/lib/utils";
import { writeAudit } from "./audit";

export const vehicleInput = z.object({
  customerId: reqUuid("Customer"),
  plateNumber: reqStr("Nomor polisi"),
  vehicleType: z.enum(["car", "motorcycle"], { error: "Jenis kendaraan wajib dipilih" }),
  brandId: optUuid,
  modelId: optUuid,
  year: optInt,
  color: optStr,
  chassisNumber: optStr,
  engineNumber: optStr,
  transmission: optStr,
  fuelType: optStr,
  lastOdometer: optInt,
  notes: optStr,
});

export async function listVehicles(ctx: AuthContext, params: ListParams & { customerId?: string | null; type?: string | null } = {}) {
  requirePermission(ctx, "vehicle.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const plate = params.q ? `%${normalizePlate(params.q)}%` : null;
  const where = and(
    eq(vehicles.companyId, ctx.companyId),
    isNull(vehicles.deletedAt),
    params.customerId ? eq(vehicles.customerId, params.customerId) : undefined,
    params.type ? eq(vehicles.vehicleType, params.type) : undefined,
    like
      ? or(
          sql`replace(upper(${vehicles.plateNumber}),' ','') like ${plate}`,
          ilike(vehicles.chassisNumber, like),
          ilike(vehicles.engineNumber, like),
          ilike(customers.name, like),
          ilike(vehicleModels.name, like),
        )
      : undefined,
  );
  const base = db
    .select({
      id: vehicles.id,
      plateNumber: vehicles.plateNumber,
      vehicleType: vehicles.vehicleType,
      brand: vehicleBrands.name,
      model: vehicleModels.name,
      year: vehicles.year,
      color: vehicles.color,
      chassisNumber: vehicles.chassisNumber,
      lastOdometer: vehicles.lastOdometer,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(vehicles)
    .innerJoin(customers, eq(customers.id, vehicles.customerId))
    .leftJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .leftJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(where);
  const [rows, [{ total }]] = await Promise.all([
    base.orderBy(asc(vehicles.plateNumber)).limit(limit).offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(vehicles)
      .innerJoin(customers, eq(customers.id, vehicles.customerId))
      .leftJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getVehicle(ctx: AuthContext, id: string) {
  requirePermission(ctx, "vehicle.view");
  const v = await db.query.vehicles.findFirst({
    where: and(eq(vehicles.id, id), eq(vehicles.companyId, ctx.companyId)),
    with: { customer: true, brand: true, model: true, ownerships: { with: { customer: true }, orderBy: desc(vehicleOwnerships.startDate) } },
  });
  if (!v) throw new NotFoundError("Kendaraan");
  return v;
}

async function assertPlateUnique(companyId: string, plate: string, exceptId?: string) {
  const existing = await db.query.vehicles.findFirst({
    where: and(
      eq(vehicles.companyId, companyId),
      isNull(vehicles.deletedAt),
      sql`replace(upper(${vehicles.plateNumber}),' ','') = ${normalizePlate(plate)}`,
    ),
  });
  if (existing && existing.id !== exceptId) throw new ValidationError(`Nomor polisi ${existing.plateNumber} sudah terdaftar`);
}

export async function createVehicle(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "vehicle.create");
  const input = vehicleInput.parse(raw);
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, input.customerId), eq(customers.companyId, ctx.companyId)) });
  if (!customer) throw new NotFoundError("Customer");
  await assertPlateUnique(ctx.companyId, input.plateNumber);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(vehicles)
      .values({
        ...input,
        plateNumber: formatPlate(input.plateNumber),
        chassisNumber: input.chassisNumber?.toUpperCase() ?? null,
        engineNumber: input.engineNumber?.toUpperCase() ?? null,
        lastOdometer: input.lastOdometer ?? 0,
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await tx.insert(vehicleOwnerships).values({ vehicleId: row.id, customerId: input.customerId, startDate: todayISO(), createdBy: ctx.userId });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "vehicle", entityId: row.id, referenceNumber: row.plateNumber, newValue: row });
    return row;
  });
}

export async function updateVehicle(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "vehicle.edit");
  const input = vehicleInput.omit({ customerId: true }).parse(raw);
  const old = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, id), eq(vehicles.companyId, ctx.companyId)) });
  if (!old) throw new NotFoundError("Kendaraan");
  await assertPlateUnique(ctx.companyId, input.plateNumber, id);
  if (input.lastOdometer !== null && input.lastOdometer < old.lastOdometer) {
    throw new ValidationError("Odometer tidak boleh lebih kecil dari histori (BR-015). Gunakan check-in dengan override bila diperlukan.");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(vehicles)
      .set({
        ...input,
        plateNumber: formatPlate(input.plateNumber),
        chassisNumber: input.chassisNumber?.toUpperCase() ?? null,
        engineNumber: input.engineNumber?.toUpperCase() ?? null,
        lastOdometer: input.lastOdometer ?? old.lastOdometer,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(vehicles.id, id))
      .returning();
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "vehicle", entityId: id, referenceNumber: row.plateNumber, oldValue: old, newValue: row });
    return row;
  });
}

/** Pindah kepemilikan dengan histori (URS-VEH-006) */
export async function transferOwnership(ctx: AuthContext, vehicleId: string, raw: unknown) {
  requirePermission(ctx, "vehicle.transfer");
  const input = z.object({ newCustomerId: reqUuid("Pemilik baru"), notes: optStr }).parse(raw);
  return db.transaction(async (tx) => {
    const v = await tx.query.vehicles.findFirst({ where: and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, ctx.companyId)) });
    if (!v) throw new NotFoundError("Kendaraan");
    if (v.customerId === input.newCustomerId) throw new ValidationError("Pemilik baru sama dengan pemilik saat ini");
    const nc = await tx.query.customers.findFirst({ where: and(eq(customers.id, input.newCustomerId), eq(customers.companyId, ctx.companyId)) });
    if (!nc) throw new NotFoundError("Customer");
    const today = todayISO();
    await tx
      .update(vehicleOwnerships)
      .set({ endDate: today })
      .where(and(eq(vehicleOwnerships.vehicleId, vehicleId), isNull(vehicleOwnerships.endDate)));
    await tx.insert(vehicleOwnerships).values({ vehicleId, customerId: nc.id, startDate: today, notes: input.notes, createdBy: ctx.userId });
    await tx.update(vehicles).set({ customerId: nc.id, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(vehicles.id, vehicleId));
    await writeAudit(tx, ctx, {
      action: "UPDATE",
      entity: "vehicle",
      entityId: vehicleId,
      referenceNumber: v.plateNumber,
      oldValue: { customerId: v.customerId },
      newValue: { customerId: nc.id },
      reason: input.notes ?? "Pindah kepemilikan",
    });
  });
}

/**
 * Vehicle service timeline (URS-VEH-003/004/005): kunjungan, odometer, pekerjaan, part, invoice.
 * Hanya data dari cabang yang boleh diakses user (AC-001).
 */
export async function vehicleTimeline(ctx: AuthContext, vehicleId: string) {
  requirePermission(ctx, "vehicle.view");
  const branchIds = scopeBranchIds(ctx);
  if (!branchIds.length) return [];
  const visits = await db
    .select({
      checkinId: vehicleCheckins.id,
      checkinNumber: vehicleCheckins.checkinNumber,
      arrivalTime: vehicleCheckins.arrivalTime,
      odometer: vehicleCheckins.odometer,
      complaint: vehicleCheckins.complaint,
      checkinStatus: vehicleCheckins.status,
      branchName: branches.name,
      woId: workOrders.id,
      woNumber: workOrders.woNumber,
      woStatus: workOrders.status,
      handoverAt: workOrders.handoverAt,
    })
    .from(vehicleCheckins)
    .innerJoin(branches, eq(branches.id, vehicleCheckins.branchId))
    .leftJoin(workOrders, eq(workOrders.checkinId, vehicleCheckins.id))
    .where(and(eq(vehicleCheckins.vehicleId, vehicleId), inArray(vehicleCheckins.branchId, branchIds)))
    .orderBy(desc(vehicleCheckins.arrivalTime));

  const woIds = visits.map((v) => v.woId).filter((x): x is string => !!x);
  const jobs = woIds.length
    ? await db
        .select({ workOrderId: workOrderJobs.workOrderId, description: workOrderJobs.description, status: workOrderJobs.status })
        .from(workOrderJobs)
        .where(inArray(workOrderJobs.workOrderId, woIds))
    : [];
  const partsUsed = woIds.length
    ? await db
        .select({
          workOrderId: partRequests.workOrderId,
          partName: parts.partName,
          sku: parts.sku,
          qty: sql<number>`sum(${partRequestItems.qtyIssued} - ${partRequestItems.qtyReturned})::float8`,
        })
        .from(partRequestItems)
        .innerJoin(partRequests, eq(partRequests.id, partRequestItems.partRequestId))
        .innerJoin(parts, eq(parts.id, partRequestItems.partId))
        .where(inArray(partRequests.workOrderId, woIds))
        .groupBy(partRequests.workOrderId, parts.partName, parts.sku)
    : [];
  const invs = woIds.length
    ? await db
        .select({
          workOrderId: invoices.workOrderId,
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          grandTotal: invoices.grandTotal,
          paymentStatus: invoices.paymentStatus,
        })
        .from(invoices)
        .where(and(inArray(invoices.workOrderId, woIds), sql`${invoices.status} <> 'void'`))
    : [];

  return visits.map((v) => ({
    ...v,
    jobs: jobs.filter((j) => j.workOrderId === v.woId && j.status !== "cancelled"),
    parts: partsUsed.filter((p) => p.workOrderId === v.woId && p.qty > 0),
    invoice: invs.find((i) => i.workOrderId === v.woId) ?? null,
  }));
}

export async function brandOptions(ctx: AuthContext, vehicleType?: string) {
  const brands = await db.query.vehicleBrands.findMany({
    where: and(eq(vehicleBrands.companyId, ctx.companyId), vehicleType ? eq(vehicleBrands.vehicleType, vehicleType) : undefined),
    with: { models: { orderBy: asc(vehicleModels.name) } },
    orderBy: asc(vehicleBrands.name),
  });
  return brands;
}
