import { sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { requirePermission, scopeBranchIds, type AuthContext } from "@/server/auth/context";
import { addDaysISO, jakartaDayEnd, jakartaDayStart, startOfMonthISO, todayISO } from "@/lib/utils";

export async function rawRows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export function branchList(ctx: AuthContext, branchId?: string | null) {
  const ids = scopeBranchIds(ctx);
  if (branchId) return ids.includes(branchId) ? [branchId] : ["00000000-0000-0000-0000-000000000000"];
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}

/** Dashboard & KPI (BRD 1.7) sesuai scope akses (URS-REP-001) */
export async function getDashboard(ctx: AuthContext) {
  requirePermission(ctx, "dashboard.view");
  const b = branchList(ctx);
  const today = todayISO();
  const dayStart = jakartaDayStart(today).toISOString();
  const dayEnd = jakartaDayEnd(today).toISOString();
  const monthStart = jakartaDayStart(startOfMonthISO(today)).toISOString();

  const [ops] = await rawRows<{
    checkins_today: number;
    handover_today: number;
    waiting: number;
    in_progress: number;
    waiting_parts: number;
    qc: number;
    rework: number;
    ready_handover: number;
    avg_cycle_hours: number | null;
  }>(sql`
    select
      (select count(*)::int from vehicle_checkins c where c.branch_id in ${b} and c.arrival_time between ${dayStart} and ${dayEnd}) as checkins_today,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.handover_at between ${dayStart} and ${dayEnd}) as handover_today,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status in ('waiting','assigned')) as waiting,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status in ('in_progress','paused')) as in_progress,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status = 'waiting_parts') as waiting_parts,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status = 'qc') as qc,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status = 'rework') as rework,
      (select count(*)::int from work_orders w where w.branch_id in ${b} and w.status = 'completed' and w.handover_at is null) as ready_handover,
      (select avg(extract(epoch from (w.handover_at - c.arrival_time)) / 3600)::float8 from work_orders w join vehicle_checkins c on c.id = w.checkin_id
         where w.branch_id in ${b} and w.handover_at >= ${jakartaDayStart(addDaysISO(today, -30)).toISOString()}) as avg_cycle_hours
  `);

  const [sales] = await rawRows<{
    sales_today: number;
    sales_mtd: number;
    invoices_mtd: number;
    net_mtd: number;
    cost_mtd: number;
    service_mtd: number;
    parts_mtd: number;
    payments_today: number;
    outstanding_ar: number;
  }>(sql`
    select
      coalesce((select sum(grand_total) from invoices i where i.branch_id in ${b} and i.status='issued' and i.invoice_date between ${dayStart} and ${dayEnd}),0)::float8 as sales_today,
      coalesce((select sum(grand_total) from invoices i where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart}),0)::float8 as sales_mtd,
      (select count(*)::int from invoices i where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart}) as invoices_mtd,
      coalesce((select sum(subtotal - item_discount - additional_discount) from invoices i where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart}),0)::float8 as net_mtd,
      coalesce((select sum(cost_total) from invoices i where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart}),0)::float8 as cost_mtd,
      coalesce((select sum(ii.total) from invoice_items ii join invoices i on i.id = ii.invoice_id where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart} and ii.item_type='service'),0)::float8 as service_mtd,
      coalesce((select sum(ii.total) from invoice_items ii join invoices i on i.id = ii.invoice_id where i.branch_id in ${b} and i.status='issued' and i.invoice_date >= ${monthStart} and ii.item_type<>'service'),0)::float8 as parts_mtd,
      coalesce((select sum(case when p.type='payment' then p.amount else -p.amount end) from payments p where p.branch_id in ${b} and p.status='posted' and p.payment_date between ${dayStart} and ${dayEnd}),0)::float8 as payments_today,
      coalesce((select sum(grand_total - paid_amount) from invoices i where i.branch_id in ${b} and i.status='issued' and i.paid_amount < i.grand_total),0)::float8 as outstanding_ar
  `);

  const trend = await rawRows<{ day: string; total: number; count: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      coalesce((select sum(grand_total) from invoices i where i.branch_id in ${b} and i.status='issued'
        and (i.invoice_date at time zone 'Asia/Jakarta')::date = d::date),0)::float8 as total,
      (select count(*)::int from invoices i where i.branch_id in ${b} and i.status='issued'
        and (i.invoice_date at time zone 'Asia/Jakarta')::date = d::date) as count
    from generate_series(${addDaysISO(today, -13)}::date, ${today}::date, interval '1 day') d
    order by d
  `);

  const mechanics = await mechanicKpi(b, monthStart, dayEnd);

  const [customer] = await rawRows<{ total_customers: number; repeat_customers: number; service_due: number; low_stock: number; stock_value: number }>(sql`
    select
      (select count(*)::int from customers c where c.company_id = ${ctx.companyId} and c.deleted_at is null) as total_customers,
      (select count(*)::int from (select customer_id from vehicle_checkins where branch_id in ${b} and status <> 'cancelled' group by customer_id having count(*) >= 2) x) as repeat_customers,
      (select count(*)::int from service_reminders r join vehicles v on v.id = r.vehicle_id where r.company_id = ${ctx.companyId}
        and (r.branch_id in ${b} or r.branch_id is null) and r.status in ('pending','contacted')
        and (r.due_date <= ${addDaysISO(today, 14)} or v.last_odometer >= r.due_odometer)) as service_due,
      (select count(*)::int from parts p where p.company_id = ${ctx.companyId} and p.status='active' and p.deleted_at is null and
        coalesce((select sum(i.quantity) from inventory i join warehouses w on w.id = i.warehouse_id where i.part_id = p.id and w.branch_id in ${b}),0) <= p.minimum_stock) as low_stock,
      coalesce((select sum(i.quantity * i.average_cost) from inventory i join warehouses w on w.id = i.warehouse_id where w.branch_id in ${b}),0)::float8 as stock_value
  `);

  return {
    ops,
    sales: {
      ...sales,
      avgInvoice: sales.invoices_mtd ? sales.sales_mtd / sales.invoices_mtd : 0,
      grossProfit: sales.net_mtd - sales.cost_mtd,
      marginPct: sales.net_mtd ? ((sales.net_mtd - sales.cost_mtd) / sales.net_mtd) * 100 : 0,
    },
    trend,
    mechanics,
    customer,
  };
}

/** Mechanic Efficiency = Standard Job Hours / Actual Job Hours x 100% (BRD 1.7), dibaca bersama rework rate */
/** from/to berupa ISO timestamp string */
export async function mechanicKpi(branchIds: string[], from: string, to: string) {
  return rawRows<{
    mechanic_id: string;
    mechanic: string;
    jobs: number;
    standard_hours: number;
    actual_hours: number;
    efficiency: number | null;
    rework_jobs: number;
    rework_rate: number | null;
  }>(sql`
    select u.id as mechanic_id, u.name as mechanic,
      count(distinct j.id)::int as jobs,
      coalesce(sum(j.standard_hour), 0)::float8 as standard_hours,
      coalesce(sum(m.duration_minutes) / 60.0, 0)::float8 as actual_hours,
      case when sum(m.duration_minutes) > 0 then (sum(j.standard_hour) / (sum(m.duration_minutes) / 60.0) * 100)::float8 end as efficiency,
      count(distinct j.id) filter (where j.rework_count > 0)::int as rework_jobs,
      case when count(distinct j.id) > 0 then (count(distinct j.id) filter (where j.rework_count > 0)::float8 / count(distinct j.id) * 100) end as rework_rate
    from work_order_mechanics m
    join work_order_jobs j on j.id = m.job_id
    join work_orders w on w.id = m.work_order_id
    join users u on u.id = m.mechanic_id
    where w.branch_id in ${branchIds} and j.status = 'completed' and m.is_active and j.completed_at between ${from} and ${to}
    group by u.id, u.name
    order by efficiency desc nulls last
  `);
}
