import { pageContext, params, type SP } from "@/server/page";
import { brandOptions } from "@/server/services/vehicles";
import { getCustomer } from "@/server/services/customers";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { VehicleFields } from "@/components/client/vehicle-fields";
import { ActionFooter, Card, PageHeader } from "@/components/ui";
import { saveVehicleAction } from "@/server/actions/front";

export const metadata = { title: "Kendaraan Baru" };

export default async function NewVehiclePage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("vehicle.create");
  const p = await params(searchParams);
  const customerId = p.get("customerId");
  const [brands, customer] = await Promise.all([brandOptions(ctx), customerId ? getCustomer(ctx, customerId).catch(() => null) : null]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Kendaraan baru" back={customer ? { href: `/customers/${customer.id}`, label: customer.name } : { href: "/vehicles", label: "Kendaraan" }} />
      <ActionForm action={saveVehicleAction}>
        {p.get("returnTo") && <input type="hidden" name="returnTo" value={p.get("returnTo")} />}
        <Card>
          <VehicleFields brands={brands} customer={customer ? { id: customer.id, name: customer.name, customerCode: customer.customerCode, phone: customer.phone } : null} />
          <ActionFooter>
            <SubmitButton>Simpan kendaraan</SubmitButton>
          </ActionFooter>
        </Card>
      </ActionForm>
    </div>
  );
}
