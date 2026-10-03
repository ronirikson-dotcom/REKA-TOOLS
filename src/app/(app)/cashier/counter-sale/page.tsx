import { pageContext } from "@/server/page";
import { warehouseOptions } from "@/server/services/inventory";
import { CounterSaleForm } from "@/components/client/counter-sale-form";
import { counterSaleAction } from "@/server/actions/cashier";
import { Alert, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Penjualan Part" };

export default async function CounterSalePage() {
  const ctx = await pageContext("invoice.create");
  const warehouses = (await warehouseOptions(ctx)).filter((w) => w.branchId === ctx.activeBranchId);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Penjualan part langsung" subtitle="Penjualan counter tanpa Work Order — stok keluar via invoice (BR-005). Lanjutkan pembayaran di halaman invoice." back={{ href: "/cashier", label: "Kasir" }} />
      {!ctx.activeBranchId ? (
        <Alert tone="amber">Pilih cabang aktif terlebih dahulu.</Alert>
      ) : (
        <Card>
          <CounterSaleForm action={counterSaleAction} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} canDiscount={ctx.permissions.has("invoice.discount")} />
        </Card>
      )}
    </div>
  );
}
