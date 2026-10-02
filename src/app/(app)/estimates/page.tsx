import { pageContext, params, type SP } from "@/server/page";
import { listEstimates } from "@/server/services/estimates";
import { Badge, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Estimate" };

export default async function EstimatesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("estimate.view");
  const p = await params(searchParams);
  const res = await listEstimates(ctx, { q: p.q, page: p.page, status: p.get("status") });
  return (
    <>
      <PageHeader title="Estimate" subtitle="Draft → Sent → Approved / Partially Approved / Rejected / Expired. Buat estimate dari halaman check-in." />
      <FilterBar action="/estimates" q={p.q} placeholder="No. estimate / customer / nomor polisi">
        <Select name="status" defaultValue={p.get("status") ?? ""} className="sm:w-48">
          <option value="">Semua status</option>
          {Object.entries(STATUS.estimate).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. Estimate</Th>
            <Th>Dibuat</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th right>Total</Th>
            <Th>Berlaku s/d</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={7} />}
          {res.rows.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/estimates/${e.id}`}>{e.estimateNumber}</RowLink>
                {e.workOrderId && <Badge className="ml-2">Tambahan</Badge>}
              </Td>
              <Td>{formatDateTime(e.createdAt)}</Td>
              <Td className="font-medium">{e.plateNumber}</Td>
              <Td>{e.customerName}</Td>
              <Td right>{formatMoney(e.grandTotal)}</Td>
              <Td>{formatDate(e.validUntil)}</Td>
              <Td>
                <StatusBadge domain="estimate" status={e.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/estimates" params={{ q: p.q, status: p.get("status") }} />
    </>
  );
}
