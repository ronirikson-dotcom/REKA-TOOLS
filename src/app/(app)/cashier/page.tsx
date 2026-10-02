import Link from "next/link";
import { pageContext, params, type SP } from "@/server/page";
import { cashierClosing, listInvoices, readyToInvoice } from "@/server/services/invoices";
import { ButtonLink, Card, EmptyRow, Grid, Input, PageHeader, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/client/print-button";
import { todayISO } from "@/lib/utils";

export const metadata = { title: "Kasir" };

export default async function CashierPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("invoice.create", "payment.receive");
  const p = await params(searchParams);
  const date = p.get("date") ?? todayISO();
  const can = (x: string) => ctx.permissions.has(x);
  const [ready, unpaid, closing] = await Promise.all([
    can("invoice.view") ? readyToInvoice(ctx) : Promise.resolve([]),
    can("invoice.view") ? listInvoices(ctx, { outstanding: true, pageSize: 50 }) : Promise.resolve({ rows: [] }),
    can("payment.view") ? cashierClosing(ctx, date) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="Kasir"
        subtitle="Invoice siap dibuat, tagihan belum lunas, dan closing kasir"
        actions={can("invoice.create") && <ButtonLink href="/cashier/counter-sale" variant="primary">Penjualan part langsung</ButtonLink>}
      />
      <Grid cols={2}>
        <Card title={`Siap dibuatkan invoice (${ready.length})`} bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>WO</Th>
                <Th>Kendaraan</Th>
                <Th>Lulus QC</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {ready.length === 0 && <EmptyRow colSpan={4}>Tidak ada</EmptyRow>}
              {ready.map((w) => (
                <tr key={w.id}>
                  <Td>{w.woNumber}</Td>
                  <Td>
                    {w.plateNumber}
                    <div className="text-xs text-slate-500">{w.customerName}</div>
                  </Td>
                  <Td>{formatDateTime(w.completedAt)}</Td>
                  <Td right>
                    <ButtonLink size="sm" variant="primary" href={`/work-orders/${w.id}`}>
                      Invoice
                    </ButtonLink>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card title={`Belum lunas (${unpaid.rows.length})`} bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th right>Sisa</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {unpaid.rows.length === 0 && <EmptyRow colSpan={4}>Semua lunas</EmptyRow>}
              {unpaid.rows.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <RowLink href={`/invoices/${i.id}`}>{i.invoiceNumber}</RowLink>
                    <div className="text-xs text-slate-500">{i.plateNumber ?? "Counter"}</div>
                  </Td>
                  <Td>{i.customerName ?? "Walk-in"}</Td>
                  <Td right>{formatMoney(i.grandTotal - i.paidAmount)}</Td>
                  <Td>
                    <StatusBadge domain="payment" status={i.paymentStatus} />
                    {i.arDueDate && <div className="text-xs text-slate-500">Tempo {formatDate(i.arDueDate)}</div>}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Grid>
      {closing && (
        <Card
          title={`Closing kasir ${formatDate(date)}`}
          className="print-area mt-4"
          actions={
            <form className="no-print flex gap-2" action="/cashier">
              <Input type="date" name="date" defaultValue={date} className="py-1" />
              <button className="text-sm font-medium text-brand-700">Lihat</button>
              <PrintButton label="Cetak" />
            </form>
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">Metode</th>
                  <th className="py-1 text-right">Trx</th>
                  <th className="py-1 text-right">Diterima</th>
                  <th className="py-1 text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closing.byMethod.map((m) => (
                  <tr key={m.method}>
                    <td className="py-1.5">{m.method}</td>
                    <td className="py-1.5 text-right">{m.count}</td>
                    <td className="py-1.5 text-right">{formatMoney(m.received)}</td>
                    <td className="py-1.5 text-right">{m.refunded ? formatMoney(m.refunded) : "-"}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1.5">Total bersih</td>
                  <td />
                  <td className="py-1.5 text-right" colSpan={2}>
                    {formatMoney(closing.total)}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">Kasir</th>
                  <th className="py-1 text-right">Trx</th>
                  <th className="py-1 text-right">Bersih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closing.byCashier.map((c) => (
                  <tr key={c.cashier ?? "-"}>
                    <td className="py-1.5">{c.cashier}</td>
                    <td className="py-1.5 text-right">{c.count}</td>
                    <td className="py-1.5 text-right">{formatMoney(c.received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="no-print mt-3 text-xs text-slate-500">
            Detail transaksi: <Link className="text-brand-700 hover:underline" href={`/payments?from=${date}&to=${date}`}>daftar pembayaran</Link>
          </p>
        </Card>
      )}
    </>
  );
}
