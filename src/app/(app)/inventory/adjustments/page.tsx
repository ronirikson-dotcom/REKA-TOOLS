import { pageContext } from "@/server/page";
import { listAdjustments } from "@/server/services/inventory";
import { Badge, ButtonLink, EmptyRow, PageHeader, RowLink, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Stock Opname" };

export default async function AdjustmentsPage() {
  const ctx = await pageContext("inventory.adjust", "inventory.view");
  const rows = await listAdjustments(ctx, { pageSize: 100 });
  return (
    <>
      <PageHeader title="Stock Opname & Adjustment" subtitle="Koreksi stok wajib beralasan dan tercatat sebagai stock movement" actions={ctx.permissions.has("inventory.adjust") && <ButtonLink href="/inventory/adjustments/new" variant="primary">+ Opname / adjustment</ButtonLink>} />
      <Table>
        <THead>
          <tr>
            <Th>No.</Th>
            <Th>Tanggal</Th>
            <Th>Jenis</Th>
            <Th>Gudang</Th>
            <Th>Alasan</Th>
            <Th right>Item</Th>
            <Th>User</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7} />}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <RowLink href={`/inventory/adjustments/${r.id}`}>{r.adjustmentNumber}</RowLink>
              </Td>
              <Td>{formatDateTime(r.adjustmentDate)}</Td>
              <Td>
                <Badge tone={r.adjustmentType === "opname" ? "blue" : "amber"}>{r.adjustmentType === "opname" ? "Opname" : "Adjustment"}</Badge>
              </Td>
              <Td>{r.warehouseName}</Td>
              <Td>{r.reason}</Td>
              <Td right>{r.itemCount}</Td>
              <Td>{r.userName}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
