import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getPurchaseOrder } from "@/server/services/inventory";
import { ConfirmButton, InlineAction } from "@/components/client/action-form";
import { cancelPurchaseOrderAction, submitPurchaseOrderAction } from "@/server/actions/inventory";
import { ButtonLink, Card, DL, PageHeader, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { PrintButton } from "@/components/client/print-button";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("purchase.view");
  const { id } = await params;
  const po = await load(() => getPurchaseOrder(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={po.poNumber}
        subtitle={<StatusBadge domain="po" status={po.status} />}
        back={{ href: "/purchasing", label: "Purchase Order" }}
        actions={
          <>
            {po.status === "draft" && can("purchase.approve") && (
              <InlineAction action={submitPurchaseOrderAction} fields={{ id: po.id }} variant="primary" size="md">
                Setujui & kirim ke supplier
              </InlineAction>
            )}
            {["ordered", "partially_received"].includes(po.status) && can("inventory.receive") && (
              <ButtonLink href={`/inventory/receiving/new?poId=${po.id}`} variant="primary">
                Terima barang
              </ButtonLink>
            )}
            <PrintButton />
            {["draft", "ordered"].includes(po.status) && can("purchase.approve") && (
              <ConfirmButton action={cancelPurchaseOrderAction} fields={{ id: po.id }} label="Batalkan" variant="danger" requireReason title="Batalkan PO?" />
            )}
          </>
        }
      />
      <Card className="print-area mb-4">
        <DL
          cols={3}
          items={[
            ["Supplier", po.supplier.name],
            ["Gudang", po.warehouse.name],
            ["Tanggal PO", formatDate(po.orderDate)],
            ["Estimasi datang", formatDate(po.expectedDate)],
            ["Total", formatMoney(po.total)],
            ["Catatan", po.notes],
          ]}
        />
        {po.cancelReason && <p className="mt-2 text-sm text-red-700">Batal: {po.cancelReason}</p>}
      </Card>
      <Table>
        <THead>
          <tr>
            <Th>Part</Th>
            <Th right>Qty order</Th>
            <Th right>Diterima</Th>
            <Th right>Harga</Th>
            <Th right>Total</Th>
          </tr>
        </THead>
        <TBody>
          {po.items.map((i) => (
            <tr key={i.id}>
              <Td>
                {i.part.partName}
                <div className="font-mono text-xs text-slate-500">{i.part.sku}</div>
              </Td>
              <Td right>{formatQty(i.qtyOrdered)}</Td>
              <Td right>{formatQty(i.qtyReceived)}</Td>
              <Td right>{formatMoney(i.unitCost)}</Td>
              <Td right>{formatMoney(i.total)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      {po.receipts.length > 0 && (
        <Card title="Penerimaan" className="mt-4">
          <ul className="text-sm">
            {po.receipts.map((r) => (
              <li key={r.id}>
                <Link className="text-brand-700 hover:underline" href={`/inventory/receiving/${r.id}`}>
                  {r.receiptNumber}
                </Link>{" "}
                · {formatDateTime(r.receiptDate)} · {formatMoney(r.total)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
