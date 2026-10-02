import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  inspectionTemplateItems,
  inspectionTemplates,
  partCategories,
  parts,
  paymentMethods,
  services,
  suppliers,
  vehicleBrands,
  vehicleModels,
} from "@/server/db/schema";
import { requireAnyPermission, requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { bool, likeQ, nonNeg, optInt, optStr, optUuid, pageArgs, reqStr, type ListParams } from "@/server/validation";
import { writeAudit } from "./audit";

// ---------------------------------------------------------------------------
// Master jasa
// ---------------------------------------------------------------------------
const serviceInput = z.object({
  serviceCode: reqStr("Kode jasa"),
  serviceName: reqStr("Nama jasa"),
  category: optStr,
  vehicleType: z.enum(["car", "motorcycle", "all"]).default("all"),
  standardHour: nonNeg("Standard hour"),
  sellingPrice: nonNeg("Harga jual"),
  reminderDays: optInt,
  reminderKm: optInt,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listServices(ctx: AuthContext, params: ListParams & { vehicleType?: string | null; activeOnly?: boolean } = {}) {
  const { limit, offset, page, pageSize } = pageArgs({ pageSize: 100, ...params });
  const like = likeQ(params.q);
  const where = and(
    eq(services.companyId, ctx.companyId),
    isNull(services.deletedAt),
    params.activeOnly ? eq(services.status, "active") : undefined,
    params.vehicleType ? or(eq(services.vehicleType, params.vehicleType), eq(services.vehicleType, "all")) : undefined,
    like ? or(ilike(services.serviceName, like), ilike(services.serviceCode, like), ilike(services.category, like)) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(services).where(where).orderBy(asc(services.serviceCode)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(services).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function saveService(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "service.manage");
  const input = serviceInput.parse(raw);
  return db.transaction(async (tx) => {
    if (id) {
      const old = await tx.query.services.findFirst({ where: and(eq(services.id, id), eq(services.companyId, ctx.companyId)) });
      if (!old) throw new NotFoundError("Jasa");
      const [row] = await tx.update(services).set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(services.id, id)).returning();
      // BR-010: perubahan harga master tercatat di audit
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "service", entityId: id, referenceNumber: row.serviceCode, oldValue: old, newValue: row });
      return row;
    }
    const [row] = await tx.insert(services).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId, updatedBy: ctx.userId }).returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "service", entityId: row.id, referenceNumber: row.serviceCode, newValue: row });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Master spare part
// ---------------------------------------------------------------------------
const partInput = z.object({
  sku: reqStr("SKU"),
  barcode: optStr,
  partName: reqStr("Nama part"),
  categoryId: optUuid,
  itemType: z.enum(["part", "material"]).default("part"),
  unit: reqStr("Satuan"),
  brand: optStr,
  purchasePrice: nonNeg("Harga beli"),
  sellingPrice: nonNeg("Harga jual"),
  minimumStock: nonNeg("Minimum stok"),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listParts(ctx: AuthContext, params: ListParams = {}) {
  const { limit, offset, page, pageSize } = pageArgs(params);
  const like = likeQ(params.q);
  const where = and(
    eq(parts.companyId, ctx.companyId),
    isNull(parts.deletedAt),
    like ? or(ilike(parts.partName, like), ilike(parts.sku, like), ilike(parts.barcode, like), ilike(parts.brand, like)) : undefined,
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
        brand: parts.brand,
        purchasePrice: parts.purchasePrice,
        sellingPrice: parts.sellingPrice,
        minimumStock: parts.minimumStock,
        status: parts.status,
        category: partCategories.name,
        categoryId: parts.categoryId,
      })
      .from(parts)
      .leftJoin(partCategories, eq(partCategories.id, parts.categoryId))
      .where(where)
      .orderBy(asc(parts.partName))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(parts).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function getPart(ctx: AuthContext, id: string) {
  const p = await db.query.parts.findFirst({ where: and(eq(parts.id, id), eq(parts.companyId, ctx.companyId)), with: { category: true } });
  if (!p) throw new NotFoundError("Part");
  return p;
}

export async function savePart(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "part.manage");
  const input = partInput.parse(raw);
  input.sku = input.sku.toUpperCase();
  return db.transaction(async (tx) => {
    if (id) {
      const old = await tx.query.parts.findFirst({ where: and(eq(parts.id, id), eq(parts.companyId, ctx.companyId)) });
      if (!old) throw new NotFoundError("Part");
      const [row] = await tx.update(parts).set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(parts.id, id)).returning();
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "part", entityId: id, referenceNumber: row.sku, oldValue: old, newValue: row });
      return row;
    }
    const [row] = await tx.insert(parts).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId, updatedBy: ctx.userId }).returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "part", entityId: row.id, referenceNumber: row.sku, newValue: row });
    return row;
  });
}

export async function partCategoryOptions(ctx: AuthContext) {
  return db.select().from(partCategories).where(eq(partCategories.companyId, ctx.companyId)).orderBy(asc(partCategories.name));
}

export async function savePartCategory(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "part.manage");
  const input = z.object({ name: reqStr("Nama kategori") }).parse(raw);
  const [row] = await db.insert(partCategories).values({ companyId: ctx.companyId, name: input.name, createdBy: ctx.userId }).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------
