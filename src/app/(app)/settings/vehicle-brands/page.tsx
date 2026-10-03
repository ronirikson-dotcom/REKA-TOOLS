import { pageContext } from "@/server/page";
import { brandOptions } from "@/server/services/vehicles";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { saveBrandAction, saveModelAction } from "@/server/actions/admin";
import { Badge, Card, Field, Grid, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Merk Kendaraan" };

export default async function VehicleBrandsPage() {
  const ctx = await pageContext("settings.master");
  const brands = await brandOptions(ctx);
  return (
    <>
      <PageHeader title="Merk & model kendaraan" />
      <Card title="Tambah merk" className="mb-4 max-w-2xl">
        <ActionForm action={saveBrandAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
          <Field label="Merk">
            <Input name="name" required />
          </Field>
          <Field label="Jenis">
            <Select name="vehicleType">
              <option value="car">Mobil</option>
              <option value="motorcycle">Motor</option>
            </Select>
          </Field>
          <SubmitButton>Tambah</SubmitButton>
        </ActionForm>
      </Card>
      <Grid cols={3}>
        {brands.map((b) => (
          <Card key={b.id} title={<span>{b.name} <Badge tone={b.vehicleType === "car" ? "blue" : "teal"}>{b.vehicleType === "car" ? "Mobil" : "Motor"}</Badge></span>}>
            <div className="flex flex-wrap gap-1">
              {b.models.map((m) => (
                <Badge key={m.id}>{m.name}</Badge>
              ))}
            </div>
            <ActionForm action={saveModelAction} className="mt-3 flex gap-2" resetOnSuccess showSuccess={false}>
              <input type="hidden" name="brandId" value={b.id} />
              <Input name="name" placeholder="Model baru" required className="py-1 text-sm" />
              <SubmitButton variant="secondary" className="px-2 py-1 text-xs">
                Tambah
              </SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </Grid>
    </>
  );
}
