import { pageContext, params, type SP } from "@/server/page";
import { listInvoices } from "@/server/services/invoices";
import { Badge, Checkbox, EmptyRow, FilterBar, Input, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Invoice" };

export default async function InvoicesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("invoice.view");
  const p = await params(searchParams);
  const res = await listInvoices(ctx, { q: p.q, page: p.page, paymentStatus: p.get("status"), from: p.get("from"), to: p.get("to"), outstanding: p.get("outstanding") === "1" });
  return (
    <>
      <PageHeader title="Invoice" subtitle="Tagihan final dari pekerjaan aktual & penjualan part" />
      <FilterBar action="/invoices" q={p.q} placeholder="No. invoice / WO / customer / nomor polisi">
        <Input type="date" name="from" defaultValue={p.get("from") ?? ""} className="sm:w-40" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" />
        <Select name="status" defaultValue={p.get("status") ?? ""} className="sm:w-36">
          <option value="">Semua</option>
          {Object.entries(STATUS.payment).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Checkbox name="outstanding" value="1" defaultChecked={p.get("outstanding") === "1"} label="Belum lunas" />
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>Invoice</Th>
            <Th>Tanggal</Th>
            <Th>Customer</Th>
            <Th>Kendaraan / WO</Th>
            <Th right>Total</Th>
            <Th right>Dibayar</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={7} />}
          {res.rows.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/invoices/${i.id}`}>{i.invoiceNumber}</RowLink>
                {i.invoiceType === "counter" && <Badge className="ml-2">Counter</Badge>}
              </Td>
              <Td>{formatDateTime(i.invoiceDate)}</Td>
              <Td>{i.customerName ?? "Walk-in"}</Td>
              <Td>
                {i.plateNumber ?? "-"}
                {i.woNumber && <div className="text-xs text-slate-500">{i.woNumber}</div>}
              </Td>
              <Td right>{formatMoney(i.grandTotal)}</Td>
              <Td right>{formatMoney(i.paidAmount)}</Td>
              <Td>
                {i.status === "void" ? <StatusBadge domain="invoice" status="void" /> : <StatusBadge domain="payment" status={i.paymentStatus} />}
                {i.arDueDate && i.paymentStatus !== "paid" && <div className="text-xs text-slate-500">Tempo {formatDate(i.arDueDate)}</div>}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/invoices" params={{ q: p.q, status: p.get("status"), from: p.get("from"), to: p.get("to"), outstanding: p.get("outstanding") }} />
    </>
  );
}