const supplierInput = z.object({
  code: reqStr("Kode supplier"),
  name: reqStr("Nama supplier"),
  contactName: optStr,
  phone: optStr,
  email: optStr,
  address: optStr,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listSuppliers(ctx: AuthContext, params: ListParams = {}) {
  requireAnyPermission(ctx, "supplier.manage", "purchase.view", "inventory.receive");
  const like = likeQ(params.q);
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.companyId, ctx.companyId), isNull(suppliers.deletedAt), like ? or(ilike(suppliers.name, like), ilike(suppliers.code, like)) : undefined))
    .orderBy(asc(suppliers.name));
}

export async function saveSupplier(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "supplier.manage");
  const input = supplierInput.parse(raw);
  return db.transaction(async (tx) => {
    if (id) {
      const old = await tx.query.suppliers.findFirst({ where: and(eq(suppliers.id, id), eq(suppliers.companyId, ctx.companyId)) });
      if (!old) throw new NotFoundError("Supplier");
      const [row] = await tx.update(suppliers).set({ ...input, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(suppliers.id, id)).returning();
      await writeAudit(tx, ctx, { action: "UPDATE", entity: "supplier", entityId: id, oldValue: old, newValue: row });
      return row;
    }
    const [row] = await tx.insert(suppliers).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId, updatedBy: ctx.userId }).returning();
    await writeAudit(tx, ctx, { action: "CREATE", entity: "supplier", entityId: row.id, newValue: row });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Merk & model kendaraan
// ---------------------------------------------------------------------------
export async function saveBrand(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "settings.master");
  const input = z.object({ name: reqStr("Merk"), vehicleType: z.enum(["car", "motorcycle"]) }).parse(raw);
  const [row] = await db.insert(vehicleBrands).values({ ...input, companyId: ctx.companyId, createdBy: ctx.userId }).returning();
  await writeAudit(db, ctx, { action: "CREATE", entity: "vehicle_brand", entityId: row.id, newValue: row });
  return row;
}

export async function saveModel(ctx: AuthContext, raw: unknown) {
  requirePermission(ctx, "settings.master");
  const input = z.object({ brandId: z.uuid(), name: reqStr("Model") }).parse(raw);
  const brand = await db.query.vehicleBrands.findFirst({ where: and(eq(vehicleBrands.id, input.brandId), eq(vehicleBrands.companyId, ctx.companyId)) });
  if (!brand) throw new NotFoundError("Merk");
  const [row] = await db.insert(vehicleModels).values({ ...input, createdBy: ctx.userId }).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Metode pembayaran
// ---------------------------------------------------------------------------
const paymentMethodInput = z.object({
  code: reqStr("Kode"),
  name: reqStr("Nama"),
  type: z.enum(["cash", "qris", "debit", "credit_card", "transfer", "ewallet"]),
  requiresReference: bool,
  sortOrder: optInt,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listPaymentMethods(ctx: AuthContext) {
  return db.select().from(paymentMethods).where(eq(paymentMethods.companyId, ctx.companyId)).orderBy(asc(paymentMethods.sortOrder));
}

export async function savePaymentMethod(ctx: AuthContext, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.master");
  const input = paymentMethodInput.parse(raw);
  const values = { ...input, code: input.code.toUpperCase(), sortOrder: input.sortOrder ?? 0 };
  if (id) {
    const [row] = await db
      .update(paymentMethods)
      .set({ ...values, updatedAt: new Date(), updatedBy: ctx.userId })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, ctx.companyId)))
      .returning();
    if (!row) throw new NotFoundError("Metode pembayaran");
    await writeAudit(db, ctx, { action: "UPDATE", entity: "payment_method", entityId: id, newValue: row });
    return row;
  }
  const [row] = await db.insert(paymentMethods).values({ ...values, companyId: ctx.companyId, createdBy: ctx.userId }).returning();
  await writeAudit(db, ctx, { action: "CREATE", entity: "payment_method", entityId: row.id, newValue: row });
  return row;
}

// ---------------------------------------------------------------------------
// Template inspeksi (checklist berbeda untuk mobil & motor — BRD 1.5)
// ---------------------------------------------------------------------------
export async function listInspectionTemplates(ctx: AuthContext) {
  return db.query.inspectionTemplates.findMany({
    where: eq(inspectionTemplates.companyId, ctx.companyId),
    with: { items: { orderBy: asc(inspectionTemplateItems.sortOrder) } },
  });
}

export async function saveInspectionTemplateItems(ctx: AuthContext, templateId: string, raw: unknown) {
  requirePermission(ctx, "settings.master");
  const input = z.object({ items: z.array(z.object({ category: reqStr("Kategori"), itemName: reqStr("Item") })).min(1) }).parse(raw);
  await db.transaction(async (tx) => {
    const tpl = await tx.query.inspectionTemplates.findFirst({ where: and(eq(inspectionTemplates.id, templateId), eq(inspectionTemplates.companyId, ctx.companyId)) });
    if (!tpl) throw new NotFoundError("Template");
    await tx.delete(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, templateId));
    await tx.insert(inspectionTemplateItems).values(input.items.map((it, i) => ({ ...it, templateId, sortOrder: i })));
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "inspection_template", entityId: templateId, newValue: { items: input.items.length } });
  });
}
