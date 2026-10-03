import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionFooter, Card, Field, Grid, Input, Select } from "@/components/ui";
import { saveServiceAction } from "@/server/actions/inventory";

type Service = {
  id: string;
  serviceCode: string;
  serviceName: string;
  category: string | null;
  vehicleType: string;
  standardHour: number;
  sellingPrice: number;
  reminderDays: number | null;
  reminderKm: number | null;
  status: string;
};

export function ServiceForm({ service }: { service?: Service }) {
  return (
    <ActionForm action={saveServiceAction}>
      {service && <input type="hidden" name="id" value={service.id} />}
      <Card>
        <Grid cols={3}>
          <Field label="Kode jasa" required>
            <Input name="serviceCode" defaultValue={service?.serviceCode} required />
          </Field>
          <Field label="Nama jasa" required className="md:col-span-2">
            <Input name="serviceName" defaultValue={service?.serviceName} required />
          </Field>
          <Field label="Kategori">
            <Input name="category" defaultValue={service?.category ?? ""} />
          </Field>
          <Field label="Jenis kendaraan">
            <Select name="vehicleType" defaultValue={service?.vehicleType ?? "all"}>
              <option value="all">Semua</option>
              <option value="car">Mobil</option>
              <option value="motorcycle">Motor</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={service?.status ?? "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </Field>
          <Field label="Standard hour (jam)" required hint="Dasar KPI efisiensi mekanik">
            <Input name="standardHour" type="number" min={0} step="0.05" defaultValue={service?.standardHour ?? 1} required />
          </Field>
          <Field label="Harga jual" required>
            <Input name="sellingPrice" type="number" min={0} defaultValue={service?.sellingPrice ?? 0} required />
          </Field>
          <div />
          <Field label="Reminder berikutnya (hari)" hint="Kosongkan bila tidak perlu reminder">
            <Input name="reminderDays" type="number" min={0} defaultValue={service?.reminderDays ?? ""} />
          </Field>
          <Field label="Reminder berikutnya (km)">
            <Input name="reminderKm" type="number" min={0} defaultValue={service?.reminderKm ?? ""} />
          </Field>
        </Grid>
        <ActionFooter>
          <SubmitButton>Simpan jasa</SubmitButton>
        </ActionFooter>
      </Card>
    </ActionForm>
  );
}
