/**
 * Skema database Workshop Management System.
 * Mengikuti ERD & Data Dictionary (dokumen BRD/ERD/URS/SRS v1.0 bab 3) dengan tambahan
 * kolom wajib implementasi fisik: company_id, branch_id, created_at/by, updated_at/by, deleted_at.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Semua tabel berada di schema Postgres tersendiri ("wms") agar terpisah dari aplikasi lain
 * dalam satu project Supabase dan tidak terekspos ke Data API (PostgREST).
 */
export const wms = pgSchema("wms");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const id = () => uuid("id").primaryKey().defaultRandom();
const money = (name: string) => numeric(name, { precision: 18, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const auditCols = () => ({
  createdAt: ts("created_at").notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
const deletedAt = () => ts("deleted_at");

export type CompanySettings = {
  /** Interval reminder servis berkala */
  reminderCarDays: number;
  reminderCarKm: number;
  reminderMotorDays: number;
  reminderMotorKm: number;
  /** Masa berlaku estimate (hari) */
  estimateValidDays: number;
  /** Prefix penomoran per tipe dokumen */
  numbering: Record<string, string>;
  /** Jumlah digit sequence */
  sequencePadding: number;
};

// ---------------------------------------------------------------------------
// Organisasi, user & akses
// ---------------------------------------------------------------------------
export const companies = wms.table("companies", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  taxId: text("tax_id"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(11),
  settings: jsonb("settings").$type<CompanySettings>().notNull(),
  status: text("status").notNull().default("active"),
  ...auditCols(),
});

export const branches = wms.table(
  "branches",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("branches_company_code_uq").on(t.companyId, t.code)],
);

export const roles = wms.table(
  "roles",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...auditCols(),
  },
  (t) => [uniqueIndex("roles_company_name_uq").on(t.companyId, t.name)],
);

export const permissions = wms.table("permissions", {
  code: text("code").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
});

export const rolePermissions = wms.table(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code").notNull().references(() => permissions.code),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

export const users = wms.table(
  "users",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").references(() => branches.id),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    name: text("name").notNull(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    /** true = dapat mengakses seluruh cabang dalam company (Owner/Super Admin) */
    allBranches: boolean("all_branches").notNull().default(false),
    status: text("status").notNull().default("active"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("users_username_uq").on(sql`lower(${t.username})`),
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    index("users_company_idx").on(t.companyId, t.branchId),
  ],
);

export const sessions = wms.table(
  "sessions",
  {
    /** SHA-256 dari token session (token asli hanya ada di cookie) */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activeBranchId: uuid("active_branch_id").references(() => branches.id),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = wms.table("password_reset_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLogs = wms.table(
  "audit_logs",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    branchId: uuid("branch_id"),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    referenceNumber: text("reference_number"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_company_created_idx").on(t.companyId, t.createdAt),
    index("audit_entity_idx").on(t.entity, t.entityId),
  ],
);

export const documentSequences = wms.table(
  "document_sequences",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** branch_id atau 'company' untuk sequence level perusahaan */
    scope: text("scope").notNull(),
    docType: text("doc_type").notNull(),
    period: text("period").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.scope, t.docType, t.period] })],
);

export const notifications = wms.table(
  "notifications",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id"),
    /** Target berdasarkan permission (mis. qc.execute) atau user tertentu */
    permission: text("permission"),
    userId: uuid("user_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_company_idx").on(t.companyId, t.createdAt)],
);

export const notificationReads = wms.table(
  "notification_reads",
  {
    notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    readAt: ts("read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const attachments = wms.table(
  "attachments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    caption: text("caption"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachments_entity_idx").on(t.entity, t.entityId)],
);

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------
export const customers = wms.table(
  "customers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    customerCode: text("customer_code").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    /** retail | corporate | fleet */
    customerType: text("customer_type").notNull().default("retail"),
    companyName: text("company_name"),
    taxId: text("tax_id"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("customers_company_code_uq").on(t.companyId, t.customerCode),
    index("customers_phone_idx").on(t.companyId, t.phone),
    index("customers_whatsapp_idx").on(t.companyId, t.whatsapp),
    index("customers_name_idx").on(t.companyId, t.name),
  ],
);

export const vehicleBrands = wms.table(
  "vehicle_brands",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    /** car | motorcycle */
    vehicleType: text("vehicle_type").notNull(),
    ...auditCols(),
  },
  (t) => [uniqueIndex("vehicle_brands_uq").on(t.companyId, t.vehicleType, t.name)],
);

