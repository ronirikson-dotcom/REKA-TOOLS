import { pageContext, params, type SP } from "@/server/page";
import { listPurchaseOrders } from "@/server/services/inventory";
import { ButtonLink, EmptyRow, FilterBar, PageHeader, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Purchase Order" };

export default async function PurchasingPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("purchase.view");
  const p = await params(searchParams);
  const rows = await listPurchaseOrders(ctx, { status: p.get("status"), pageSize: 100 });
  return (
    <>
      <PageHeader title="Purchase Order" subtitle="Draft → Ordered → Received" actions={ctx.permissions.has("purchase.create") && <ButtonLink href="/purchasing/new" variant="primary">+ Purchase order</ButtonLink>} />
      <FilterBar action="/purchasing" q={p.q} placeholder="Cari...">
        <Select name="status" defaultValue={p.get("status") ?? ""} className="sm:w-48">
          <option value="">Semua status</option>
          {Object.entries(STATUS.po).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. PO</Th>
            <Th>Tanggal</Th>
            <Th>Supplier</Th>
            <Th>Gudang</Th>
            <Th>Estimasi datang</Th>
            <Th right>Total</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7} />}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <RowLink href={`/purchasing/${r.id}`}>{r.poNumber}</RowLink>
              </Td>
              <Td>{formatDate(r.orderDate)}</Td>
              <Td>{r.supplierName}</Td>
              <Td>{r.warehouseName}</Td>
              <Td>{formatDate(r.expectedDate)}</Td>
              <Td right>{formatMoney(r.total)}</Td>
              <Td>
                <StatusBadge domain="po" status={r.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
