import { pageContext } from "@/server/page";
import { listTransfers, warehouseOptions } from "@/server/services/inventory";
import { TransferForm } from "@/components/client/inventory-forms";
import { createTransferAction } from "@/server/actions/inventory";
import { Card, EmptyRow, PageHeader, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatQty } from "@/lib/format";

export const metadata = { title: "Transfer Stok" };

export default async function TransfersPage() {
  const ctx = await pageContext("inventory.transfer", "inventory.view");
  const [rows, from, all] = await Promise.all([listTransfers(ctx, { pageSize: 50 }), warehouseOptions(ctx), warehouseOptions(ctx, true)]);
  return (
    <>
      <PageHeader title="Transfer Stok" subtitle="Antar gudang / antar cabang — dicatat sebagai transfer out & transfer in" />
      {ctx.permissions.has("inventory.transfer") && (
        <Card title="Transfer baru" className="mb-4">
          <TransferForm
            action={createTransferAction}
            from={from.map((w) => ({ id: w.id, name: w.name, branchName: w.branchName }))}
            to={all.map((w) => ({ id: w.id, name: w.name, branchName: w.branchName }))}
          />
        </Card>
      )}
      <Table>
        <THead>
          <tr>
            <Th>No.</Th>
            <Th>Tanggal</Th>
            <Th>Dari</Th>
            <Th>Ke</Th>
            <Th>Item</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={5} />}
          {rows.map((t) => (
            <tr key={t.id}>
              <Td className="font-mono text-xs">{t.transferNumber}</Td>
              <Td>{formatDateTime(t.transferDate)}</Td>
              <Td>{t.fromWarehouse.name}</Td>
              <Td>{t.toWarehouse.name}</Td>
              <Td>{t.items.map((i) => `${i.part.partName} × ${formatQty(i.qty)}`).join(", ")}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
