import { pageContext, params, type SP } from "@/server/page";
import { reorderSuggestions, warehouseOptions } from "@/server/services/inventory";
import { listSuppliers } from "@/server/services/masters";
import { PurchaseOrderForm } from "@/components/client/inventory-forms";
import { createPurchaseOrderAction } from "@/server/actions/inventory";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Purchase Order Baru" };

export default async function NewPoPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("purchase.create");
  const p = await params(searchParams);
  const [warehouses, suppliers] = await Promise.all([warehouseOptions(ctx), listSuppliers(ctx)]);
  const reorderWh = p.get("reorder");
  const suggestions = reorderWh ? await reorderSuggestions(ctx, reorderWh) : [];
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Purchase order baru"
        back={{ href: "/purchasing", label: "Purchase Order" }}
        actions={warehouses[0] && <ButtonLink href={`/purchasing/new?reorder=${warehouses[0].id}`}>Isi dari saran reorder (low stock)</ButtonLink>}
      />
      <Card>
        <PurchaseOrderForm
          key={reorderWh ?? "blank"}
          action={createPurchaseOrderAction}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, branchName: w.branchName }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          initialLines={suggestions.map((s) => ({
            part: { id: s.id, sku: s.sku, barcode: null, partName: s.partName, itemType: "part", unit: "", sellingPrice: 0, purchasePrice: s.purchasePrice, quantity: s.quantity },
            qty: Math.max(1, s.minimumStock * 2 - s.quantity),
            unitCost: s.purchasePrice,
          }))}
        />
      </Card>
    </div>
  );
}
