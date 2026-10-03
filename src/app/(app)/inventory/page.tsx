import { pageContext, params, type SP } from "@/server/page";
import { listStock, warehouseOptions } from "@/server/services/inventory";
import { partCategoryOptions } from "@/server/services/masters";
import { Badge, ButtonLink, Checkbox, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Stok Part" };

export default async function InventoryPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("inventory.view");
  const p = await params(searchParams);
  const [warehouses, categories] = await Promise.all([warehouseOptions(ctx), partCategoryOptions(ctx)]);
  const res = await listStock(ctx, { q: p.q, page: p.page, warehouseId: p.get("warehouseId"), lowOnly: p.get("low") === "1", categoryId: p.get("categoryId") });
  const can = (x: string) => ctx.permissions.has(x);
  return (
    <>
      <PageHeader
        title="Stok Part"
        subtitle="Saldo stok per gudang (URS-INV-001) — cari nama, SKU atau scan barcode"
        actions={
          <>
            {can("inventory.receive") && <ButtonLink href="/inventory/receiving/new">Penerimaan</ButtonLink>}
            {can("inventory.adjust") && <ButtonLink href="/inventory/adjustments/new">Stock opname</ButtonLink>}
            {can("part.manage") && <ButtonLink href="/master/parts/new" variant="primary">+ Part baru</ButtonLink>}
          </>
        }
      />
      <FilterBar action="/inventory" q={p.q} placeholder="Nama part / SKU / barcode">
        <Select name="warehouseId" defaultValue={p.get("warehouseId") ?? ""} className="sm:w-52">
          <option value="">Semua gudang (scope cabang)</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select name="categoryId" defaultValue={p.get("categoryId") ?? ""} className="sm:w-44">
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Checkbox name="low" value="1" defaultChecked={p.get("low") === "1"} label="Low stock" />
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>SKU</Th>
            <Th>Part</Th>
            <Th>Kategori</Th>
            <Th right>Stok</Th>
            <Th right>Minimum</Th>
            <Th right>Harga jual</Th>
            <Th right>Nilai stok</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={7} />}
          {res.rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">
                {r.sku}
                {r.barcode && <div className="text-slate-400">{r.barcode}</div>}
              </Td>
              <Td>
                <RowLink href={`/inventory/parts/${r.id}`}>{r.partName}</RowLink>
                {r.itemType === "material" && <Badge className="ml-2">Material</Badge>}
              </Td>
              <Td>{r.category ?? "-"}</Td>
              <Td right>
                <span className={r.low ? "font-semibold text-red-600" : undefined}>
                  {formatQty(r.quantity)} {r.unit}
                </span>
                {r.low && <Badge tone="red" className="ml-2">Low</Badge>}
              </Td>
              <Td right>{formatQty(r.minimumStock)}</Td>
              <Td right>{formatMoney(r.sellingPrice)}</Td>
              <Td right>{formatMoney(r.stockValue)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/inventory" params={{ q: p.q, warehouseId: p.get("warehouseId"), low: p.get("low"), categoryId: p.get("categoryId") }} />
    </>
  );
}
