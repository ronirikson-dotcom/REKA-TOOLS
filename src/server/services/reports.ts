import { sql } from "drizzle-orm";
import { requirePermission, type AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import type { Permission } from "@/lib/permissions";
import { addDaysISO, jakartaDayEnd, jakartaDayStart, startOfMonthISO, todayISO } from "@/lib/utils";
import { branchList, mechanicKpi, rawRows } from "./dashboard";

export type ColumnType = "text" | "money" | "number" | "date" | "datetime" | "percent" | "hours";
export type ReportColumn = { key: string; label: string; type?: ColumnType };
export type ReportFilters = { from: string; to: string; branchId?: string | null; q?: string | null };
/** from/to: ISO timestamp (awal & akhir hari WIB); fromISO/toISO: YYYY-MM-DD */
type Ctx = { b: string[]; from: string; to: string; fromISO: string; toISO: string; q: string | null; companyId: string };

type ReportDef = {
  key: string;
  group: "Operasional" | "Sales" | "Inventory" | "Customer" | "Finance";
  title: string;
  description: string;
  permission: Permission;
  columns: ReportColumn[];
  /** Filter teks bebas (customer / kendaraan / mekanik) */
  search?: string;
  run: (c: Ctx) => Promise<Record<string, unknown>[]>;
};

const like = (q: string | null) => (q ? `%${q}%` : "%");

const REPORTS: ReportDef[] = [
  // ------------------------------------------------------------------ Operasional
  {
    key: "vehicle-checkin",
    group: "Operasional",
    title: "Vehicle Check-In",
    description: "Kendaraan masuk per periode",
    permission: "report.operational.view",
    search: "Customer / nomor polisi",
    columns: [
      { key: "arrival_time", label: "Waktu Masuk", type: "datetime" },
      { key: "checkin_number", label: "No. Check-In" },
      { key: "branch", label: "Cabang" },
      { key: "plate_number", label: "No. Polisi" },
      { key: "customer", label: "Customer" },
      { key: "odometer", label: "Odometer", type: "number" },
      { key: "complaint", label: "Keluhan" },
      { key: "status", label: "Status" },
      { key: "wo_number", label: "No. WO" },
    ],
    run: (c) =>
      rawRows(sql`
        select c.arrival_time, c.checkin_number, b.name as branch, v.plate_number, cu.name as customer, c.odometer, c.complaint, c.status, w.wo_number
        from wms.vehicle_checkins c join wms.branches b on b.id = c.branch_id join wms.vehicles v on v.id = c.vehicle_id join wms.customers cu on cu.id = c.customer_id
        left join wms.work_orders w on w.checkin_id = c.id
        where c.branch_id in ${c.b} and c.arrival_time between ${c.from} and ${c.to} and (cu.name ilike ${like(c.q)} or v.plate_number ilike ${like(c.q)})
        order by c.arrival_time desc`),
  },
  {
    key: "open-wo",
    group: "Operasional",
    title: "Open Work Order",
    description: "WO yang belum selesai beserta aging",
    permission: "report.operational.view",
    search: "Customer / nomor polisi",
    columns: [
      { key: "wo_number", label: "No. WO" },
      { key: "created_at", label: "Dibuat", type: "datetime" },
      { key: "branch", label: "Cabang" },
      { key: "plate_number", label: "No. Polisi" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Prioritas" },
      { key: "mechanics", label: "Mekanik" },
      { key: "aging_hours", label: "Aging (jam)", type: "hours" },
    ],
    run: (c) =>
      rawRows(sql`
        select w.wo_number, w.created_at, b.name as branch, v.plate_number, cu.name as customer, w.status, w.priority,
          (select string_agg(distinct u.name, ', ') from wms.work_order_mechanics m join wms.users u on u.id = m.mechanic_id where m.work_order_id = w.id and m.is_active) as mechanics,
          (extract(epoch from (now() - ch.arrival_time)) / 3600)::float8 as aging_hours
        from wms.work_orders w join wms.branches b on b.id = w.branch_id join wms.vehicles v on v.id = w.vehicle_id join wms.customers cu on cu.id = w.customer_id
        join wms.vehicle_checkins ch on ch.id = w.checkin_id
        where w.branch_id in ${c.b} and w.status not in ('completed','cancelled') and (cu.name ilike ${like(c.q)} or v.plate_number ilike ${like(c.q)})
        order by aging_hours desc`),
  },
  {
    key: "completed-wo",
    group: "Operasional",
    title: "Completed Work Order",
    description: "WO selesai dengan cycle time",
    permission: "report.operational.view",
    search: "Customer / nomor polisi",
    columns: [
      { key: "wo_number", label: "No. WO" },
      { key: "branch", label: "Cabang" },
      { key: "plate_number", label: "No. Polisi" },
      { key: "customer", label: "Customer" },
      { key: "arrival_time", label: "Masuk", type: "datetime" },
      { key: "completed_at", label: "Selesai QC", type: "datetime" },
      { key: "handover_at", label: "Diserahkan", type: "datetime" },
      { key: "cycle_hours", label: "Cycle Time (jam)", type: "hours" },
      { key: "jobs", label: "Jumlah Job", type: "number" },
    ],
    run: (c) =>
      rawRows(sql`
        select w.wo_number, b.name as branch, v.plate_number, cu.name as customer, ch.arrival_time, w.completed_at, w.handover_at,
          (extract(epoch from (coalesce(w.handover_at, w.completed_at) - ch.arrival_time)) / 3600)::float8 as cycle_hours,
          (select count(*)::int from wms.work_order_jobs j where j.work_order_id = w.id and j.status = 'completed') as jobs
        from wms.work_orders w join wms.branches b on b.id = w.branch_id join wms.vehicles v on v.id = w.vehicle_id join wms.customers cu on cu.id = w.customer_id
        join wms.vehicle_checkins ch on ch.id = w.checkin_id
        where w.branch_id in ${c.b} and w.status = 'completed' and w.completed_at between ${c.from} and ${c.to}
          and (cu.name ilike ${like(c.q)} or v.plate_number ilike ${like(c.q)})
        order by w.completed_at desc`),
  },
  {
    key: "workshop-aging",
    group: "Operasional",
    title: "Workshop Aging",
    description: "Distribusi umur WO terbuka per status",
    permission: "report.operational.view",
    columns: [
      { key: "status", label: "Status" },
      { key: "total", label: "Jumlah WO", type: "number" },
      { key: "lt4h", label: "< 4 jam", type: "number" },
      { key: "h4_24", label: "4-24 jam", type: "number" },
      { key: "d1_3", label: "1-3 hari", type: "number" },
      { key: "gt3d", label: "> 3 hari", type: "number" },
      { key: "avg_hours", label: "Rata-rata (jam)", type: "hours" },
    ],
    run: (c) =>
      rawRows(sql`
        with a as (
          select w.status, extract(epoch from (now() - ch.arrival_time)) / 3600 as h
          from wms.work_orders w join wms.vehicle_checkins ch on ch.id = w.checkin_id
          where w.branch_id in ${c.b} and w.status not in ('completed','cancelled')
        )
        select status, count(*)::int as total,
          count(*) filter (where h < 4)::int as lt4h,
          count(*) filter (where h >= 4 and h < 24)::int as h4_24,
          count(*) filter (where h >= 24 and h < 72)::int as d1_3,
          count(*) filter (where h >= 72)::int as gt3d,
          avg(h)::float8 as avg_hours
        from a group by status order by total desc`),
  },
  {
    key: "mechanic-performance",
    group: "Operasional",
    title: "Mechanic Performance",
    description: "Jumlah job, productive hours, standard hours, efficiency & rework",
    permission: "report.operational.view",
    columns: [
      { key: "mechanic", label: "Mekanik" },
      { key: "jobs", label: "Job Selesai", type: "number" },
      { key: "standard_hours", label: "Standard Hours", type: "hours" },
      { key: "actual_hours", label: "Actual Hours", type: "hours" },
      { key: "efficiency", label: "Efficiency", type: "percent" },
      { key: "rework_jobs", label: "Job Rework", type: "number" },
      { key: "rework_rate", label: "Rework Rate", type: "percent" },
    ],
    run: async (c) => {
      const rows = await mechanicKpi(c.b, c.from, c.to);
      return c.q ? rows.filter((r) => r.mechanic.toLowerCase().includes(c.q!.toLowerCase())) : rows;
    },
    search: "Nama mekanik",
  },
  {
    key: "sa-performance",
    group: "Operasional",
    title: "Service Advisor Performance",
    description: "WO, invoice dan omzet per Service Advisor",
    permission: "report.operational.view",
    columns: [
      { key: "advisor", label: "Service Advisor" },
      { key: "work_orders", label: "Jumlah WO", type: "number" },
      { key: "invoices", label: "Invoice", type: "number" },
      { key: "revenue", label: "Omzet", type: "money" },
      { key: "avg_invoice", label: "Rata-rata Invoice", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select u.name as advisor, count(distinct w.id)::int as work_orders, count(distinct i.id)::int as invoices,
          coalesce(sum(i.grand_total),0)::float8 as revenue, coalesce(avg(i.grand_total),0)::float8 as avg_invoice
        from wms.work_orders w join wms.users u on u.id = w.service_advisor_id
        left join wms.invoices i on i.work_order_id = w.id and i.status = 'issued'
        where w.branch_id in ${c.b} and w.created_at between ${c.from} and ${c.to}
        group by u.name order by revenue desc`),
  },
  // ------------------------------------------------------------------ Sales
  {
    key: "sales-daily",
    group: "Sales",
    title: "Daily Sales",
    description: "Penjualan harian",
    permission: "report.sales.view",
    columns: [
      { key: "day", label: "Tanggal", type: "date" },
      { key: "invoices", label: "Invoice", type: "number" },
      { key: "subtotal", label: "Subtotal", type: "money" },
      { key: "discount", label: "Diskon", type: "money" },
      { key: "tax", label: "Pajak", type: "money" },
      { key: "grand_total", label: "Total", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select (i.invoice_date at time zone 'Asia/Jakarta')::date::text as day, count(*)::int as invoices,
          sum(i.subtotal)::float8 as subtotal, sum(i.item_discount + i.additional_discount)::float8 as discount,
          sum(i.tax)::float8 as tax, sum(i.grand_total)::float8 as grand_total
        from wms.invoices i where i.branch_id in ${c.b} and i.status = 'issued' and i.invoice_date between ${c.from} and ${c.to}
        group by 1 order by 1`),
  },
  {
    key: "sales-monthly",
    group: "Sales",
    title: "Monthly Sales",
    description: "Penjualan bulanan & Average Transaction Value",
    permission: "report.sales.view",
    columns: [
      { key: "month", label: "Bulan" },
      { key: "invoices", label: "Invoice", type: "number" },
      { key: "grand_total", label: "Total", type: "money" },
      { key: "atv", label: "Avg Transaction Value", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select to_char(i.invoice_date at time zone 'Asia/Jakarta', 'YYYY-MM') as month, count(*)::int as invoices,
          sum(i.grand_total)::float8 as grand_total, avg(i.grand_total)::float8 as atv
        from wms.invoices i where i.branch_id in ${c.b} and i.status = 'issued' and i.invoice_date between ${c.from} and ${c.to}
        group by 1 order by 1`),
  },
  {
    key: "sales-by-branch",
    group: "Sales",
    title: "Sales by Branch",
    description: "Omzet, margin dan ATV per cabang",
    permission: "report.sales.view",
    columns: [
      { key: "branch", label: "Cabang" },
      { key: "invoices", label: "Invoice", type: "number" },
      { key: "revenue", label: "Omzet", type: "money" },
      { key: "atv", label: "ATV", type: "money" },
      { key: "gross_profit", label: "Gross Profit", type: "money" },
      { key: "margin", label: "Margin", type: "percent" },
    ],
    run: (c) =>
      rawRows(sql`
        select b.name as branch, count(i.id)::int as invoices, coalesce(sum(i.grand_total),0)::float8 as revenue, coalesce(avg(i.grand_total),0)::float8 as atv,
          coalesce(sum(i.subtotal - i.item_discount - i.additional_discount - i.cost_total),0)::float8 as gross_profit,
          case when sum(i.subtotal - i.item_discount - i.additional_discount) > 0 then
            (sum(i.subtotal - i.item_discount - i.additional_discount - i.cost_total) / sum(i.subtotal - i.item_discount - i.additional_discount) * 100)::float8 end as margin
        from wms.branches b left join wms.invoices i on i.branch_id = b.id and i.status = 'issued' and i.invoice_date between ${c.from} and ${c.to}
        where b.id in ${c.b} group by b.name order by revenue desc`),
  },
  {
    key: "sales-by-service",
    group: "Sales",
    title: "Sales by Service",
    description: "Penjualan jasa",
    permission: "report.sales.view",
    columns: [
      { key: "description", label: "Jasa" },
      { key: "qty", label: "Jumlah", type: "number" },
      { key: "revenue", label: "Nilai (setelah diskon)", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select ii.description, sum(ii.qty)::float8 as qty, sum(ii.total)::float8 as revenue
        from wms.invoice_items ii join wms.invoices i on i.id = ii.invoice_id
        where i.branch_id in ${c.b} and i.status='issued' and ii.item_type = 'service' and i.invoice_date between ${c.from} and ${c.to}
        group by ii.description order by revenue desc`),
  },
  {
    key: "sales-by-part",
    group: "Sales",
    title: "Sales by Parts",
    description: "Penjualan spare part & material dengan margin",
    permission: "report.sales.view",
    columns: [
      { key: "description", label: "Part" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "revenue", label: "Penjualan", type: "money" },
      { key: "cost", label: "HPP", type: "money" },
      { key: "margin", label: "Margin", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select ii.description, sum(ii.qty)::float8 as qty, sum(ii.total)::float8 as revenue, sum(ii.qty * ii.unit_cost)::float8 as cost,
          sum(ii.total - ii.qty * ii.unit_cost)::float8 as margin
        from wms.invoice_items ii join wms.invoices i on i.id = ii.invoice_id
        where i.branch_id in ${c.b} and i.status='issued' and ii.item_type <> 'service' and i.invoice_date between ${c.from} and ${c.to}
        group by ii.description order by revenue desc`),
  },
  {
    key: "sales-by-customer",
    group: "Sales",
    title: "Sales by Customer",
    description: "Omzet per customer",
    permission: "report.sales.view",
    search: "Nama customer",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "customer_type", label: "Tipe" },
      { key: "invoices", label: "Invoice", type: "number" },
      { key: "revenue", label: "Omzet", type: "money" },
      { key: "atv", label: "ATV", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select coalesce(cu.name, 'Walk-in (tanpa customer)') as customer, cu.customer_type, count(*)::int as invoices,
          sum(i.grand_total)::float8 as revenue, avg(i.grand_total)::float8 as atv
        from wms.invoices i left join wms.customers cu on cu.id = i.customer_id
        where i.branch_id in ${c.b} and i.status='issued' and i.invoice_date between ${c.from} and ${c.to}
          and coalesce(cu.name,'') ilike ${like(c.q)}
        group by cu.name, cu.customer_type order by revenue desc`),
  },
  // ------------------------------------------------------------------ Inventory
  {
    key: "stock-balance",
    group: "Inventory",
    title: "Stock Balance",
    description: "Saldo stok per gudang",
    permission: "report.inventory.view",
    search: "Nama part / SKU",
    columns: [
      { key: "warehouse", label: "Gudang" },
      { key: "sku", label: "SKU" },
      { key: "part_name", label: "Part" },
      { key: "quantity", label: "Qty", type: "number" },
      { key: "minimum_stock", label: "Min", type: "number" },
      { key: "average_cost", label: "Avg Cost", type: "money" },
      { key: "value", label: "Nilai", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select w.name as warehouse, p.sku, p.part_name, i.quantity::float8, p.minimum_stock::float8, i.average_cost::float8, (i.quantity * i.average_cost)::float8 as value
        from wms.inventory i join wms.warehouses w on w.id = i.warehouse_id join wms.parts p on p.id = i.part_id
        where w.branch_id in ${c.b} and (p.part_name ilike ${like(c.q)} or p.sku ilike ${like(c.q)})
        order by w.name, p.part_name`),
  },
  {
    key: "stock-movement",
    group: "Inventory",
    title: "Stock Movement",
    description: "Mutasi persediaan beserta referensi transaksi",
    permission: "report.inventory.view",
    search: "Nama part / SKU / referensi",
    columns: [
      { key: "transaction_date", label: "Tanggal", type: "datetime" },
      { key: "warehouse", label: "Gudang" },
      { key: "sku", label: "SKU" },
      { key: "part_name", label: "Part" },
      { key: "transaction_type", label: "Tipe" },
      { key: "reference_number", label: "Referensi" },
      { key: "quantity_in", label: "Masuk", type: "number" },
      { key: "quantity_out", label: "Keluar", type: "number" },
      { key: "balance_after", label: "Saldo", type: "number" },
    ],
    run: (c) =>
      rawRows(sql`
        select m.transaction_date, w.name as warehouse, p.sku, p.part_name, m.transaction_type, m.reference_number,
          m.quantity_in::float8, m.quantity_out::float8, m.balance_after::float8
        from wms.stock_movements m join wms.warehouses w on w.id = m.warehouse_id join wms.parts p on p.id = m.part_id
        where m.branch_id in ${c.b} and m.transaction_date between ${c.from} and ${c.to}
          and (p.part_name ilike ${like(c.q)} or p.sku ilike ${like(c.q)} or coalesce(m.reference_number,'') ilike ${like(c.q)})
        order by m.transaction_date desc`),
  },
  {
    key: "low-stock",
    group: "Inventory",
    title: "Low Stock",
    description: "Part dengan stok ≤ minimum",
    permission: "report.inventory.view",
    columns: [
      { key: "sku", label: "SKU" },
      { key: "part_name", label: "Part" },
      { key: "quantity", label: "Stok", type: "number" },
      { key: "minimum_stock", label: "Minimum", type: "number" },
      { key: "shortage", label: "Kekurangan", type: "number" },
    ],
    run: (c) =>
      rawRows(sql`
        select p.sku, p.part_name, coalesce(s.qty,0)::float8 as quantity, p.minimum_stock::float8, (p.minimum_stock - coalesce(s.qty,0))::float8 as shortage
        from wms.parts p left join (select i.part_id, sum(i.quantity) as qty from wms.inventory i join wms.warehouses w on w.id = i.warehouse_id where w.branch_id in ${c.b} group by i.part_id) s on s.part_id = p.id
        where p.company_id = ${c.companyId} and p.status = 'active' and p.deleted_at is null and coalesce(s.qty,0) <= p.minimum_stock
        order by shortage desc`),
  },
  {
    key: "moving-analysis",
    group: "Inventory",
    title: "Fast / Slow / Dead Moving",
    description: "Klasifikasi perputaran part berdasarkan qty keluar dalam periode",
    permission: "report.inventory.view",
    columns: [
      { key: "sku", label: "SKU" },
      { key: "part_name", label: "Part" },
      { key: "qty_out", label: "Qty Keluar", type: "number" },
      { key: "stock", label: "Stok", type: "number" },
      { key: "stock_value", label: "Nilai Stok", type: "money" },
      { key: "classification", label: "Klasifikasi" },
    ],
    run: (c) =>
      rawRows(sql`
        with outq as (
          select m.part_id, sum(m.quantity_out) filter (where m.transaction_type in ('issue','sale')) as qty_out
          from wms.stock_movements m where m.branch_id in ${c.b} and m.transaction_date between ${c.from} and ${c.to} group by m.part_id
        ), st as (
          select i.part_id, sum(i.quantity) as qty, sum(i.quantity * i.average_cost) as value
          from wms.inventory i join wms.warehouses w on w.id = i.warehouse_id where w.branch_id in ${c.b} group by i.part_id
        ), ranked as (
          select p.sku, p.part_name, coalesce(o.qty_out,0) as qty_out, coalesce(s.qty,0) as stock, coalesce(s.value,0) as stock_value,
            percent_rank() over (order by coalesce(o.qty_out,0) desc) as pr
          from wms.parts p left join outq o on o.part_id = p.id left join st s on s.part_id = p.id
          where p.company_id = ${c.companyId} and p.deleted_at is null
        )
        select sku, part_name, qty_out::float8, stock::float8, stock_value::float8,
          case when qty_out = 0 then 'Dead Stock' when pr <= 0.2 then 'Fast Moving' when pr <= 0.7 then 'Medium' else 'Slow Moving' end as classification
        from ranked order by qty_out desc`),
  },
  {
    key: "stock-valuation",
    group: "Inventory",
    title: "Stock Valuation",
    description: "Nilai persediaan (moving average) per gudang & kategori",
    permission: "report.inventory.view",
    columns: [
      { key: "warehouse", label: "Gudang" },
      { key: "category", label: "Kategori" },
      { key: "items", label: "Item", type: "number" },
      { key: "quantity", label: "Qty", type: "number" },
      { key: "value", label: "Nilai", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select w.name as warehouse, coalesce(pc.name, 'Tanpa kategori') as category, count(*)::int as items,
          sum(i.quantity)::float8 as quantity, sum(i.quantity * i.average_cost)::float8 as value
        from wms.inventory i join wms.warehouses w on w.id = i.warehouse_id join wms.parts p on p.id = i.part_id left join wms.part_categories pc on pc.id = p.category_id
        where w.branch_id in ${c.b} and i.quantity > 0
        group by w.name, pc.name order by w.name, value desc`),
  },
  // ------------------------------------------------------------------ Customer
  {
    key: "customer-history",
    group: "Customer",
    title: "Customer History",
    description: "Kunjungan & nilai transaksi per customer",
    permission: "report.customer.view",
    search: "Nama customer",
    columns: [
      { key: "customer_code", label: "Kode" },
      { key: "customer", label: "Customer" },
      { key: "phone", label: "HP" },
      { key: "visits", label: "Kunjungan", type: "number" },
      { key: "last_visit", label: "Terakhir", type: "datetime" },
      { key: "total_spend", label: "Total Transaksi", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select cu.customer_code, cu.name as customer, cu.phone,
          (select count(*)::int from wms.vehicle_checkins ch where ch.customer_id = cu.id and ch.branch_id in ${c.b} and ch.arrival_time between ${c.from} and ${c.to}) as visits,
          (select max(ch.arrival_time) from wms.vehicle_checkins ch where ch.customer_id = cu.id and ch.branch_id in ${c.b}) as last_visit,
          coalesce((select sum(i.grand_total) from wms.invoices i where i.customer_id = cu.id and i.status='issued' and i.branch_id in ${c.b} and i.invoice_date between ${c.from} and ${c.to}),0)::float8 as total_spend
        from wms.customers cu where cu.company_id = ${c.companyId} and cu.deleted_at is null and cu.name ilike ${like(c.q)}
        order by total_spend desc, cu.name`),
  },
  {
    key: "vehicle-history",
    group: "Customer",
    title: "Vehicle History",
    description: "Riwayat kunjungan per kendaraan",
    permission: "report.customer.view",
    search: "Nomor polisi",
    columns: [
      { key: "plate_number", label: "No. Polisi" },
      { key: "vehicle", label: "Kendaraan" },
      { key: "customer", label: "Pemilik" },
      { key: "visits", label: "Kunjungan", type: "number" },
      { key: "last_visit", label: "Terakhir", type: "datetime" },
      { key: "last_odometer", label: "Odometer", type: "number" },
      { key: "total_spend", label: "Total", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select v.plate_number, concat_ws(' ', vb.name, vm.name, v.year) as vehicle, cu.name as customer,
          count(ch.id)::int as visits, max(ch.arrival_time) as last_visit, v.last_odometer,
          coalesce((select sum(i.grand_total) from wms.invoices i where i.vehicle_id = v.id and i.status='issued' and i.branch_id in ${c.b}),0)::float8 as total_spend
        from wms.vehicles v join wms.customers cu on cu.id = v.customer_id left join wms.vehicle_brands vb on vb.id = v.brand_id left join wms.vehicle_models vm on vm.id = v.model_id
        join wms.vehicle_checkins ch on ch.vehicle_id = v.id and ch.branch_id in ${c.b} and ch.arrival_time between ${c.from} and ${c.to}
        where v.company_id = ${c.companyId} and v.plate_number ilike ${like(c.q)}
        group by v.id, v.plate_number, vb.name, vm.name, v.year, cu.name, v.last_odometer order by last_visit desc`),
  },
  {
    key: "repeat-customer",
    group: "Customer",
    title: "Repeat Customer",
    description: "Customer dengan ≥ 2 kunjungan dalam periode",
    permission: "report.customer.view",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "phone", label: "HP" },
      { key: "visits", label: "Kunjungan", type: "number" },
      { key: "first_visit", label: "Pertama", type: "datetime" },
      { key: "last_visit", label: "Terakhir", type: "datetime" },
    ],
    run: (c) =>
      rawRows(sql`
        select cu.name as customer, cu.phone, count(*)::int as visits, min(ch.arrival_time) as first_visit, max(ch.arrival_time) as last_visit
        from wms.vehicle_checkins ch join wms.customers cu on cu.id = ch.customer_id
        where ch.branch_id in ${c.b} and ch.status <> 'cancelled' and ch.arrival_time between ${c.from} and ${c.to}
        group by cu.id, cu.name, cu.phone having count(*) >= 2 order by visits desc`),
  },
  {
    key: "retention",
    group: "Customer",
    title: "Customer Retention",
    description: "Customer aktif, baru dan kembali per bulan",
    permission: "report.customer.view",
    columns: [
      { key: "month", label: "Bulan" },
      { key: "active", label: "Customer Aktif", type: "number" },
      { key: "new_customers", label: "Customer Baru", type: "number" },
      { key: "returning", label: "Kembali", type: "number" },
      { key: "retention", label: "Retention", type: "percent" },
    ],
    run: (c) =>
      rawRows(sql`
        with v as (
          select ch.customer_id, to_char(ch.arrival_time at time zone 'Asia/Jakarta', 'YYYY-MM') as month,
            min(ch.arrival_time) over (partition by ch.customer_id) as first_ever
          from wms.vehicle_checkins ch where ch.branch_id in ${c.b} and ch.status <> 'cancelled'
        ), m as (
          select month, customer_id, bool_or(to_char(first_ever at time zone 'Asia/Jakarta','YYYY-MM') = month) as is_new
          from v group by month, customer_id
        )
        select month, count(*)::int as active, count(*) filter (where is_new)::int as new_customers,
          count(*) filter (where not is_new)::int as returning,
          (count(*) filter (where not is_new)::float8 / nullif(count(*),0) * 100) as retention
        from m where month between ${c.fromISO.slice(0, 7)} and ${c.toISO.slice(0, 7)} group by month order by month`),
  },
  {
    key: "service-due",
    group: "Customer",
    title: "Service Due",
    description: "Service reminder jatuh tempo",
    permission: "report.customer.view",
    columns: [
      { key: "due_date", label: "Jatuh Tempo", type: "date" },
      { key: "due_odometer", label: "Due Km", type: "number" },
      { key: "plate_number", label: "No. Polisi" },
      { key: "customer", label: "Customer" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "description", label: "Reminder" },
      { key: "status", label: "Status" },
    ],
    run: (c) =>
      rawRows(sql`
        select r.due_date::text, r.due_odometer, v.plate_number, cu.name as customer, cu.whatsapp, r.description, r.status
        from wms.service_reminders r join wms.vehicles v on v.id = r.vehicle_id join wms.customers cu on cu.id = r.customer_id
        where r.company_id = ${c.companyId} and (r.branch_id in ${c.b} or r.branch_id is null) and r.status in ('pending','contacted')
          and (r.due_date <= ${c.toISO} or v.last_odometer >= r.due_odometer)
        order by r.due_date`),
  },
  // ------------------------------------------------------------------ Finance
  {
    key: "revenue",
    group: "Finance",
    title: "Revenue",
    description: "Pendapatan bersih, pajak dan penerimaan kas per hari",
    permission: "report.finance.view",
    columns: [
      { key: "day", label: "Tanggal", type: "date" },
      { key: "net_revenue", label: "Pendapatan Bersih", type: "money" },
      { key: "tax", label: "Pajak", type: "money" },
      { key: "gross", label: "Total Invoice", type: "money" },
      { key: "received", label: "Kas Diterima", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        with d as (select generate_series(${c.fromISO}::date, ${c.toISO}::date, interval '1 day')::date as day)
        select d.day::text as day,
          coalesce((select sum(i.subtotal - i.item_discount - i.additional_discount) from wms.invoices i where i.branch_id in ${c.b} and i.status='issued' and (i.invoice_date at time zone 'Asia/Jakarta')::date = d.day),0)::float8 as net_revenue,
          coalesce((select sum(i.tax) from wms.invoices i where i.branch_id in ${c.b} and i.status='issued' and (i.invoice_date at time zone 'Asia/Jakarta')::date = d.day),0)::float8 as tax,
          coalesce((select sum(i.grand_total) from wms.invoices i where i.branch_id in ${c.b} and i.status='issued' and (i.invoice_date at time zone 'Asia/Jakarta')::date = d.day),0)::float8 as gross,
          coalesce((select sum(case when p.type='payment' then p.amount else -p.amount end) from wms.payments p where p.branch_id in ${c.b} and p.status='posted' and (p.payment_date at time zone 'Asia/Jakarta')::date = d.day),0)::float8 as received
        from d order by d.day`),
  },
  {
    key: "discount",
    group: "Finance",
    title: "Discount",
    description: "Invoice yang memiliki diskon",
    permission: "report.finance.view",
    columns: [
      { key: "invoice_date", label: "Tanggal", type: "datetime" },
      { key: "invoice_number", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "subtotal", label: "Subtotal", type: "money" },
      { key: "item_discount", label: "Diskon Item", type: "money" },
      { key: "additional_discount", label: "Diskon Tambahan", type: "money" },
      { key: "discount_pct", label: "% Diskon", type: "percent" },
    ],
    run: (c) =>
      rawRows(sql`
        select i.invoice_date, i.invoice_number, cu.name as customer, i.subtotal::float8, i.item_discount::float8, i.additional_discount::float8,
          ((i.item_discount + i.additional_discount) / nullif(i.subtotal,0) * 100)::float8 as discount_pct
        from wms.invoices i left join wms.customers cu on cu.id = i.customer_id
        where i.branch_id in ${c.b} and i.status='issued' and i.invoice_date between ${c.from} and ${c.to} and (i.item_discount + i.additional_discount) > 0
        order by i.invoice_date desc`),
  },
  {
    key: "gross-profit",
    group: "Finance",
    title: "Gross Profit",
    description: "Pendapatan bersih vs HPP part per bulan",
    permission: "report.finance.view",
    columns: [
      { key: "month", label: "Bulan" },
      { key: "service_revenue", label: "Pendapatan Jasa", type: "money" },
      { key: "part_revenue", label: "Pendapatan Part", type: "money" },
      { key: "cost", label: "HPP", type: "money" },
      { key: "gross_profit", label: "Gross Profit", type: "money" },
      { key: "margin", label: "Margin", type: "percent" },
    ],
    run: (c) =>
      rawRows(sql`
        select to_char(i.invoice_date at time zone 'Asia/Jakarta','YYYY-MM') as month,
          coalesce(sum(ii.total) filter (where ii.item_type='service'),0)::float8 as service_revenue,
          coalesce(sum(ii.total) filter (where ii.item_type<>'service'),0)::float8 as part_revenue,
          coalesce(sum(ii.qty * ii.unit_cost),0)::float8 as cost,
          (sum(ii.total) - sum(ii.qty * ii.unit_cost))::float8 as gross_profit,
          ((sum(ii.total) - sum(ii.qty * ii.unit_cost)) / nullif(sum(ii.total),0) * 100)::float8 as margin
        from wms.invoices i join wms.invoice_items ii on ii.invoice_id = i.id
        where i.branch_id in ${c.b} and i.status='issued' and i.invoice_date between ${c.from} and ${c.to}
        group by 1 order by 1`),
  },
  {
    key: "payment-method",
    group: "Finance",
    title: "Payment Method",
    description: "Penerimaan per metode pembayaran",
    permission: "report.finance.view",
    columns: [
      { key: "method", label: "Metode" },
      { key: "transactions", label: "Transaksi", type: "number" },
      { key: "received", label: "Diterima", type: "money" },
      { key: "refunded", label: "Refund", type: "money" },
      { key: "net", label: "Bersih", type: "money" },
    ],
    run: (c) =>
      rawRows(sql`
        select pm.name as method, count(*)::int as transactions,
          coalesce(sum(p.amount) filter (where p.type='payment'),0)::float8 as received,
          coalesce(sum(p.amount) filter (where p.type='refund'),0)::float8 as refunded,
          (coalesce(sum(p.amount) filter (where p.type='payment'),0) - coalesce(sum(p.amount) filter (where p.type='refund'),0))::float8 as net
        from wms.payments p join wms.payment_methods pm on pm.id = p.payment_method_id
        where p.branch_id in ${c.b} and p.status='posted' and p.payment_date between ${c.from} and ${c.to}
        group by pm.name, pm.sort_order order by pm.sort_order`),
  },
  {
    key: "accounts-receivable",
    group: "Finance",
    title: "Accounts Receivable",
    description: "Invoice belum lunas (piutang) & umur piutang",
    permission: "report.finance.view",
    search: "Customer / invoice",
    columns: [
      { key: "invoice_number", label: "Invoice" },
      { key: "invoice_date", label: "Tanggal", type: "datetime" },
      { key: "customer", label: "Customer" },
      { key: "grand_total", label: "Total", type: "money" },
      { key: "paid_amount", label: "Dibayar", type: "money" },
      { key: "outstanding", label: "Sisa", type: "money" },
      { key: "ar_due_date", label: "Jatuh Tempo", type: "date" },
      { key: "days_overdue", label: "Hari Lewat", type: "number" },
    ],
    run: (c) =>
      rawRows(sql`
        select i.invoice_number, i.invoice_date, coalesce(cu.name,'Walk-in') as customer, i.grand_total::float8, i.paid_amount::float8,
          (i.grand_total - i.paid_amount)::float8 as outstanding, i.ar_due_date::text,
          greatest(0, (current_date - coalesce(i.ar_due_date, (i.invoice_date at time zone 'Asia/Jakarta')::date)))::int as days_overdue
        from wms.invoices i left join wms.customers cu on cu.id = i.customer_id
        where i.branch_id in ${c.b} and i.status='issued' and i.paid_amount < i.grand_total
          and (coalesce(cu.name,'') ilike ${like(c.q)} or i.invoice_number ilike ${like(c.q)})
        order by days_overdue desc, i.invoice_date`),
  },
];

export function availableReports(ctx: AuthContext) {
  return REPORTS.filter((r) => ctx.permissions.has(r.permission)).map(({ run: _run, ...meta }) => meta);
}

export function defaultReportFilters(): ReportFilters {
  return { from: startOfMonthISO(), to: todayISO() };
}

export async function runReport(ctx: AuthContext, key: string, filters: ReportFilters) {
  const def = REPORTS.find((r) => r.key === key);
  if (!def) throw new NotFoundError("Laporan");
  requirePermission(ctx, def.permission);
  const fromISO = filters.from || addDaysISO(todayISO(), -30);
  const toISO = filters.to || todayISO();
  const rows = await def.run({
    b: branchList(ctx, filters.branchId),
    from: jakartaDayStart(fromISO).toISOString(),
    to: jakartaDayEnd(toISO).toISOString(),
    fromISO,
    toISO,
    q: filters.q?.trim() || null,
    companyId: ctx.companyId,
  });
  const { run: _run, ...meta } = def;
  return { meta, rows };
}

export type ReportResult = Awaited<ReturnType<typeof runReport>>;

export function toCsv(columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))];
  return "﻿" + lines.join("\r\n");
}

