import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  branches,
  companies,
  customers,
  inspectionTemplateItems,
  inspectionTemplates,
  partCategories,
  parts,
  paymentMethods,
  permissions,
  rolePermissions,
  roles,
  services,
  suppliers,
  users,
  vehicleBrands,
  vehicleModels,
  vehicleOwnerships,
  vehicles,
  warehouses,
} from "@/server/db/schema";
import { DEFAULT_ROLES, PERMISSIONS, type Permission } from "@/lib/permissions";
import { hashPassword } from "@/server/auth/password";
import { buildContext } from "@/server/auth/context";
import { DEFAULT_NUMBERING } from "@/server/services/numbering";
import { addDaysISO, formatPlate, normalizePhone, todayISO } from "@/lib/utils";
import { BRANDS, CUSTOMERS, INSPECTION_TEMPLATES, PART_CATEGORIES, PARTS, PAYMENT_METHODS, SERVICES, SUPPLIERS, USERS } from "./data";

export const DEMO_PASSWORD = "Password123";

export async function seedPermissions() {
  const rows = Object.entries(PERMISSIONS).map(([code, description]) => {
    const [module, ...rest] = code.split(".");
    return { code, module, action: rest.join("."), description };
  });
  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({ target: permissions.code, set: { description: sql`excluded.description`, module: sql`excluded.module`, action: sql`excluded.action` } });
}

