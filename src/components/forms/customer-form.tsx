import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionFooter, Card, Field, Grid, Input, Select, Textarea } from "@/components/ui";
import { saveCustomerAction } from "@/server/actions/front";
import { CUSTOMER_TYPES } from "@/lib/status";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  customerType: string;
  companyName: string | null;
  taxId: string | null;
  notes: string | null;
};

export function CustomerForm({ customer, returnTo }: { customer?: Customer; returnTo?: string }) {
  return (
    <ActionForm action={saveCustomerAction}>
      <Card>
        {customer && <input type="hidden" name="id" value={customer.id} />}
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <Grid cols={2}>
          <Field label="Nama customer" required>
            <Input name="name" defaultValue={customer?.name} required />
          </Field>
          <Field label="Tipe customer" required>
            <Select name="customerType" defaultValue={customer?.customerType ?? "retail"}>
              {Object.entries(CUSTOMER_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="No. HP" hint="Format 08xx / 62xx">
            <Input name="phone" defaultValue={customer?.phone ?? ""} inputMode="tel" />
          </Field>
          <Field label="WhatsApp" hint="Kosongkan bila sama dengan HP">
            <Input name="whatsapp" defaultValue={customer?.whatsapp ?? ""} inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={customer?.email ?? ""} />
          </Field>
          <Field label="Nama perusahaan" hint="Untuk corporate / fleet">
            <Input name="companyName" defaultValue={customer?.companyName ?? ""} />
          </Field>
          <Field label="NPWP">
            <Input name="taxId" defaultValue={customer?.taxId ?? ""} />
          </Field>
          <Field label="Alamat">
            <Input name="address" defaultValue={customer?.address ?? ""} />
          </Field>
        </Grid>
        <Field label="Catatan" className="mt-4">
          <Textarea name="notes" defaultValue={customer?.notes ?? ""} />
        </Field>
        <ActionFooter>
          <SubmitButton>{customer ? "Simpan perubahan" : "Simpan customer"}</SubmitButton>
        </ActionFooter>
      </Card>
    </ActionForm>
  );
}
