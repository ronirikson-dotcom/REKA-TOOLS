import { pageContext, params, type SP } from "@/server/page";
import { listWorkOrders } from "@/server/services/workorders";
import { ButtonLink, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { formatAge, formatDateTime } from "@/lib/format";

export const metadata = { title: "Work Order" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("workorder.view");
  const p = await params(searchParams);
  const status = p.get("status") ?? "";
  const res = await listWorkOrders(ctx, { q: p.q, page: p.page, status: status && status !== "open" ? status : null, open: status === "open" });
  return (
    <>
      <PageHeader title="Work Order" subtitle="Dokumen pekerjaan resmi bengkel" actions={<ButtonLink href="/workshop-board">Workshop board</ButtonLink>} />
      <FilterBar action="/work-orders" q={p.q} placeholder="No. WO / customer / nomor polisi">
        <Select name="status" defaultValue={status} className="sm:w-44">
          <option value="">Semua status</option>
          <option value="open">Semua yang aktif</option>
          {Object.entries(STATUS.workorder).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. WO</Th>
            <Th>Dibuat</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th>Mekanik</Th>
            <Th>Prioritas</Th>
            <Th>Status</Th>
            <Th>Pembayaran</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={8} />}
          {res.rows.map((w) => (
            <tr key={w.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/work-orders/${w.id}`}>{w.woNumber}</RowLink>
              </Td>
              <Td>
                {formatDateTime(w.createdAt)}
                {!["completed", "cancelled"].includes(w.status) && <div className="text-xs text-slate-500">aging {formatAge(w.createdAt)}</div>}
              </Td>
              <Td className="font-medium">{w.plateNumber}</Td>
              <Td>{w.customerName}</Td>
              <Td>{w.mechanics ?? "-"}</Td>
              <Td>
                <StatusBadge domain="priority" status={w.priority} />
              </Td>
              <Td>
                <StatusBadge domain="workorder" status={w.status} />
              </Td>
              <Td>{w.invoiceStatus ? <StatusBadge domain="payment" status={w.invoiceStatus} /> : <span className="text-xs text-slate-400">belum invoice</span>}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/work-orders" params={{ q: p.q, status }} />
    </>
  );
}
