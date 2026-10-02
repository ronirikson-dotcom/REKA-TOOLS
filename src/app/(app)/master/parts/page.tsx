import { pageContext, params, type SP } from "@/server/page";
import { listParts } from "@/server/services/masters";
import { Badge, ButtonLink, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Master Part" };

export default async function MasterPartsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("part.manage", "inventory.view");
  const p = await params(searchParams);
  const res = await listParts(ctx, { q: p.q, page: p.page, pageSize: 50 });
  const canEdit = ctx.permissions.has("part.manage");
  return (
    <>
      <PageHeader title="Master Spare Part" subtitle="SKU, barcode, harga & minimum stok" actions={canEdit && <ButtonLink href="/master/parts/new" variant="primary">+ Part baru</ButtonLink>} />
      <FilterBar action="/master/parts" q={p.q} placeholder="Nama / SKU / barcode / merk" />
      <Table>
        <THead>
          <tr>
            <Th>SKU</Th>
            <Th>Barcode</Th>
            <Th>Nama</Th>
            <Th>Kategori</Th>
            <Th>Satuan</Th>
            <Th right>Harga beli</Th>
            <Th right>Harga jual</Th>
            <Th right>Min</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={9} />}
          {res.rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td className="font-mono text-xs">{r.barcode ?? "-"}</Td>
              <Td>
                {canEdit ? <RowLink href={`/master/parts/${r.id}`}>{r.partName}</RowLink> : <RowLink href={`/inventory/parts/${r.id}`}>{r.partName}</RowLink>}
                {r.itemType === "material" && <Badge className="ml-2">Material</Badge>}
              </Td>
              <Td>{r.category ?? "-"}</Td>
              <Td>{r.unit}</Td>
              <Td right>{formatMoney(r.purchasePrice)}</Td>
              <Td right>{formatMoney(r.sellingPrice)}</Td>
              <Td right>{formatQty(r.minimumStock)}</Td>
              <Td>
                <StatusBadge domain="active" status={r.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/master/parts" params={{ q: p.q }} />
    </>
  );
}
