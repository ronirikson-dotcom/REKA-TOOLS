import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  bookings,
  customers,
  estimates,
  inspectionItems,
  inspections,
  inspectionTemplates,
  inspectionTemplateItems,
  users,
  vehicleCheckins,
  vehicles,
  workOrders,
} from "@/server/db/schema";
import { assertBranchAccess, branchScope, can, requireActiveBranch, requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { likeQ, num, optStr, optUuid, pageArgs, reqStr, reqUuid, parseReason, type ListParams } from "@/server/validation";
import { jakartaDayEnd, jakartaDayStart } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";
import { addAttachments, listAttachments } from "./attachments";
import type { UploadFile } from "@/server/storage";

const checkinInput = z.object({
  bookingId: optUuid,
  customerId: reqUuid("Customer"),
  vehicleId: reqUuid("Kendaraan"),
  odometer: num("Odometer").refine((n) => Number.isInteger(n) && n >= 0, "Odometer harus bilangan bulat ≥ 0"),
  odometerOverrideReason: optStr,
  fuelLevel: num("Fuel level").refine((n) => n >= 0 && n <= 100, "Fuel level 0-100"),
  conditionNotes: optStr,
  belongings: optStr,
  complaint: reqStr("Keluhan"),
});

export async function listCheckins(ctx: AuthContext, params: ListParams & { status?: string | null; from?: string | null; to?: string | null } = {}) {
  requirePermission(ctx, "checkin.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(vehicleCheckins.companyId, ctx.companyId),
    branchScope(ctx, vehicleCheckins.branchId),
    params.status ? eq(vehicleCheckins.status, params.status) : undefined,
    params.from ? gte(vehicleCheckins.arrivalTime, jakartaDayStart(params.from)) : undefined,
    params.to ? lte(vehicleCheckins.arrivalTime, jakartaDayEnd(params.to)) : undefined,
    like ? or(ilike(vehicleCheckins.checkinNumber, like), ilike(customers.name, like), ilike(vehicles.plateNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: vehicleCheckins.id,
        checkinNumber: vehicleCheckins.checkinNumber,
        arrivalTime: vehicleCheckins.arrivalTime,
        status: vehicleCheckins.status,
        odometer: vehicleCheckins.odometer,
        complaint: vehicleCheckins.complaint,
        customerName: customers.name,
        plateNumber: vehicles.plateNumber,
        vehicleType: vehicles.vehicleType,
        woNumber: sql<string | null>`(select wo.wo_number from ${workOrders} wo where wo.checkin_id = ${vehicleCheckins.id} limit 1)`,
      })
      .from(vehicleCheckins)
      .innerJoin(customers, eq(customers.id, vehicleCheckins.customerId))
      .innerJoin(vehicles, eq(vehicles.id, vehicleCheckins.vehicleId))
      .where(where)
      .orderBy(desc(vehicleCheckins.arrivalTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(vehicleCheckins)
      .innerJoin(customers, eq(customers.id, vehicleCheckins.customerId))
      .innerJoin(vehicles, eq(vehicles.id, vehicleCheckins.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getCheckin(ctx: AuthContext, id: string) {
  requirePermission(ctx, "checkin.view");
  const c = await db.query.vehicleCheckins.findFirst({
    where: and(eq(vehicleCheckins.id, id), eq(vehicleCheckins.companyId, ctx.companyId)),
    with: {
      customer: true,
      vehicle: { with: { brand: true, model: true } },
      booking: true,
      branch: true,
      checkinUser: { columns: { id: true, name: true } },
      inspections: { with: { items: { orderBy: asc(inspectionItems.sortOrder) }, inspector: { columns: { id: true, name: true } } }, orderBy: desc(inspections.inspectionDate) },
      estimates: { orderBy: desc(estimates.createdAt) },
    },
  });
  if (!c) throw new NotFoundError("Check-in");
  assertBranchAccess(ctx, c.branchId);
  const [workOrder, photos] = await Promise.all([
    db.query.workOrders.findFirst({ where: eq(workOrders.checkinId, id) }),
    listAttachments(ctx, "checkin", id),
  ]);
  return { ...c, workOrder: workOrder ?? null, photos };
}

/**
 * Vehicle check-in (BRD 1.5): odometer, fuel level, kondisi, barang, keluhan, foto, waktu masuk.
 * BR-015: odometer lebih kecil dari histori hanya boleh dengan permission override + alasan.
 */
export async function createCheckin(ctx: AuthContext, raw: unknown, photos: UploadFile[] = []) {
  requirePermission(ctx, "checkin.create");
  const branchId = requireActiveBranch(ctx);
  const input = checkinInput.parse(raw);
  return db.transaction(async (tx) => {
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, ctx.companyId)))
      .for("update");
    if (!vehicle) throw new NotFoundError("Kendaraan");
    if (vehicle.customerId !== input.customerId) throw new ValidationError("Kendaraan bukan milik customer yang dipilih");

    const active = await tx.query.vehicleCheckins.findFirst({
      where: and(eq(vehicleCheckins.vehicleId, vehicle.id), inArray(vehicleCheckins.status, ["open", "in_progress"])),
    });
    if (active) throw new ValidationError(`Kendaraan ${vehicle.plateNumber} masih memiliki check-in aktif (${active.checkinNumber})`);

    let overrideReason: string | null = null;
    if (input.odometer < vehicle.lastOdometer) {
      if (!can(ctx, "checkin.override_odometer")) {
        throw new ValidationError(
          `Odometer ${input.odometer.toLocaleString("id-ID")} lebih kecil dari histori terakhir ${vehicle.lastOdometer.toLocaleString("id-ID")} km. Diperlukan override oleh user berwenang (BR-015).`,
        );
      }
      if (!input.odometerOverrideReason || input.odometerOverrideReason.length < 3) {
        throw new ValidationError("Alasan override odometer wajib diisi (BR-015)");
      }
      overrideReason = input.odometerOverrideReason;
    }

    let booking = null;
    if (input.bookingId) {
      booking = await tx.query.bookings.findFirst({ where: and(eq(bookings.id, input.bookingId), eq(bookings.companyId, ctx.companyId)) });
      if (!booking) throw new NotFoundError("Booking");
      if (!["scheduled", "confirmed"].includes(booking.status)) throw new ValidationError("Booking sudah diproses / dibatalkan");
      if (booking.vehicleId !== vehicle.id) throw new ValidationError("Kendaraan tidak sesuai dengan booking");
    }

    const checkinNumber = await nextDocNumber(tx, ctx.companyId, branchId, "CHK");
    const [row] = await tx
      .insert(vehicleCheckins)
      .values({
        companyId: ctx.companyId,
        branchId,
        checkinNumber,
        bookingId: booking?.id ?? null,
        customerId: input.customerId,
        vehicleId: vehicle.id,
        odometer: input.odometer,
        odometerOverrideReason: overrideReason,
        fuelLevel: input.fuelLevel,
        conditionNotes: input.conditionNotes,
        belongings: input.belongings,
        complaint: input.complaint,
        arrivalTime: new Date(),
        checkinBy: ctx.userId,
        status: "open",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();

    if (input.odometer > vehicle.lastOdometer || overrideReason) {
      await tx.update(vehicles).set({ lastOdometer: input.odometer, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(vehicles.id, vehicle.id));
    }
    if (booking) {
      await tx.update(bookings).set({ status: "arrived", checkinId: row.id, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(bookings.id, booking.id));
    }
    if (photos.length) await addAttachments(tx, ctx, "checkin", row.id, photos);

    await writeAudit(tx, ctx, { action: "CREATE", entity: "checkin", entityId: row.id, referenceNumber: checkinNumber, newValue: row, branchId });
    if (overrideReason) {
      await writeAudit(tx, ctx, {
        action: "OVERRIDE",
        entity: "vehicle_odometer",
        entityId: vehicle.id,
        referenceNumber: checkinNumber,
        oldValue: { odometer: vehicle.lastOdometer },
        newValue: { odometer: input.odometer },
        reason: overrideReason,
        branchId,
      });
    }
    return row;
  });
}

export async function addCheckinPhotos(ctx: AuthContext, checkinId: string, photos: UploadFile[]) {
  requirePermission(ctx, "checkin.create");
  const c = await db.query.vehicleCheckins.findFirst({ where: and(eq(vehicleCheckins.id, checkinId), eq(vehicleCheckins.companyId, ctx.companyId)) });
  if (!c) throw new NotFoundError("Check-in");
  assertBranchAccess(ctx, c.branchId);
  await db.transaction((tx) => addAttachments(tx, ctx, "checkin", checkinId, photos));
}

export async function cancelCheckin(ctx: AuthContext, id: string, rawReason: unknown) {
  requirePermission(ctx, "checkin.cancel");
  const why = parseReason(rawReason);
  await db.transaction(async (tx) => {
    const c = await tx.query.vehicleCheckins.findFirst({ where: and(eq(vehicleCheckins.id, id), eq(vehicleCheckins.companyId, ctx.companyId)) });
    if (!c) throw new NotFoundError("Check-in");
    assertBranchAccess(ctx, c.branchId);
    if (c.status !== "open") throw new ValidationError("Hanya check-in berstatus Open (belum ada Work Order) yang dapat dibatalkan");
    await tx.update(vehicleCheckins).set({ status: "cancelled", cancelReason: why, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(vehicleCheckins.id, id));
    await tx
      .update(estimates)
      .set({ status: "cancelled", cancelReason: "Check-in dibatalkan", updatedAt: new Date(), updatedBy: ctx.userId })
      .where(and(eq(estimates.checkinId, id), inArray(estimates.status, ["draft", "sent"])));
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "checkin", entityId: id, referenceNumber: c.checkinNumber, reason: why, branchId: c.branchId });
  });
}

// ---------------------------------------------------------------------------
// Inspection & Diagnosis (URS-INS-001/002)
// ---------------------------------------------------------------------------
export const INSPECTION_RESULTS = ["good", "attention", "replace", "not_checked"] as const;

const inspectionInput = z.object({
  notes: optStr,
  items: z
    .array(
      z.object({
        category: reqStr("Kategori"),
        itemName: reqStr("Item"),
        result: z.enum(INSPECTION_RESULTS),
        notes: optStr,
      }),
    )
    .min(1, "Checklist inspeksi kosong"),
});

export async function getInspectionTemplate(ctx: AuthContext, vehicleType: string) {
  const tpl = await db.query.inspectionTemplates.findFirst({
    where: and(eq(inspectionTemplates.companyId, ctx.companyId), eq(inspectionTemplates.vehicleType, vehicleType), eq(inspectionTemplates.isActive, true)),
    with: { items: { orderBy: asc(inspectionTemplateItems.sortOrder) } },
  });
  return tpl ?? null;
}

export async function createInspection(ctx: AuthContext, checkinId: string, raw: unknown) {
  requirePermission(ctx, "inspection.execute");
  const input = inspectionInput.parse(raw);
  return db.transaction(async (tx) => {
    const c = await tx.query.vehicleCheckins.findFirst({ where: and(eq(vehicleCheckins.id, checkinId), eq(vehicleCheckins.companyId, ctx.companyId)) });
    if (!c) throw new NotFoundError("Check-in");
    assertBranchAccess(ctx, c.branchId);
    if (c.status === "cancelled" || c.status === "completed") throw new ValidationError("Check-in sudah ditutup");
    const severity = { good: 0, not_checked: 0, attention: 1, replace: 2 } as const;
    const worst = input.items.reduce((acc, it) => Math.max(acc, severity[it.result]), 0);
    const result = worst === 2 ? "replace" : worst === 1 ? "attention" : "good";
    const [row] = await tx
      .insert(inspections)
      .values({
        companyId: ctx.companyId,
        branchId: c.branchId,
        checkinId,
        inspectorId: ctx.userId,
        result,
        notes: input.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await tx.insert(inspectionItems).values(input.items.map((it, i) => ({ ...it, inspectionId: row.id, sortOrder: i })));
    await writeAudit(tx, ctx, { action: "CREATE", entity: "inspection", entityId: row.id, referenceNumber: c.checkinNumber, newValue: { result, items: input.items.length }, branchId: c.branchId });
    return row;
  });
}

export async function getInspectionUsers(ctx: AuthContext, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.companyId, ctx.companyId), inArray(users.id, ids)));
}
