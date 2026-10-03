import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { customers, invoices, parts, vehicles, workOrders } from "@/server/db/schema";
import { branchScope, can, type AuthContext } from "@/server/auth/context";
import { normalizePhone, normalizePlate } from "@/lib/utils";

export type SearchHit = { type: string; id: string; title: string; subtitle: string; href: string };

/** Global search: customer, HP, nomor polisi, rangka, WO, invoice, SKU, barcode (SRS 4.8) */
export async function globalSearch(ctx: AuthContext, rawQ: string): Promise<SearchHit[]> {
  const q = rawQ.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const plate = `%${normalizePlate(q)}%`;
  const phone = normalizePhone(q);
  const hits: SearchHit[] = [];

  if (can(ctx, "customer.view")) {
    const rows = await db
      .select({ id: customers.id, name: customers.name, code: customers.customerCode, phone: customers.phone })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, ctx.companyId),
          isNull(customers.deletedAt),
          or(ilike(customers.name, like), ilike(customers.customerCode, like), phone && phone.length >= 5 ? or(ilike(customers.phone, `%${phone}%`), ilike(customers.whatsapp, `%${phone}%`)) : undefined),
        ),
      )
      .limit(8);
    hits.push(...rows.map((r) => ({ type: "Customer", id: r.id, title: r.name, subtitle: `${r.code} · ${r.phone ?? "-"}`, href: `/customers/${r.id}` })));
  }
  if (can(ctx, "vehicle.view")) {
    const rows = await db
      .select({ id: vehicles.id, plate: vehicles.plateNumber, chassis: vehicles.chassisNumber, owner: customers.name })
      .from(vehicles)
      .innerJoin(customers, eq(customers.id, vehicles.customerId))
      .where(
        and(
          eq(vehicles.companyId, ctx.companyId),
          isNull(vehicles.deletedAt),
          or(sql`replace(upper(${vehicles.plateNumber}),' ','') like ${plate}`, ilike(vehicles.chassisNumber, like), ilike(vehicles.engineNumber, like)),
        ),
      )
      .limit(8);
    hits.push(...rows.map((r) => ({ type: "Kendaraan", id: r.id, title: r.plate, subtitle: `${r.owner}${r.chassis ? ` · ${r.chassis}` : ""}`, href: `/vehicles/${r.id}` })));
  }
  if (can(ctx, "workorder.view")) {
    const rows = await db
      .select({ id: workOrders.id, number: workOrders.woNumber, status: workOrders.status, plate: vehicles.plateNumber })
      .from(workOrders)
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .where(and(eq(workOrders.companyId, ctx.companyId), branchScope(ctx, workOrders.branchId), ilike(workOrders.woNumber, like)))
      .limit(8);
    hits.push(...rows.map((r) => ({ type: "Work Order", id: r.id, title: r.number, subtitle: `${r.plate} · ${r.status}`, href: `/work-orders/${r.id}` })));
  }
  if (can(ctx, "invoice.view")) {
    const rows = await db
      .select({ id: invoices.id, number: invoices.invoiceNumber, status: invoices.paymentStatus, total: invoices.grandTotal })
      .from(invoices)
      .where(and(eq(invoices.companyId, ctx.companyId), branchScope(ctx, invoices.branchId), ilike(invoices.invoiceNumber, like)))
      .limit(8);
    hits.push(...rows.map((r) => ({ type: "Invoice", id: r.id, title: r.number, subtitle: `${r.status} · Rp${r.total.toLocaleString("id-ID")}`, href: `/invoices/${r.id}` })));
  }
  if (can(ctx, "inventory.view")) {
    const rows = await db
      .select({ id: parts.id, sku: parts.sku, name: parts.partName, barcode: parts.barcode })
      .from(parts)
      .where(and(eq(parts.companyId, ctx.companyId), isNull(parts.deletedAt), or(ilike(parts.sku, like), ilike(parts.partName, like), eq(parts.barcode, q))))
      .limit(8);
    hits.push(...rows.map((r) => ({ type: "Spare Part", id: r.id, title: r.name, subtitle: `${r.sku}${r.barcode ? ` · ${r.barcode}` : ""}`, href: `/inventory/parts/${r.id}` })));
  }
  return hits;
}
