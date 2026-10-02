import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bookings, customers, vehicles } from "@/server/db/schema";
import { assertBranchAccess, branchScope, requireActiveBranch, requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { isoDate, likeQ, optStr, pageArgs, reason, reqUuid, type ListParams } from "@/server/validation";
import { writeAudit } from "./audit";
import { nextDocNumber } from "./numbering";

export const BOOKING_SOURCES = ["admin", "phone", "whatsapp", "walk_in", "online"] as const;

const bookingInput = z.object({
  customerId: reqUuid("Customer"),
  vehicleId: reqUuid("Kendaraan"),
  bookingDate: isoDate("Tanggal booking"),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam booking tidak valid (HH:MM)"),
  complaint: optStr,
  source: z.enum(BOOKING_SOURCES).default("admin"),
  notes: optStr,
});

export async function listBookings(ctx: AuthContext, params: ListParams & { status?: string | null; from?: string | null; to?: string | null } = {}) {
  requirePermission(ctx, "booking.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(bookings.companyId, ctx.companyId),
    branchScope(ctx, bookings.branchId),
    params.status ? eq(bookings.status, params.status) : undefined,
    params.from ? gte(bookings.bookingDate, params.from) : undefined,
    params.to ? lte(bookings.bookingDate, params.to) : undefined,
    like ? or(ilike(bookings.bookingNumber, like), ilike(customers.name, like), ilike(vehicles.plateNumber, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        bookingDate: bookings.bookingDate,
        bookingTime: bookings.bookingTime,
        status: bookings.status,
        source: bookings.source,
        complaint: bookings.complaint,
        customerName: customers.name,
        customerPhone: customers.phone,
        plateNumber: vehicles.plateNumber,
        checkinId: bookings.checkinId,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(vehicles, eq(vehicles.id, bookings.vehicleId))
      .where(where)
      .orderBy(asc(bookings.bookingDate), asc(bookings.bookingTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(vehicles, eq(vehicles.id, bookings.vehicleId))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getBooking(ctx: AuthContext, id: string) {
  requirePermission(ctx, "booking.view");
  const b = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, id), eq(bookings.companyId, ctx.companyId)),
    with: { customer: true, vehicle: true, branch: true },
  });
  if (!b) throw new NotFoundError("Booking");
  assertBranchAccess(ctx, b.branchId);
  return b;
}

export async function createBooking(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "booking.create");
  const branchId = requireActiveBranch(ctx);
  const input = bookingInput.parse(raw);
  const vehicle = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, ctx.companyId)) });
  if (!vehicle) throw new NotFoundError("Kendaraan");
  if (vehicle.customerId !== input.customerId) throw new ValidationError("Kendaraan bukan milik customer yang dipilih");
  return db.transaction(async (tx) => {
    const bookingNumber = await nextDocNumber(tx, ctx.companyId, branchId, "BKG");
    const [row] = await tx
      .insert(bookings)
      .values({ ...input, companyId: ctx.companyId, branchId, bookingNumber, status: "scheduled", createdBy: ctx.userId, updatedBy: ctx.userId })
      .returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "booking", entityId: row.id, referenceNumber: bookingNumber, newValue: row, branchId });
    return row;
  });
}

async function loadForUpdate(ctx: AuthContext, id: string) {
  const b = await db.query.bookings.findFirst({ where: and(eq(bookings.id, id), eq(bookings.companyId, ctx.companyId)) });
  if (!b) throw new NotFoundError("Booking");
  assertBranchAccess(ctx, b.branchId);
  return b;
}

export async function confirmBooking(ctx: AuthContext, id: string) {
  requirePermission(ctx, "booking.edit");
  const b = await loadForUpdate(ctx, id);
  if (b.status !== "scheduled") throw new ValidationError("Hanya booking berstatus Scheduled yang dapat dikonfirmasi");
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ status: "confirmed", updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(bookings.id, id));
    await writeAudit(tx, ctx, { action: "STATUS", entity: "booking", entityId: id, referenceNumber: b.bookingNumber, oldValue: { status: b.status }, newValue: { status: "confirmed" }, branchId: b.branchId });
  });
}

export async function rescheduleBooking(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "booking.edit");
  const input = z
    .object({ bookingDate: isoDate("Tanggal"), bookingTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam tidak valid"), notes: optStr })
    .parse(raw);
  const b = await loadForUpdate(ctx, id);
  if (!["scheduled", "confirmed"].includes(b.status)) throw new ValidationError("Booking ini tidak dapat di-reschedule");
  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({ bookingDate: input.bookingDate, bookingTime: input.bookingTime, notes: input.notes ?? b.notes, updatedAt: new Date(), updatedBy: ctx.userId })
      .where(eq(bookings.id, id));
    await writeAudit(tx, ctx, {
      action: "UPDATE",
      entity: "booking",
      entityId: id,
      referenceNumber: b.bookingNumber,
      oldValue: { bookingDate: b.bookingDate, bookingTime: b.bookingTime },
      newValue: { bookingDate: input.bookingDate, bookingTime: input.bookingTime },
      reason: "Reschedule",
      branchId: b.branchId,
    });
  });
}

/** Cancel / No Show — wajib alasan (BR-011) */
export async function cancelBooking(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "booking.cancel");
  const input = z.object({ reason, noShow: z.boolean().default(false) }).parse(raw);
  const b = await loadForUpdate(ctx, id);
  if (!["scheduled", "confirmed"].includes(b.status)) throw new ValidationError("Booking ini tidak dapat dibatalkan");
  const status = input.noShow ? "no_show" : "cancelled";
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ status, cancelReason: input.reason, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(bookings.id, id));
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "booking", entityId: id, referenceNumber: b.bookingNumber, newValue: { status }, reason: input.reason, branchId: b.branchId });
  });
}

export async function upcomingBookings(ctx: AuthContext, date: string) {
  if (!ctx.permissions.has("booking.view")) return [];
  return db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      bookingTime: bookings.bookingTime,
      status: bookings.status,
      customerName: customers.name,
      plateNumber: vehicles.plateNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(vehicles, eq(vehicles.id, bookings.vehicleId))
    .where(and(eq(bookings.companyId, ctx.companyId), branchScope(ctx, bookings.branchId), eq(bookings.bookingDate, date)))
    .orderBy(asc(bookings.bookingTime), desc(bookings.createdAt));
}
