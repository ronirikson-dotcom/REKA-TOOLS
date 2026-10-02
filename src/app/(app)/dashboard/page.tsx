import Link from "next/link";
import { pageContext, load } from "@/server/page";
import { getDashboard } from "@/server/services/dashboard";
import { upcomingBookings } from "@/server/services/bookings";
import { Badge, Card, EmptyRow, Grid, PageHeader, Stat, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { todayISO } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await pageContext("dashboard.view");
  const [d, bookings] = await Promise.all([load(() => getDashboard(ctx)), upcomingBookings(ctx, todayISO())]);
  const max = Math.max(1, ...d.trend.map((t) => t.total));
  const can = (p: string) => ctx.permissions.has(p);
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${ctx.activeBranchId ? "Cabang aktif" : "Semua cabang"} · ${formatDate(todayISO())}`} />

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operasional</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Kendaraan masuk" value={d.ops.checkins_today} hint="hari ini" tone="blue" href="/checkins" />
        <Stat label="Diserahkan" value={d.ops.handover_today} hint="hari ini" tone="green" />
        <Stat label="WO waiting" value={d.ops.waiting} hint="belum dikerjakan" href="/work-orders?status=waiting" />
        <Stat label="In progress" value={d.ops.in_progress} hint={`Waiting parts: ${d.ops.waiting_parts}`} tone="amber" href="/workshop-board" />
        <Stat label="QC / Rework" value={`${d.ops.qc} / ${d.ops.rework}`} hint="menunggu QC / rework" tone="purple" href="/qc" />
        <Stat
          label="Siap diserahkan"
          value={d.ops.ready_handover}
          hint={d.ops.avg_cycle_hours ? `Cycle time rata-rata ${formatNumber(d.ops.avg_cycle_hours, 1)} jam` : "cycle time 30 hari"}
          tone="green"
        />
      </div>

      {can("invoice.view") && (
        <>
          <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Sales &amp; Margin</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Omzet hari ini" value={formatMoney(d.sales.sales_today)} tone="blue" />
            <Stat label="Omzet MTD" value={formatMoney(d.sales.sales_mtd)} hint={`${d.sales.invoices_mtd} invoice`} tone="blue" />
            <Stat label="Rata-rata invoice" value={formatMoney(d.sales.avgInvoice)} hint="bulan ini" />
            <Stat label="Gross margin MTD" value={`${formatNumber(d.sales.marginPct, 1)}%`} hint={formatMoney(d.sales.grossProfit)} tone="green" />
            <Stat label="Kas diterima" value={formatMoney(d.sales.payments_today)} hint="hari ini" tone="green" href="/cashier" />
            <Stat label="Piutang" value={formatMoney(d.sales.outstanding_ar)} hint="outstanding" tone="red" href="/invoices?outstanding=1" />
          </div>
        </>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {can("invoice.view") && (
          <Card title="Penjualan 14 hari terakhir" className="xl:col-span-2">
            <div className="flex h-48 items-end gap-1.5">
              {d.trend.map((t) => (
                <div key={t.day} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(t.day)}: ${formatMoney(t.total)} (${t.count} invoice)`}>
                  <div className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100">{t.total > 0 ? `${Math.round(t.total / 1000)}k` : ""}</div>
                  <div className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600" style={{ height: `${Math.max(2, (t.total / max) * 150)}px` }} />
                  <div className="text-[10px] text-slate-500">{t.day.slice(8)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-6 text-sm text-slate-600">
              <span>
                Jasa MTD: <b className="text-slate-900">{formatMoney(d.sales.service_mtd)}</b>
              </span>
              <span>
                Part MTD: <b className="text-slate-900">{formatMoney(d.sales.parts_mtd)}</b>
              </span>
            </div>
          </Card>
        )}
        <Card title="Customer & Inventory">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Total customer</div>
              <div className="text-xl font-semibold">{d.customer.total_customers}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Repeat customer</div>
              <div className="text-xl font-semibold">{d.customer.repeat_customers}</div>
            </div>
            <Link href="/reminders" className="hover:underline">
              <div className="text-xs text-slate-500">Service due (14 hari)</div>
              <div className="text-xl font-semibold text-amber-600">{d.customer.service_due}</div>
            </Link>
            <Link href="/inventory?low=1" className="hover:underline">
              <div className="text-xs text-slate-500">Low stock</div>
              <div className="text-xl font-semibold text-red-600">{d.customer.low_stock}</div>
            </Link>
            <div className="col-span-2">
              <div className="text-xs text-slate-500">Nilai persediaan</div>
              <div className="text-xl font-semibold">{formatMoney(d.customer.stock_value)}</div>
            </div>
          </div>
        </Card>
      </div>

      <Grid cols={2} className="mt-4">
        <Card title="Performa mekanik (bulan ini)" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Mekanik</Th>
                <Th right>Job</Th>
                <Th right>Std Hours</Th>
                <Th right>Actual</Th>
                <Th right>Efficiency</Th>
                <Th right>Rework</Th>
              </tr>
            </THead>
            <TBody>
              {d.mechanics.length === 0 && <EmptyRow colSpan={6} />}
              {d.mechanics.map((m) => (
                <tr key={m.mechanic_id}>
                  <Td>{m.mechanic}</Td>
                  <Td right>{m.jobs}</Td>
                  <Td right>{formatNumber(m.standard_hours, 1)}</Td>
                  <Td right>{formatNumber(m.actual_hours, 1)}</Td>
                  <Td right>
                    {m.efficiency == null ? "-" : <Badge tone={m.efficiency >= 100 ? "green" : m.efficiency >= 80 ? "amber" : "red"}>{formatNumber(m.efficiency, 0)}%</Badge>}
                  </Td>
                  <Td right>{m.rework_rate == null ? "-" : `${formatNumber(m.rework_rate, 0)}%`}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
          <p className="px-4 py-2 text-xs text-slate-500">Efficiency = Standard Job Hours / Actual Job Hours × 100%, dibaca bersama rework rate.</p>
        </Card>
        <Card title="Booking hari ini" bodyClassName="p-0" actions={can("booking.create") ? <Link className="text-xs font-medium text-brand-700" href="/bookings/new">+ Booking</Link> : null}>
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Jam</Th>
                <Th>Kendaraan</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {bookings.length === 0 && <EmptyRow colSpan={4}>Tidak ada booking hari ini</EmptyRow>}
              {bookings.map((b) => (
                <tr key={b.id}>
                  <Td>{b.bookingTime}</Td>
                  <Td>
                    <Link className="font-medium text-brand-700 hover:underline" href={`/bookings/${b.id}`}>
                      {b.plateNumber}
                    </Link>
                  </Td>
                  <Td>{b.customerName}</Td>
                  <Td>
                    <StatusBadge domain="booking" status={b.status} />
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Grid>
    </>
  );
}
