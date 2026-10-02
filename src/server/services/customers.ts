import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { customers, invoices, vehicleCheckins, vehicles, workOrders, vehicleBrands, vehicleModels } from "@/server/db/schema";
import { requirePermission, scopeBranchIds, type AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { likeQ, optStr, pageArgs, reqStr, parseReason, type ListParams } from "@/server/validation";
import { normalizePhone, normalizePlate } from "@/lib/utils";
import { writeAudit } from "./audit";
import { nextMasterCode } from "./numbering";

export const customerInput = z.object({
  name: reqStr("Nama customer"),
  phone: optStr,
  whatsapp: optStr,
  email: optStr.refine((v) => v === null || z.email().safeParse(v).success, "Format email tidak valid"),
  address: optStr,
  customerType: z.enum(["retail", "corporate", "fleet"]).default("retail"),
  companyName: optStr,
  taxId: optStr,
  notes: optStr,
});

/**
 * List/search customer berdasarkan nama, HP, WhatsApp, kode atau nomor polisi (URS-CUS-002).
 * Master customer berlaku lintas cabang dalam satu company.
 */
export async function listCustomers(ctx: AuthContext, params: ListParams & { type?: string | null } = {}) {
  requirePermission(ctx, "customer.view");
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const plate = params.q ? `%${normalizePlate(params.q)}%` : null;
  const phone = params.q ? normalizePhone(params.q) : null;
  const where = and(
    eq(customers.companyId, ctx.companyId),
    isNull(customers.deletedAt),
    params.type ? eq(customers.customerType, params.type) : undefined,
    like
      ? or(
          ilike(customers.name, like),
          ilike(customers.customerCode, like),
          ilike(customers.companyName, like),
          phone ? ilike(customers.phone, `%${phone}%`) : undefined,
          phone ? ilike(customers.whatsapp, `%${phone}%`) : undefined,
          sql`exists (select 1 from ${vehicles} v where v.customer_id = ${customers.id} and v.deleted_at is null and replace(upper(v.plate_number),' ','') like ${plate})`,
        )
      : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        customerCode: customers.customerCode,
        name: customers.name,
        phone: customers.phone,
        whatsapp: customers.whatsapp,
        email: customers.email,
        customerType: customers.customerType,
        companyName: customers.companyName,
        status: customers.status,
        vehicleCount: sql<number>`(select count(*)::int from ${vehicles} v where v.customer_id = ${customers.id} and v.deleted_at is null)`,
        lastVisit: sql<string | null>`(select max(c.arrival_time) from ${vehicleCheckins} c where c.customer_id = ${customers.id})`,
      })
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getCustomer(ctx: AuthContext, id: string) {
  requirePermission(ctx, "customer.view");
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, id), eq(customers.companyId, ctx.companyId)),
  });
  if (!customer) throw new NotFoundError("Customer");
  const vehicleRows = await db
    .select({
      id: vehicles.id,
      plateNumber: vehicles.plateNumber,
      vehicleType: vehicles.vehicleType,
      brand: vehicleBrands.name,
      model: vehicleModels.name,
      year: vehicles.year,
      color: vehicles.color,
      lastOdometer: vehicles.lastOdometer,
    })
    .from(vehicles)
    .leftJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .leftJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(and(eq(vehicles.customerId, id), isNull(vehicles.deletedAt)))
    .orderBy(asc(vehicles.plateNumber));
  return { ...customer, vehicles: vehicleRows };
}

/** Histori transaksi customer (URS-CUS-003) — dibatasi cabang yang boleh diakses (AC-001) */
export async function customerHistory(ctx: AuthContext, customerId: string) {
  requirePermission(ctx, "customer.view");
  const branchIds = scopeBranchIds(ctx);
  if (!branchIds.length) return { workOrders: [], invoices: [] };
  const [woRows, invRows] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        woNumber: workOrders.woNumber,
        status: workOrders.status,
        plateNumber: vehicles.plateNumber,
        createdAt: workOrders.createdAt,
        complaint: workOrders.complaint,
      })
      .from(workOrders)
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .where(and(eq(workOrders.customerId, customerId), inArray(workOrders.branchId, branchIds)))
      .orderBy(desc(workOrders.createdAt))
      .limit(50),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        grandTotal: invoices.grandTotal,
        paidAmount: invoices.paidAmount,
        paymentStatus: invoices.paymentStatus,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.customerId, customerId), inArray(invoices.branchId, branchIds)))
      .orderBy(desc(invoices.invoiceDate))
      .limit(50),
  ]);
  return { workOrders: woRows, invoices: invRows };
}

export async function createCustomer(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "customer.create");
  const input = customerInput.parse(raw);
  return db.transaction(async (tx) => {
    const customerCode = await nextMasterCode(tx, ctx.companyId, "CUS");
    const [row] = await tx
      .insert(customers)
      .values({
        ...input,
        phone: normalizePhone(input.phone),
        whatsapp: normalizePhone(input.whatsapp ?? input.phone),
        companyId: ctx.companyId,
        customerCode,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "customer", entityId: row.id, referenceNumber: customerCode, newValue: row });
    return row;
  });
}

export async function updateCustomer(ctx: AuthContext, id: string, raw: unknown) {
  requirePermission(ctx, "customer.edit");
  const input = customerInput.parse(raw);
  return db.transaction(async (tx) => {
    const old = await tx.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.companyId, ctx.companyId)) });
    if (!old) throw new NotFoundError("Customer");
    const [row] = await tx
      .update(customers)
      .set({
        ...input,
        phone: normalizePhone(input.phone),
        whatsapp: normalizePhone(input.whatsapp ?? input.phone),
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(customers.id, id))
      .returning();
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "customer", entityId: id, referenceNumber: old.customerCode, oldValue: old, newValue: row });
    return row;
  });
}

/** Soft delete (BR-016 / SRS 4.10) */
export async function deactivateCustomer(ctx: AuthContext, id: string, rawReason: unknown) {
  requirePermission(ctx, "customer.delete");
  const why = parseReason(rawReason);
  return db.transaction(async (tx) => {
    const old = await tx.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.companyId, ctx.companyId)) });
    if (!old) throw new NotFoundError("Customer");
    await tx.update(customers).set({ status: "inactive", deletedAt: new Date(), updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(customers.id, id));
    await writeAudit(tx, ctx, { action: "DELETE", entity: "customer", entityId: id, referenceNumber: old.customerCode, reason: why });
  });
}

export async function customerOptions(ctx: AuthContext, q?: string | null) {
  const res = await listCustomers(ctx, { q, pageSize: 20 });
  return res.rows;
}
