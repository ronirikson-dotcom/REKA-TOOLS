import { pageContext, params, type SP } from "@/server/page";
import { listPayments } from "@/server/services/invoices";
import { Badge, EmptyRow, FilterBar, Input, PageHeader, Pagination, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Pembayaran" };

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("payment.view");
  const p = await params(searchParams);
  const res = await listPayments(ctx, { q: p.q, page: p.page, from: p.get("from"), to: p.get("to") });
  return (
    <>
      <PageHeader title="Pembayaran" subtitle="Penerimaan, refund dan void" />
      <FilterBar action="/payments" q={p.q} placeholder="No. pembayaran / invoice / referensi">
        <Input type="date" name="from" defaultValue={p.get("from") ?? ""} className="sm:w-40" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" />
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No.</Th>
            <Th>Waktu</Th>
            <Th>Invoice</Th>
            <Th>Metode</Th>
            <Th>Referensi</Th>
            <Th right>Nominal</Th>
            <Th>Kasir</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={8} />}
          {res.rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-mono text-xs">{r.paymentNumber}</Td>
              <Td>{formatDateTime(r.paymentDate)}</Td>
              <Td>
                <RowLink href={`/invoices/${r.invoiceId}`}>{r.invoiceNumber}</RowLink>
              </Td>
              <Td>
                {r.methodName} {r.type === "refund" && <Badge tone="purple">Refund</Badge>}
              </Td>
              <Td>{r.referenceNumber ?? "-"}</Td>
              <Td right className={r.type === "refund" ? "text-red-600" : undefined}>
                {r.type === "refund" ? "-" : ""}
                {formatMoney(r.amount)}
              </Td>
              <Td>{r.receivedBy}</Td>
              <Td>
                <StatusBadge domain="paymentLine" status={r.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/payments" params={{ q: p.q, from: p.get("from"), to: p.get("to") }} />
    </>
  );
}