export const vehicleModels = wms.table(
  "vehicle_models",
  {
    id: id(),
    brandId: uuid("brand_id").notNull().references(() => vehicleBrands.id),
    name: text("name").notNull(),
    ...auditCols(),
  },
  (t) => [uniqueIndex("vehicle_models_uq").on(t.brandId, t.name)],
);

export const vehicles = wms.table(
  "vehicles",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    plateNumber: text("plate_number").notNull(),
    /** car | motorcycle */
    vehicleType: text("vehicle_type").notNull(),
    brandId: uuid("brand_id").references(() => vehicleBrands.id),
    modelId: uuid("model_id").references(() => vehicleModels.id),
    year: integer("year"),
    color: text("color"),
    chassisNumber: text("chassis_number"),
    engineNumber: text("engine_number"),
    transmission: text("transmission"),
    fuelType: text("fuel_type"),
    lastOdometer: integer("last_odometer").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("vehicles_plate_uq").on(t.companyId, t.plateNumber).where(sql`${t.deletedAt} is null`),
    index("vehicles_chassis_idx").on(t.companyId, t.chassisNumber),
    index("vehicles_customer_idx").on(t.customerId),
  ],
);

export const vehicleOwnerships = wms.table("vehicle_ownerships", {
  id: id(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const services = wms.table(
  "services",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    serviceCode: text("service_code").notNull(),
    serviceName: text("service_name").notNull(),
    category: text("category"),
    /** car | motorcycle | all */
    vehicleType: text("vehicle_type").notNull().default("all"),
    standardHour: numeric("standard_hour", { precision: 6, scale: 2, mode: "number" }).notNull().default(1),
    sellingPrice: money("selling_price").notNull().default(0),
    reminderDays: integer("reminder_days"),
    reminderKm: integer("reminder_km"),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("services_company_code_uq").on(t.companyId, t.serviceCode)],
);

export const partCategories = wms.table(
  "part_categories",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    ...auditCols(),
  },
  (t) => [uniqueIndex("part_categories_uq").on(t.companyId, t.name)],
);

export const parts = wms.table(
  "parts",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    partName: text("part_name").notNull(),
    categoryId: uuid("category_id").references(() => partCategories.id),
    /** part | material */
    itemType: text("item_type").notNull().default("part"),
    unit: text("unit").notNull().default("pcs"),
    brand: text("brand"),
    purchasePrice: money("purchase_price").notNull().default(0),
    sellingPrice: money("selling_price").notNull().default(0),
    minimumStock: qty("minimum_stock").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("parts_company_sku_uq").on(t.companyId, t.sku),
    index("parts_barcode_idx").on(t.companyId, t.barcode),
    index("parts_name_idx").on(t.companyId, t.partName),
  ],
);

export const suppliers = wms.table(
  "suppliers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    status: text("status").notNull().default("active"),
    ...auditCols(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("suppliers_company_code_uq").on(t.companyId, t.code)],
);

export const paymentMethods = wms.table(
  "payment_methods",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** cash | qris | debit | credit_card | transfer | ewallet */
    type: text("type").notNull(),
    requiresReference: boolean("requires_reference").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("payment_methods_uq").on(t.companyId, t.code)],
);

export const inspectionTemplates = wms.table("inspection_templates", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  vehicleType: text("vehicle_type").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols(),
});

