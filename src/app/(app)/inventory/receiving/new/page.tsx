import { pageContext, params, type SP } from "@/server/page";
import { getPurchaseOrder, warehouseOptions } from "@/server/services/inventory";
import { listSuppliers } from "@/server/services/masters";
import { ReceivingForm } from "@/components/client/inventory-forms";
import { receiveGoodsAction } from "@/server/actions/inventory";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Penerimaan Barang Baru" };

export default async function NewReceivingPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("inventory.receive");
  const p = await params(searchParams);
  const [warehouses, suppliers, po] = await Promise.all([warehouseOptions(ctx), listSuppliers(ctx), p.get("poId") ? getPurchaseOrder(ctx, p.get("poId")!).catch(() => null) : null]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={po ? `Terima barang ${po.poNumber}` : "Penerimaan barang"} back={{ href: "/inventory/receiving", label: "Penerimaan" }} />
      <Card>
        <ReceivingForm
          action={receiveGoodsAction}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, branchName: w.branchName }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          po={
            po && ["ordered", "partially_received"].includes(po.status)
              ? {
                  id: po.id,
                  poNumber: po.poNumber,
                  supplierId: po.supplierId,
                  warehouseId: po.warehouseId,
                  lines: po.items
                    .filter((i) => i.qtyOrdered > i.qtyReceived)
                    .map((i) => ({
                      part: { id: i.part.id, sku: i.part.sku, barcode: i.part.barcode, partName: i.part.partName, itemType: i.part.itemType, unit: i.part.unit, sellingPrice: i.part.sellingPrice, purchasePrice: i.unitCost, quantity: 0 },
                      qty: i.qtyOrdered - i.qtyReceived,
                      unitCost: i.unitCost,
                    })),
                }
              : null
          }
        />
      </Card>
    </div>
  );
}
