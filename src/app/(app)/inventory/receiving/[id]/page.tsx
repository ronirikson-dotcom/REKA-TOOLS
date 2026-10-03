import { load, pageContext } from "@/server/page";
import { getReceipt } from "@/server/services/inventory";
import { Card, DL, PageHeader, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { PrintButton } from "@/components/client/print-button";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inventory.view");
  const { id } = await params;
  const gr = await load(() => getReceipt(ctx, id));
  return (
    <div className="max-w-4xl">
      <PageHeader title={gr.receiptNumber} back={{ href: "/inventory/receiving", label: "Penerimaan" }} actions={<PrintButton />} />
      <Card className="print-area mb-4">
        <DL
          cols={3}
          items={[
            ["Tanggal", formatDateTime(gr.receiptDate)],
            ["Supplier", gr.supplier?.name],
            ["Gudang", gr.warehouse.name],
            ["PO", gr.purchaseOrder?.poNumber],
            ["Faktur supplier", gr.supplierInvoiceNo],
            ["Total", formatMoney(gr.total)],
          ]}
        />
        {gr.notes && <p className="mt-3 text-sm">{gr.notes}</p>}
      </Card>
      <Table>
        <THead>
          <tr>
            <Th>Part</Th>
            <Th right>Qty</Th>
            <Th right>Harga beli</Th>
            <Th right>Total</Th>
          </tr>
        </THead>
        <TBody>
          {gr.items.map((i) => (
            <tr key={i.id}>
              <Td>
                {i.part.partName}
                <div className="font-mono text-xs text-slate-500">{i.part.sku}</div>
              </Td>
              <Td right>{formatQty(i.qty)}</Td>
              <Td right>{formatMoney(i.unitCost)}</Td>
              <Td right>{formatMoney(i.total)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