export const inspectionTemplateItems = wms.table("inspection_template_items", {
  id: id(),
  templateId: uuid("template_id").notNull().references(() => inspectionTemplates.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export const warehouses = wms.table(
  "warehouses",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("active"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("warehouses_uq").on(t.companyId, t.code)],
);

export const inventory = wms.table(
  "inventory",
  {
    id: id(),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    partId: uuid("part_id").notNull().references(() => parts.id),
    quantity: qty("quantity").notNull().default(0),
    averageCost: money("average_cost").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_wh_part_uq").on(t.warehouseId, t.partId),
    // Guard terakhir di level database: stok tidak boleh negatif (SRS 4.10)
    check("inventory_qty_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export const stockMovements = wms.table(
  "stock_movements",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    partId: uuid("part_id").notNull().references(() => parts.id),
    /** receive | issue | return | adjust_in | adjust_out | transfer_in | transfer_out | sale | sale_void */
    transactionType: text("transaction_type").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id"),
    referenceNumber: text("reference_number"),
    quantityIn: qty("quantity_in").notNull().default(0),
    quantityOut: qty("quantity_out").notNull().default(0),
    unitCost: money("unit_cost").notNull().default(0),
    balanceAfter: qty("balance_after").notNull().default(0),
    notes: text("notes"),
    transactionDate: ts("transaction_date").notNull().defaultNow(),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_part_idx").on(t.partId, t.transactionDate),
    index("stock_movements_wh_idx").on(t.warehouseId, t.transactionDate),
    index("stock_movements_ref_idx").on(t.referenceType, t.referenceId),
  ],
);

export const purchaseOrders = wms.table(
  "purchase_orders",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    poNumber: text("po_number").notNull(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    /** draft | ordered | partially_received | received | cancelled */
    status: text("status").notNull().default("draft"),
    total: money("total").notNull().default(0),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("purchase_orders_uq").on(t.companyId, t.poNumber)],
);

export const purchaseOrderItems = wms.table("purchase_order_items", {
  id: id(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  partId: uuid("part_id").notNull().references(() => parts.id),
  qtyOrdered: qty("qty_ordered").notNull(),
  qtyReceived: qty("qty_received").notNull().default(0),
  unitCost: money("unit_cost").notNull(),
  total: money("total").notNull(),
});

export const goodsReceipts = wms.table(
  "goods_receipts",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    receiptNumber: text("receipt_number").notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    receiptDate: ts("receipt_date").notNull().defaultNow(),
    supplierInvoiceNo: text("supplier_invoice_no"),
    total: money("total").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("posted"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("goods_receipts_uq").on(t.companyId, t.receiptNumber)],
);

export const goodsReceiptItems = wms.table("goods_receipt_items", {
  id: id(),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipts.id, { onDelete: "cascade" }),
  partId: uuid("part_id").notNull().references(() => parts.id),
  purchaseOrderItemId: uuid("purchase_order_item_id").references(() => purchaseOrderItems.id),
  qty: qty("qty").notNull(),
  unitCost: money("unit_cost").notNull(),
  total: money("total").notNull(),
});

export const stockAdjustments = wms.table(
  "stock_adjustments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    adjustmentNumber: text("adjustment_number").notNull(),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    /** opname | adjustment */
    adjustmentType: text("adjustment_type").notNull(),
    reason: text("reason").notNull(),
    adjustmentDate: ts("adjustment_date").notNull().defaultNow(),
    status: text("status").notNull().default("posted"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("stock_adjustments_uq").on(t.companyId, t.adjustmentNumber)],
);

export const stockAdjustmentItems = wms.table("stock_adjustment_items", {
  id: id(),
  adjustmentId: uuid("adjustment_id").notNull().references(() => stockAdjustments.id, { onDelete: "cascade" }),
  partId: uuid("part_id").notNull().references(() => parts.id),
  systemQty: qty("system_qty").notNull(),
  countedQty: qty("counted_qty").notNull(),
  differenceQty: qty("difference_qty").notNull(),
  unitCost: money("unit_cost").notNull().default(0),
});

export const stockTransfers = wms.table(
  "stock_transfers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    transferNumber: text("transfer_number").notNull(),
    fromWarehouseId: uuid("from_warehouse_id").notNull().references(() => warehouses.id),
    toWarehouseId: uuid("to_warehouse_id").notNull().references(() => warehouses.id),
    transferDate: ts("transfer_date").notNull().defaultNow(),
    notes: text("notes"),
    status: text("status").notNull().default("posted"),
    ...auditCols(),
  },
  (t) => [uniqueIndex("stock_transfers_uq").on(t.companyId, t.transferNumber)],
);

export const stockTransferItems = wms.table("stock_transfer_items", {
  id: id(),
  transferId: uuid("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  partId: uuid("part_id").notNull().references(() => parts.id),
  qty: qty("qty").notNull(),
  unitCost: money("unit_cost").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Front office: booking, check-in, inspeksi, estimate
// ---------------------------------------------------------------------------
export const bookings = wms.table(
  "bookings",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    bookingNumber: text("booking_number").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    bookingDate: date("booking_date").notNull(),
    bookingTime: text("booking_time").notNull(),
    complaint: text("complaint"),
    /** admin | phone | whatsapp | walk_in | online */
    source: text("source").notNull().default("admin"),
    /** scheduled | confirmed | arrived | cancelled | no_show */
    status: text("status").notNull().default("scheduled"),
    cancelReason: text("cancel_reason"),
    checkinId: uuid("checkin_id"),
    notes: text("notes"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("bookings_uq").on(t.companyId, t.bookingNumber),
    index("bookings_branch_date_idx").on(t.branchId, t.bookingDate),
  ],
);

export const vehicleCheckins = wms.table(
  "vehicle_checkins",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    checkinNumber: text("checkin_number").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    odometer: integer("odometer").notNull(),
    odometerOverrideReason: text("odometer_override_reason"),
    /** 0..100 (%) */
    fuelLevel: integer("fuel_level").notNull(),
    conditionNotes: text("condition_notes"),
    belongings: text("belongings"),
    complaint: text("complaint").notNull(),
    arrivalTime: ts("arrival_time").notNull().defaultNow(),
    checkinBy: uuid("checkin_by").references(() => users.id),
    /** open | in_progress | completed | cancelled */
    status: text("status").notNull().default("open"),
    cancelReason: text("cancel_reason"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("checkins_uq").on(t.companyId, t.checkinNumber),
    index("checkins_branch_idx").on(t.branchId, t.arrivalTime),
    index("checkins_vehicle_idx").on(t.vehicleId),
  ],
);

export const inspections = wms.table(
  "inspections",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    checkinId: uuid("checkin_id").notNull().references(() => vehicleCheckins.id),
    inspectorId: uuid("inspector_id").references(() => users.id),
    inspectionDate: ts("inspection_date").notNull().defaultNow(),
    /** good | attention | replace — ringkasan terburuk */
    result: text("result").notNull(),
    notes: text("notes"),
    ...auditCols(),
  },
  (t) => [index("inspections_checkin_idx").on(t.checkinId)],
);

export const inspectionItems = wms.table("inspection_items", {
  id: id(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  /** good | attention | replace | not_checked */
  result: text("result").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const estimates = wms.table(
  "estimates",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    estimateNumber: text("estimate_number").notNull(),
    checkinId: uuid("checkin_id").notNull().references(() => vehicleCheckins.id),
    /** Diisi bila estimate tambahan untuk WO berjalan (BR-006) */
    workOrderId: uuid("work_order_id"),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    tax: money("tax").notNull().default(0),
    grandTotal: money("grand_total").notNull().default(0),
    /** draft | sent | partially_approved | approved | rejected | expired | cancelled */
    status: text("status").notNull().default("draft"),
    validUntil: date("valid_until"),
    notes: text("notes"),
    sentAt: ts("sent_at"),
    decidedAt: ts("decided_at"),
    cancelReason: text("cancel_reason"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("estimates_uq").on(t.companyId, t.estimateNumber),
    index("estimates_checkin_idx").on(t.checkinId),
    index("estimates_wo_idx").on(t.workOrderId),
  ],
);

export const estimateItems = wms.table("estimate_items", {
  id: id(),
  estimateId: uuid("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  /** service | part | material */
  itemType: text("item_type").notNull(),
  serviceId: uuid("service_id").references(() => services.id),
  partId: uuid("part_id").references(() => parts.id),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  price: money("price").notNull(),
  discount: money("discount").notNull().default(0),
  total: money("total").notNull(),
  /** pending | approved | rejected */
  approvalStatus: text("approval_status").notNull().default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const estimateApprovals = wms.table("estimate_approvals", {
  id: id(),
  estimateId: uuid("estimate_id").notNull().references(() => estimates.id),
  /** approved | partially_approved | rejected */
  decision: text("decision").notNull(),
  customerName: text("customer_name").notNull(),
  /** in_person | phone | whatsapp | email */
  channel: text("channel").notNull(),
  evidenceNote: text("evidence_note"),
  attachmentId: uuid("attachment_id").references(() => attachments.id),
  approvedTotal: money("approved_total").notNull().default(0),
  approvedAt: ts("approved_at").notNull().defaultNow(),
  recordedBy: uuid("recorded_by").references(() => users.id),
});

// ---------------------------------------------------------------------------
// Workshop: work order, job, mekanik, part request, QC
// ---------------------------------------------------------------------------
export const workOrders = wms.table(
  "work_orders",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    woNumber: text("wo_number").notNull(),
    checkinId: uuid("checkin_id").notNull().references(() => vehicleCheckins.id),
    estimateId: uuid("estimate_id").references(() => estimates.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    complaint: text("complaint"),
    /** low | normal | high | urgent */
    priority: text("priority").notNull().default("normal"),
    /** waiting | assigned | in_progress | paused | waiting_parts | qc | rework | completed | cancelled */
    status: text("status").notNull().default("waiting"),
    bay: text("bay"),
    supervisorId: uuid("supervisor_id").references(() => users.id),
    serviceAdvisorId: uuid("service_advisor_id").references(() => users.id),
    odometer: integer("odometer"),
    estimatedFinishAt: ts("estimated_finish_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    cancelReason: text("cancel_reason"),
    handoverAt: ts("handover_at"),
    handoverBy: uuid("handover_by").references(() => users.id),
    handoverReceivedBy: text("handover_received_by"),
    handoverNotes: text("handover_notes"),
    handoverOverrideReason: text("handover_override_reason"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("work_orders_uq").on(t.companyId, t.woNumber),
    index("work_orders_branch_status_idx").on(t.branchId, t.status),
    index("work_orders_vehicle_idx").on(t.vehicleId),
    uniqueIndex("work_orders_estimate_uq").on(t.estimateId),
  ],
);

export const workOrderStatusHistory = wms.table(
  "work_order_status_history",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    changedBy: uuid("changed_by"),
    changedAt: ts("changed_at").notNull().defaultNow(),
  },
  (t) => [index("wo_status_history_idx").on(t.workOrderId)],
);

export const workOrderJobs = wms.table(
  "work_order_jobs",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    estimateItemId: uuid("estimate_item_id").references(() => estimateItems.id),
    serviceId: uuid("service_id").references(() => services.id),
    description: text("description").notNull(),
    standardHour: numeric("standard_hour", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    price: money("price").notNull().default(0),
    discount: money("discount").notNull().default(0),
    /** pending | in_progress | paused | completed | cancelled */
    status: text("status").notNull().default("pending"),
    actualMinutes: integer("actual_minutes").notNull().default(0),
    /** Awal segmen kerja yang sedang berjalan (untuk timer) */
    runningSince: ts("running_since"),
    reworkCount: integer("rework_count").notNull().default(0),
    notes: text("notes"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditCols(),
  },
  (t) => [index("wo_jobs_wo_idx").on(t.workOrderId)],
);

export const workOrderMechanics = wms.table(
  "work_order_mechanics",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    jobId: uuid("job_id").notNull().references(() => workOrderJobs.id),
    mechanicId: uuid("mechanic_id").notNull().references(() => users.id),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
    assignedBy: uuid("assigned_by"),
    startTime: ts("start_time"),
    finishTime: ts("finish_time"),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("wo_mechanics_mechanic_idx").on(t.mechanicId, t.isActive),
    index("wo_mechanics_job_idx").on(t.jobId),
  ],
);

export const jobTimeLogs = wms.table(
  "job_time_logs",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    jobId: uuid("job_id").notNull().references(() => workOrderJobs.id),
    mechanicId: uuid("mechanic_id").references(() => users.id),
    /** start | pause | resume | complete | rework */
    action: text("action").notNull(),
    note: text("note"),
    loggedAt: ts("logged_at").notNull().defaultNow(),
  },
  (t) => [index("job_time_logs_job_idx").on(t.jobId)],
);

export const partRequests = wms.table(
  "part_requests",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    requestNumber: text("request_number").notNull(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    mechanicId: uuid("mechanic_id").references(() => users.id),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    requestDate: ts("request_date").notNull().defaultNow(),
    /** requested | partially_issued | issued | cancelled */
    status: text("status").notNull().default("requested"),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("part_requests_uq").on(t.companyId, t.requestNumber),
    index("part_requests_wo_idx").on(t.workOrderId),
  ],
);

export const partRequestItems = wms.table("part_request_items", {
  id: id(),
  partRequestId: uuid("part_request_id").notNull().references(() => partRequests.id, { onDelete: "cascade" }),
  partId: uuid("part_id").notNull().references(() => parts.id),
  qtyRequested: qty("qty_requested").notNull(),
  qtyIssued: qty("qty_issued").notNull().default(0),
  qtyReturned: qty("qty_returned").notNull().default(0),
  /** Harga jual (dari estimate yang disetujui / master part) */
  unitPrice: money("unit_price").notNull().default(0),
  /** Average cost tertimbang saat issue (untuk margin) */
  unitCost: money("unit_cost").notNull().default(0),
  notes: text("notes"),
});

export const qualityControls = wms.table(
  "quality_controls",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
    qcUserId: uuid("qc_user_id").notNull().references(() => users.id),
    /** pass | fail | rework */
    result: text("result").notNull(),
    notes: text("notes"),
    checklist: jsonb("checklist").$type<{ item: string; ok: boolean }[]>(),
    reworkJobIds: jsonb("rework_job_ids").$type<string[]>(),
    qcDate: ts("qc_date").notNull().defaultNow(),
  },
  (t) => [index("qc_wo_idx").on(t.workOrderId)],
);

// ---------------------------------------------------------------------------
// Kasir: invoice & payment
// ---------------------------------------------------------------------------
export const invoices = wms.table(
  "invoices",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    invoiceNumber: text("invoice_number").notNull(),
    /** workshop | counter (penjualan part langsung) */
    invoiceType: text("invoice_type").notNull().default("workshop"),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    customerId: uuid("customer_id").references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id),
    invoiceDate: ts("invoice_date").notNull().defaultNow(),
    subtotal: money("subtotal").notNull().default(0),
    itemDiscount: money("item_discount").notNull().default(0),
    additionalDiscount: money("additional_discount").notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    tax: money("tax").notNull().default(0),
    grandTotal: money("grand_total").notNull().default(0),
    costTotal: money("cost_total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    /** unpaid | partial | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    /** issued | void */
    status: text("status").notNull().default("issued"),
    voidReason: text("void_reason"),
    voidedAt: ts("voided_at"),
    voidedBy: uuid("voided_by"),
    arAuthorizedBy: uuid("ar_authorized_by").references(() => users.id),
    arAuthorizedAt: ts("ar_authorized_at"),
    arDueDate: date("ar_due_date"),
    arNote: text("ar_note"),
    notes: text("notes"),
    ...auditCols(),
  },
  (t) => [
    uniqueIndex("invoices_uq").on(t.companyId, t.invoiceNumber),
    // 1 WO : 0..1 invoice aktif (ERD 3.3)
    uniqueIndex("invoices_active_wo_uq").on(t.workOrderId).where(sql`${t.status} <> 'void' and ${t.workOrderId} is not null`),
    index("invoices_branch_date_idx").on(t.branchId, t.invoiceDate),
    index("invoices_customer_idx").on(t.customerId),
  ],
);

export const invoiceItems = wms.table("invoice_items", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  /** service | part | material */
  itemType: text("item_type").notNull(),
  itemId: uuid("item_id"),
  referenceId: uuid("reference_id"),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  price: money("price").notNull(),
  discount: money("discount").notNull().default(0),
  total: money("total").notNull(),
  unitCost: money("unit_cost").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const payments = wms.table(
  "payments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    paymentNumber: text("payment_number").notNull(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    paymentMethodId: uuid("payment_method_id").notNull().references(() => paymentMethods.id),
    /** payment | refund */
    type: text("type").notNull().default("payment"),
    amount: money("amount").notNull(),
    tenderedAmount: money("tendered_amount"),
    changeAmount: money("change_amount"),
    paymentDate: ts("payment_date").notNull().defaultNow(),
    referenceNumber: text("reference_number"),
    /** posted | void */
    status: text("status").notNull().default("posted"),
    voidReason: text("void_reason"),
    voidedAt: ts("voided_at"),
    voidedBy: uuid("voided_by"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    receivedBy: uuid("received_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_uq").on(t.companyId, t.paymentNumber),
    uniqueIndex("payments_idempotency_uq").on(t.companyId, t.idempotencyKey),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_branch_date_idx").on(t.branchId, t.paymentDate),
    check("payments_amount_positive", sql`${t.amount} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export const serviceReminders = wms.table(
  "service_reminders",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    branchId: uuid("branch_id").references(() => branches.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    serviceId: uuid("service_id").references(() => services.id),
    /** periodic | service | part | custom */
    reminderType: text("reminder_type").notNull(),
    description: text("description").notNull(),
    dueDate: date("due_date"),
    dueOdometer: integer("due_odometer"),
    /** pending | contacted | booked | done | cancelled */
    status: text("status").notNull().default("pending"),
    followUpNotes: text("follow_up_notes"),
    lastContactedAt: ts("last_contacted_at"),
    contactedBy: uuid("contacted_by"),
    bookingId: uuid("booking_id"),
    ...auditCols(),
  },
  (t) => [
    index("reminders_due_idx").on(t.companyId, t.status, t.dueDate),
    index("reminders_vehicle_idx").on(t.vehicleId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (untuk relational query)
// ---------------------------------------------------------------------------
export const companiesRelations = relations(companies, ({ many }) => ({
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  company: one(companies, { fields: [branches.companyId], references: [companies.id] }),
  warehouses: many(warehouses),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(users),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  vehicles: many(vehicles),
}));

export const vehicleBrandsRelations = relations(vehicleBrands, ({ many }) => ({
  models: many(vehicleModels),
}));

export const vehicleModelsRelations = relations(vehicleModels, ({ one }) => ({
  brand: one(vehicleBrands, { fields: [vehicleModels.brandId], references: [vehicleBrands.id] }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  customer: one(customers, { fields: [vehicles.customerId], references: [customers.id] }),
  brand: one(vehicleBrands, { fields: [vehicles.brandId], references: [vehicleBrands.id] }),
  model: one(vehicleModels, { fields: [vehicles.modelId], references: [vehicleModels.id] }),
  ownerships: many(vehicleOwnerships),
}));

export const vehicleOwnershipsRelations = relations(vehicleOwnerships, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehicleOwnerships.vehicleId], references: [vehicles.id] }),
  customer: one(customers, { fields: [vehicleOwnerships.customerId], references: [customers.id] }),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  category: one(partCategories, { fields: [parts.categoryId], references: [partCategories.id] }),
}));

export const warehousesRelations = relations(warehouses, ({ one }) => ({
  branch: one(branches, { fields: [warehouses.branchId], references: [branches.id] }),
}));

export const inspectionTemplatesRelations = relations(inspectionTemplates, ({ many }) => ({
  items: many(inspectionTemplateItems),
}));

export const inspectionTemplateItemsRelations = relations(inspectionTemplateItems, ({ one }) => ({
  template: one(inspectionTemplates, { fields: [inspectionTemplateItems.templateId], references: [inspectionTemplates.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  customer: one(customers, { fields: [bookings.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [bookings.vehicleId], references: [vehicles.id] }),
  branch: one(branches, { fields: [bookings.branchId], references: [branches.id] }),
}));

export const vehicleCheckinsRelations = relations(vehicleCheckins, ({ one, many }) => ({
  customer: one(customers, { fields: [vehicleCheckins.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [vehicleCheckins.vehicleId], references: [vehicles.id] }),
  branch: one(branches, { fields: [vehicleCheckins.branchId], references: [branches.id] }),
  booking: one(bookings, { fields: [vehicleCheckins.bookingId], references: [bookings.id] }),
  checkinUser: one(users, { fields: [vehicleCheckins.checkinBy], references: [users.id] }),
  inspections: many(inspections),
  estimates: many(estimates),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  checkin: one(vehicleCheckins, { fields: [inspections.checkinId], references: [vehicleCheckins.id] }),
  inspector: one(users, { fields: [inspections.inspectorId], references: [users.id] }),
  items: many(inspectionItems),
}));

export const inspectionItemsRelations = relations(inspectionItems, ({ one }) => ({
  inspection: one(inspections, { fields: [inspectionItems.inspectionId], references: [inspections.id] }),
}));

export const estimatesRelations = relations(estimates, ({ one, many }) => ({
  checkin: one(vehicleCheckins, { fields: [estimates.checkinId], references: [vehicleCheckins.id] }),
  customer: one(customers, { fields: [estimates.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [estimates.vehicleId], references: [vehicles.id] }),
  workOrder: one(workOrders, { fields: [estimates.workOrderId], references: [workOrders.id] }),
  items: many(estimateItems),
  approvals: many(estimateApprovals),
}));

export const estimateItemsRelations = relations(estimateItems, ({ one }) => ({
  estimate: one(estimates, { fields: [estimateItems.estimateId], references: [estimates.id] }),
  service: one(services, { fields: [estimateItems.serviceId], references: [services.id] }),
  part: one(parts, { fields: [estimateItems.partId], references: [parts.id] }),
}));

export const estimateApprovalsRelations = relations(estimateApprovals, ({ one }) => ({
  estimate: one(estimates, { fields: [estimateApprovals.estimateId], references: [estimates.id] }),
  recorder: one(users, { fields: [estimateApprovals.recordedBy], references: [users.id] }),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  checkin: one(vehicleCheckins, { fields: [workOrders.checkinId], references: [vehicleCheckins.id] }),
  estimate: one(estimates, { fields: [workOrders.estimateId], references: [estimates.id] }),
  customer: one(customers, { fields: [workOrders.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [workOrders.vehicleId], references: [vehicles.id] }),
  branch: one(branches, { fields: [workOrders.branchId], references: [branches.id] }),
  supervisor: one(users, { fields: [workOrders.supervisorId], references: [users.id], relationName: "wo_supervisor" }),
  serviceAdvisor: one(users, { fields: [workOrders.serviceAdvisorId], references: [users.id], relationName: "wo_sa" }),
  jobs: many(workOrderJobs),
  mechanics: many(workOrderMechanics),
  partRequests: many(partRequests),
  qualityControls: many(qualityControls),
  statusHistory: many(workOrderStatusHistory),
}));

export const workOrderStatusHistoryRelations = relations(workOrderStatusHistory, ({ one }) => ({
  workOrder: one(workOrders, { fields: [workOrderStatusHistory.workOrderId], references: [workOrders.id] }),
}));

export const workOrderJobsRelations = relations(workOrderJobs, ({ one, many }) => ({
  workOrder: one(workOrders, { fields: [workOrderJobs.workOrderId], references: [workOrders.id] }),
  service: one(services, { fields: [workOrderJobs.serviceId], references: [services.id] }),
  mechanics: many(workOrderMechanics),
}));

export const workOrderMechanicsRelations = relations(workOrderMechanics, ({ one }) => ({
  workOrder: one(workOrders, { fields: [workOrderMechanics.workOrderId], references: [workOrders.id] }),
  job: one(workOrderJobs, { fields: [workOrderMechanics.jobId], references: [workOrderJobs.id] }),
  mechanic: one(users, { fields: [workOrderMechanics.mechanicId], references: [users.id] }),
}));

export const partRequestsRelations = relations(partRequests, ({ one, many }) => ({
  workOrder: one(workOrders, { fields: [partRequests.workOrderId], references: [workOrders.id] }),
  mechanic: one(users, { fields: [partRequests.mechanicId], references: [users.id] }),
  warehouse: one(warehouses, { fields: [partRequests.warehouseId], references: [warehouses.id] }),
  items: many(partRequestItems),
}));

export const partRequestItemsRelations = relations(partRequestItems, ({ one }) => ({
  partRequest: one(partRequests, { fields: [partRequestItems.partRequestId], references: [partRequests.id] }),
  part: one(parts, { fields: [partRequestItems.partId], references: [parts.id] }),
}));

export const qualityControlsRelations = relations(qualityControls, ({ one }) => ({
  workOrder: one(workOrders, { fields: [qualityControls.workOrderId], references: [workOrders.id] }),
  qcUser: one(users, { fields: [qualityControls.qcUserId], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  workOrder: one(workOrders, { fields: [invoices.workOrderId], references: [workOrders.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [invoices.vehicleId], references: [vehicles.id] }),
  branch: one(branches, { fields: [invoices.branchId], references: [branches.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  method: one(paymentMethods, { fields: [payments.paymentMethodId], references: [paymentMethods.id] }),
  receiver: one(users, { fields: [payments.receivedBy], references: [users.id] }),
}));

export const serviceRemindersRelations = relations(serviceReminders, ({ one }) => ({
  customer: one(customers, { fields: [serviceReminders.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [serviceReminders.vehicleId], references: [vehicles.id] }),
  service: one(services, { fields: [serviceReminders.serviceId], references: [services.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  warehouse: one(warehouses, { fields: [purchaseOrders.warehouseId], references: [warehouses.id] }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
  part: one(parts, { fields: [purchaseOrderItems.partId], references: [parts.id] }),
}));

export const goodsReceiptsRelations = relations(goodsReceipts, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [goodsReceipts.supplierId], references: [suppliers.id] }),
  warehouse: one(warehouses, { fields: [goodsReceipts.warehouseId], references: [warehouses.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [goodsReceipts.purchaseOrderId], references: [purchaseOrders.id] }),
  items: many(goodsReceiptItems),
}));

export const goodsReceiptItemsRelations = relations(goodsReceiptItems, ({ one }) => ({
  goodsReceipt: one(goodsReceipts, { fields: [goodsReceiptItems.goodsReceiptId], references: [goodsReceipts.id] }),
  part: one(parts, { fields: [goodsReceiptItems.partId], references: [parts.id] }),
}));

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [stockAdjustments.warehouseId], references: [warehouses.id] }),
  items: many(stockAdjustmentItems),
}));

export const stockAdjustmentItemsRelations = relations(stockAdjustmentItems, ({ one }) => ({
  adjustment: one(stockAdjustments, { fields: [stockAdjustmentItems.adjustmentId], references: [stockAdjustments.id] }),
  part: one(parts, { fields: [stockAdjustmentItems.partId], references: [parts.id] }),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
  fromWarehouse: one(warehouses, { fields: [stockTransfers.fromWarehouseId], references: [warehouses.id], relationName: "transfer_from" }),
  toWarehouse: one(warehouses, { fields: [stockTransfers.toWarehouseId], references: [warehouses.id], relationName: "transfer_to" }),
  items: many(stockTransferItems),
}));

export const stockTransferItemsRelations = relations(stockTransferItems, ({ one }) => ({
  transfer: one(stockTransfers, { fields: [stockTransferItems.transferId], references: [stockTransfers.id] }),
  part: one(parts, { fields: [stockTransferItems.partId], references: [parts.id] }),
}));
