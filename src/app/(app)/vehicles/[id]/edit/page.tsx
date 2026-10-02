import { load, pageContext } from "@/server/page";
import { brandOptions, getVehicle } from "@/server/services/vehicles";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { VehicleFields } from "@/components/client/vehicle-fields";
import { ActionFooter, Card, PageHeader } from "@/components/ui";
import { saveVehicleAction } from "@/server/actions/front";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("vehicle.edit");
  const { id } = await params;
  const [v, brands] = await Promise.all([load(() => getVehicle(ctx, id)), brandOptions(ctx)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Ubah ${v.plateNumber}`} back={{ href: `/vehicles/${id}`, label: v.plateNumber }} />
      <ActionForm action={saveVehicleAction}>
        <input type="hidden" name="id" value={v.id} />
        <Card>
          <VehicleFields brands={brands} initial={v} lockCustomer customer={{ id: v.customer.id, name: v.customer.name, customerCode: v.customer.customerCode, phone: v.customer.phone }} />
          <ActionFooter>
            <SubmitButton>Simpan perubahan</SubmitButton>
          </ActionFooter>
        </Card>
      </ActionForm>
    </div>
  );
}
