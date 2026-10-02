import { pageContext, params, type SP } from "@/server/page";
import { listReceipts } from "@/server/services/inventory";
import { ButtonLink, EmptyRow, PageHeader, RowLink, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Penerimaan Barang" };

export default async function ReceivingListPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("inventory.receive", "inventory.view");
  const p = await params(searchParams);
  const rows = await listReceipts(ctx, { page: p.page, pageSize: 50 });
  return (
    <>
      <PageHeader title="Penerimaan Barang" subtitle="Receiving stok masuk — memperbarui average cost" actions={ctx.permissions.has("inventory.receive") && <ButtonLink href="/inventory/receiving/new" variant="primary">+ Penerimaan</ButtonLink>} />
      <Table>
        <THead>
          <tr>
            <Th>No.</Th>
            <Th>Tanggal</Th>
            <Th>Supplier</Th>
            <Th>PO</Th>
            <Th>Faktur supplier</Th>
            <Th>Gudang</Th>
            <Th right>Total</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7} />}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <RowLink href={`/inventory/receiving/${r.id}`}>{r.receiptNumber}</RowLink>
              </Td>
              <Td>{formatDateTime(r.receiptDate)}</Td>
              <Td>{r.supplierName ?? "-"}</Td>
              <Td>{r.poNumber ?? "-"}</Td>
              <Td>{r.supplierInvoiceNo ?? "-"}</Td>
              <Td>{r.warehouseName}</Td>
              <Td right>{formatMoney(r.total)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
