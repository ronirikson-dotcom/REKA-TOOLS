import { pageContext, params, type SP } from "@/server/page";
import { listPartRequests } from "@/server/services/inventory";
import { EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Permintaan Part" };

export default async function PartRequestsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("partrequest.view", "inventory.issue");
  const p = await params(searchParams);
  const status = p.get("status") ?? "open";
  const res = await listPartRequests(ctx, { q: p.q, page: p.page, status: status || null });
  return (
    <>
      <PageHeader title="Permintaan Part" subtitle="Part hanya keluar berdasarkan transaksi sah (BR-005)" />
      <FilterBar action="/part-requests" q={p.q} placeholder="No. permintaan / WO / nomor polisi">
        <Select name="status" defaultValue={status} className="sm:w-48">
          <option value="open">Perlu diproses</option>
          <option value="">Semua</option>
          <option value="issued">Issued</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No.</Th>
            <Th>Waktu</Th>
            <Th>WO</Th>
            <Th>Kendaraan</Th>
            <Th>Peminta</Th>
            <Th>Gudang</Th>
            <Th right>Item</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={8} />}
          {res.rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <RowLink href={`/part-requests/${r.id}`}>{r.requestNumber}</RowLink>
              </Td>
              <Td>{formatDateTime(r.requestDate)}</Td>
              <Td>
                {r.woNumber} <StatusBadge domain="workorder" status={r.woStatus} />
              </Td>
              <Td>{r.plateNumber}</Td>
              <Td>{r.mechanicName}</Td>
              <Td>{r.warehouseName}</Td>
              <Td right>{r.itemCount}</Td>
              <Td>
                <StatusBadge domain="partRequest" status={r.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/part-requests" params={{ q: p.q, status }} />
    </>
  );
}
