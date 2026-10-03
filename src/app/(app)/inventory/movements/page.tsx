import { pageContext, params, type SP } from "@/server/page";
import { listMovements, warehouseOptions } from "@/server/services/inventory";
import { EmptyRow, FilterBar, Input, PageHeader, Pagination, RowLink, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { MOVEMENT_LABEL } from "@/lib/status";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Mutasi Stok" };

export default async function MovementsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("inventory.view");
  const p = await params(searchParams);
  const [warehouses, res] = await Promise.all([
    warehouseOptions(ctx),
    listMovements(ctx, { q: p.q, page: p.page, warehouseId: p.get("warehouseId"), type: p.get("type"), from: p.get("from"), to: p.get("to"), pageSize: 50 }),
  ]);
  return (
    <>
      <PageHeader title="Mutasi Stok" subtitle="Seluruh stock movement beserta referensi transaksinya (URS-INV-004)" />
      <FilterBar action="/inventory/movements" q={p.q} placeholder="Part / SKU / no. referensi">
        <Select name="warehouseId" defaultValue={p.get("warehouseId") ?? ""} className="sm:w-48">
          <option value="">Semua gudang</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={p.get("type") ?? ""} className="sm:w-44">
          <option value="">Semua tipe</option>
          {Object.entries(MOVEMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={p.get("from") ?? ""} className="sm:w-40" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" />
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>Waktu</Th>
            <Th>Part</Th>
            <Th>Gudang</Th>
            <Th>Tipe</Th>
            <Th>Referensi</Th>
            <Th right>Masuk</Th>
            <Th right>Keluar</Th>
            <Th right>Saldo</Th>
            <Th right>Cost</Th>
            <Th>User</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={10} />}
          {res.rows.map((m) => (
            <tr key={m.id}>
              <Td>{formatDateTime(m.transactionDate)}</Td>
              <Td>
                {m.partName}
                <div className="font-mono text-xs text-slate-500">{m.sku}</div>
              </Td>
              <Td>{m.warehouseName}</Td>
              <Td>{MOVEMENT_LABEL[m.transactionType] ?? m.transactionType}</Td>
              <Td className="text-xs">
                {m.referenceType === "goods_receipt" && m.referenceId ? (
                  <RowLink href={`/inventory/receiving/${m.referenceId}`}>{m.referenceNumber}</RowLink>
                ) : m.referenceType === "stock_adjustment" && m.referenceId ? (
                  <RowLink href={`/inventory/adjustments/${m.referenceId}`}>{m.referenceNumber}</RowLink>
                ) : m.referenceType === "part_request" && m.referenceId ? (
                  <RowLink href={`/part-requests/${m.referenceId}`}>{m.referenceNumber}</RowLink>
                ) : m.referenceType === "invoice" && m.referenceId ? (
                  <RowLink href={`/invoices/${m.referenceId}`}>{m.referenceNumber}</RowLink>
                ) : (
                  m.referenceNumber
                )}
              </Td>
              <Td right className="text-emerald-700">{m.quantityIn ? formatQty(m.quantityIn) : ""}</Td>
              <Td right className="text-red-600">{m.quantityOut ? formatQty(m.quantityOut) : ""}</Td>
              <Td right>{formatQty(m.balanceAfter)}</Td>
              <Td right>{formatMoney(m.unitCost)}</Td>
              <Td>{m.userName}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/inventory/movements" params={{ q: p.q, warehouseId: p.get("warehouseId"), type: p.get("type"), from: p.get("from"), to: p.get("to") }} />
    </>
  );
}