export async function seedDatabase(opts: { withDemoTransactions?: boolean } = {}) {
  await seedPermissions();
  const existing = await db.query.companies.findFirst();
  if (existing) return { skipped: true, users: [] as { username: string; role: string }[] };

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const ids = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        code: "REKA",
        name: "REKA Auto Service",
        address: "Jl. Raya Bengkel No. 1, Jakarta",
        phone: "021-5550000",
        email: "admin@reka-auto.test",
        taxRate: 11,
        settings: {
          reminderCarDays: 180,
          reminderCarKm: 5000,
          reminderMotorDays: 60,
          reminderMotorKm: 2000,
          estimateValidDays: 7,
          numbering: { ...DEFAULT_NUMBERING },
          sequencePadding: 3,
        },
      })
      .returning();
    const [jkt, bdg] = await tx
      .insert(branches)
      .values([
        { companyId: company.id, code: "JKT", name: "Cabang Jakarta", address: "Jl. Raya Bengkel No. 1, Jakarta Selatan", phone: "021-5550001" },
        { companyId: company.id, code: "BDG", name: "Cabang Bandung", address: "Jl. Soekarno-Hatta No. 99, Bandung", phone: "022-5550002" },
      ])
      .returning();
    const [whJkt, whBdg] = await tx
      .insert(warehouses)
      .values([
        { companyId: company.id, branchId: jkt.id, code: "GD-JKT", name: "Gudang Utama Jakarta", isDefault: true },
        { companyId: company.id, branchId: bdg.id, code: "GD-BDG", name: "Gudang Utama Bandung", isDefault: true },
      ])
      .returning();

    const roleIds: Record<string, { id: string; allBranches: boolean }> = {};
    for (const def of DEFAULT_ROLES) {
      const [r] = await tx.insert(roles).values({ companyId: company.id, name: def.name, description: def.description, isSystem: true }).returning();
      roleIds[def.name] = { id: r.id, allBranches: def.allBranches };
      const uniq = [...new Set(def.permissions)] as Permission[];
      await tx.insert(rolePermissions).values(uniq.map((p) => ({ roleId: r.id, permissionCode: p })));
    }

    const userIds: Record<string, string> = {};
    for (const u of USERS) {
      const role = roleIds[u.role];
      const [row] = await tx
        .insert(users)
        .values({
          companyId: company.id,
          branchId: u.branch === "BDG" ? bdg.id : jkt.id,
          roleId: role.id,
          name: u.name,
          username: u.username,
          email: `${u.username}@reka-auto.test`,
          passwordHash,
          allBranches: role.allBranches,
        })
        .returning();
      userIds[u.username] = row.id;
    }

    const brandIds: Record<string, string> = {};
    const modelIds: Record<string, string> = {};
    for (const b of BRANDS) {
      const [br] = await tx.insert(vehicleBrands).values({ companyId: company.id, name: b.name, vehicleType: b.type }).returning();
      brandIds[`${b.type}:${b.name}`] = br.id;
      const ms = await tx.insert(vehicleModels).values(b.models.map((m) => ({ brandId: br.id, name: m }))).returning();
      for (const m of ms) modelIds[`${b.type}:${b.name}:${m.name}`] = m.id;
    }

    await tx.insert(services).values(
      SERVICES.map((s) => ({
        companyId: company.id,
        serviceCode: s.code,
        serviceName: s.name,
        category: s.category,
        vehicleType: s.vehicleType,
        standardHour: s.hours,
        sellingPrice: s.price,
        reminderDays: s.reminderDays ?? null,
        reminderKm: s.reminderKm ?? null,
      })),
    );

    const cats = await tx.insert(partCategories).values(PART_CATEGORIES.map((name) => ({ companyId: company.id, name }))).returning();
    await tx.insert(parts).values(
      PARTS.map((p) => ({
        companyId: company.id,
        sku: p.sku,
        barcode: p.barcode,
        partName: p.name,
        categoryId: cats.find((c) => c.name === p.category)?.id ?? null,
        itemType: p.type,
        unit: p.unit,
        brand: p.brand,
        purchasePrice: p.buy,
        sellingPrice: p.sell,
        minimumStock: p.min,
      })),
    );
    await tx.insert(suppliers).values(SUPPLIERS.map((s) => ({ companyId: company.id, code: s.code, name: s.name, contactName: s.contact, phone: s.phone })));
    await tx.insert(paymentMethods).values(
      PAYMENT_METHODS.map((m, i) => ({ companyId: company.id, code: m.code, name: m.name, type: m.type, requiresReference: m.ref, sortOrder: i })),
    );
    for (const t of INSPECTION_TEMPLATES) {
      const [tpl] = await tx.insert(inspectionTemplates).values({ companyId: company.id, vehicleType: t.vehicleType, name: t.name }).returning();
      await tx.insert(inspectionTemplateItems).values(t.items.map(([category, itemName], i) => ({ templateId: tpl.id, category, itemName, sortOrder: i })));
    }

    let custSeq = 0;
    const vehicleIds: Record<string, string> = {};
    for (const c of CUSTOMERS) {
      custSeq++;
      const [cu] = await tx
        .insert(customers)
        .values({
          companyId: company.id,
          customerCode: `CUS-${String(custSeq).padStart(6, "0")}`,
          name: c.name,
          phone: normalizePhone(c.phone),
          whatsapp: normalizePhone(c.phone),
          customerType: c.type,
          companyName: c.companyName ?? null,
        })
        .returning();
      for (const v of c.vehicles) {
        const [ve] = await tx
          .insert(vehicles)
          .values({
            companyId: company.id,
            customerId: cu.id,
            plateNumber: formatPlate(v.plate),
            vehicleType: v.type,
            brandId: brandIds[`${v.type}:${v.brand}`],
            modelId: modelIds[`${v.type}:${v.brand}:${v.model}`],
            year: v.year,
            color: v.color,
            chassisNumber: v.chassis,
            lastOdometer: v.odo,
          })
          .returning();
        await tx.insert(vehicleOwnerships).values({ vehicleId: ve.id, customerId: cu.id, startDate: addDaysISO(todayISO(), -365) });
        vehicleIds[formatPlate(v.plate)] = ve.id;
      }
    }
    await tx.execute(sql`insert into document_sequences (company_id, scope, doc_type, period, last_value) values (${company.id}, 'company', 'CUS', 'all', ${custSeq})`);
    return { companyId: company.id, jkt: jkt.id, bdg: bdg.id, whJkt: whJkt.id, whBdg: whBdg.id, userIds, vehicleIds };
  });

  // Saldo awal stok dicatat sebagai dokumen stock opname agar seluruh stok punya referensi transaksi (BR-005)
  const { createAdjustment } = await import("@/server/services/inventory");
  const allParts = await db.select().from(parts).where(eq(parts.companyId, ids.companyId));
  const adminJkt = await buildContext(ids.userIds["superadmin"], { activeBranchId: ids.jkt });
  for (const [wh, key] of [
    [ids.whJkt, "openingJkt"],
    [ids.whBdg, "openingBdg"],
  ] as const) {
    await createAdjustment(adminJkt, {
      warehouseId: wh,
      adjustmentType: "opname",
      reason: "Saldo awal persediaan",
      items: PARTS.filter((p) => p[key] > 0).map((p) => ({ partId: allParts.find((x) => x.sku === p.sku)!.id, countedQty: p[key] })),
    });
  }
  // Set average cost saldo awal = harga beli
  await db.execute(sql`update inventory i set average_cost = p.purchase_price from parts p where p.id = i.part_id`);
  await db.execute(sql`update stock_movements m set unit_cost = p.purchase_price from parts p where p.id = m.part_id`);

  if (opts.withDemoTransactions) {
    const { seedDemoTransactions } = await import("./demo");
    await seedDemoTransactions(ids);
  }
  return { skipped: false, users: USERS.map((u) => ({ username: u.username, role: u.role })), ids };
}

export type SeedIds = {
  companyId: string;
  jkt: string;
  bdg: string;
  whJkt: string;
  whBdg: string;
  userIds: Record<string, string>;
  vehicleIds: Record<string, string>;
};
