import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionFooter, Card, Field, Grid, Input, Select } from "@/components/ui";
import { saveSupplierAction } from "@/server/actions/inventory";

type Supplier = { id: string; code: string; name: string; contactName: string | null; phone: string | null; email: string | null; address: string | null; status: string };

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  return (
    <ActionForm action={saveSupplierAction}>
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <Card>
        <Grid cols={2}>
          <Field label="Kode" required>
            <Input name="code" defaultValue={supplier?.code} required />
          </Field>
          <Field label="Nama supplier" required>
            <Input name="name" defaultValue={supplier?.name} required />
          </Field>
          <Field label="Kontak">
            <Input name="contactName" defaultValue={supplier?.contactName ?? ""} />
          </Field>
          <Field label="Telepon">
            <Input name="phone" defaultValue={supplier?.phone ?? ""} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={supplier?.email ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={supplier?.status ?? "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </Field>
        </Grid>
        <Field label="Alamat" className="mt-4">
          <Input name="address" defaultValue={supplier?.address ?? ""} />
        </Field>
        <ActionFooter>
          <SubmitButton>Simpan supplier</SubmitButton>
        </ActionFooter>
      </Card>
    </ActionForm>
  );
}
