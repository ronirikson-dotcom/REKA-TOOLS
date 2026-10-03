import { load, pageContext } from "@/server/page";
import { getPart } from "@/server/services/masters";
import { listMovements, partStockByWarehouse } from "@/server/services/inventory";
import { Badge, ButtonLink, Card, DL, EmptyRow, Grid, PageHeader, Table, TBody, Td, Th, THead } from "@/components/ui";
import { MOVEMENT_LABEL } from "@/lib/status";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inventory.view");
  const { id } = await params;
  const part = await load(() => getPart(ctx, id));
  const [stock, movements] = await Promise.all([partStockByWarehouse(ctx, id), listMovements(ctx, { partId: id, pageSize: 50 })]);
  const total = stock.reduce((a, s) => a + s.quantity, 0);
  return (
    <>
      <PageHeader
        title={part.partName}
        subtitle={`${part.sku}${part.barcode ? ` · ${part.barcode}` : ""}`}
        back={{ href: "/inventory", label: "Stok Part" }}
        actions={ctx.permissions.has("part.manage") && <ButtonLink href={`/master/parts/${part.id}`}>Ubah master</ButtonLink>}
      />
      <Grid cols={3}>
        <Card title="Master part">
          <DL
            items={[
              ["Kategori", part.category?.name],
              ["Tipe", part.itemType === "material" ? "Material" : "Part"],
              ["Satuan", part.unit],
              ["Merk", part.brand],
              ["Harga beli terakhir", formatMoney(part.purchasePrice)],
              ["Harga jual", formatMoney(part.sellingPrice)],
              ["Minimum stok", formatQty(part.minimumStock)],
              ["Status", part.status],
            ]}
          />
        </Card>
        <Card title={`Stok per gudang · total ${formatQty(total)} ${part.unit}`} className="md:col-span-2" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Gudang</Th>
                <Th>Cabang</Th>
                <Th right>Qty</Th>
                <Th right>Avg cost</Th>
                <Th right>Nilai</Th>
              </tr>
            </THead>
            <TBody>
              {stock.length === 0 && <EmptyRow colSpan={5}>Belum ada stok</EmptyRow>}
              {stock.map((s) => (
                <tr key={s.warehouseId}>
                  <Td>{s.warehouseName}</Td>
                  <Td>{s.branchName}</Td>
                  <Td right>
                    {formatQty(s.quantity)} {s.quantity <= part.minimumStock && <Badge tone="red">Low</Badge>}
                  </Td>
                  <Td right>{formatMoney(s.averageCost)}</Td>
                  <Td right>{formatMoney(s.quantity * s.averageCost)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Grid>
      <Card title="Kartu stok (stock movement)" className="mt-4" bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <THead>
            <tr>
              <Th>Waktu</Th>
              <Th>Gudang</Th>
              <Th>Tipe</Th>
              <Th>Referensi</Th>
              <Th right>Masuk</Th>
              <Th right>Keluar</Th>
              <Th right>Saldo</Th>
              <Th>User</Th>
            </tr>
          </THead>
          <TBody>
            {movements.rows.length === 0 && <EmptyRow colSpan={8} />}
            {movements.rows.map((m) => (
              <tr key={m.id}>
                <Td>{formatDateTime(m.transactionDate)}</Td>
                <Td>{m.warehouseName}</Td>
                <Td>{MOVEMENT_LABEL[m.transactionType] ?? m.transactionType}</Td>
                <Td className="text-xs">
                  {m.referenceNumber}
                  {m.notes && <div className="text-slate-500">{m.notes}</div>}
                </Td>
                <Td right className="text-emerald-700">{m.quantityIn ? formatQty(m.quantityIn) : ""}</Td>
                <Td right className="text-red-600">{m.quantityOut ? formatQty(m.quantityOut) : ""}</Td>
                <Td right>{formatQty(m.balanceAfter)}</Td>
                <Td>{m.userName}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
