import { pageContext } from "@/server/page";
import { warehouseOptions } from "@/server/services/inventory";
import { AdjustmentForm } from "@/components/client/inventory-forms";
import { createAdjustmentAction } from "@/server/actions/inventory";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Stock Opname" };

export default async function NewAdjustmentPage() {
  const ctx = await pageContext("inventory.adjust");
  const warehouses = await warehouseOptions(ctx);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Stock opname / adjustment" back={{ href: "/inventory/adjustments", label: "Stock Opname" }} />
      <Card>
        <AdjustmentForm action={createAdjustmentAction} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, branchName: w.branchName }))} />
      </Card>
    </div>
  );
}
