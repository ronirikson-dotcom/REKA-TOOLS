import { load, pageContext } from "@/server/page";
import { getAdjustment } from "@/server/services/inventory";
import { Card, cn, DL, PageHeader, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

export default async function AdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inventory.view");
  const { id } = await params;
  const a = await load(() => getAdjustment(ctx, id));
  const value = a.items.reduce((s, i) => s + i.differenceQty * i.unitCost, 0);
  return (
    <div className="max-w-4xl">
      <PageHeader title={a.adjustmentNumber} back={{ href: "/inventory/adjustments", label: "Stock Opname" }} />
      <Card className="mb-4">
        <DL
          cols={3}
          items={[
            ["Tanggal", formatDateTime(a.adjustmentDate)],
            ["Jenis", a.adjustmentType === "opname" ? "Stock opname" : "Adjustment"],
            ["Gudang", a.warehouse.name],
            ["Alasan", a.reason],
            ["Nilai selisih", formatMoney(value)],
          ]}
        />
      </Card>
      <Table>
        <THead>
          <tr>
            <Th>Part</Th>
            <Th right>Sistem</Th>
            <Th right>Fisik</Th>
            <Th right>Selisih</Th>
            <Th right>Nilai</Th>
          </tr>
        </THead>
        <TBody>
          {a.items.map((i) => (
            <tr key={i.id}>
              <Td>
                {i.part.partName}
                <div className="font-mono text-xs text-slate-500">{i.part.sku}</div>
              </Td>
              <Td right>{formatQty(i.systemQty)}</Td>
              <Td right>{formatQty(i.countedQty)}</Td>
              <Td right className={cn("font-semibold", i.differenceQty > 0 ? "text-emerald-700" : i.differenceQty < 0 ? "text-red-600" : "text-slate-400")}>
                {i.differenceQty > 0 ? "+" : ""}
                {formatQty(i.differenceQty)}
              </Td>
              <Td right>{formatMoney(i.differenceQty * i.unitCost)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
