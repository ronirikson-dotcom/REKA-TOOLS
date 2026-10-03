import { pageContext } from "@/server/page";
import { listPaymentMethods } from "@/server/services/masters";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { savePaymentMethodAction } from "@/server/actions/admin";
import { Card, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";
import { PAYMENT_TYPE_LABEL } from "@/lib/status";

export const metadata = { title: "Metode Pembayaran" };

function MethodFields({ m }: { m?: { code: string; name: string; type: string; requiresReference: boolean; sortOrder: number; status: string } }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6 md:items-end">
      <Field label="Kode">
        <Input name="code" defaultValue={m?.code} required />
      </Field>
      <Field label="Nama" className="md:col-span-2">
        <Input name="name" defaultValue={m?.name} required />
      </Field>
      <Field label="Tipe">
        <Select name="type" defaultValue={m?.type ?? "transfer"}>
          {Object.entries(PAYMENT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Urutan">
        <Input name="sortOrder" type="number" defaultValue={m?.sortOrder ?? 10} />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={m?.status ?? "active"}>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </Select>
      </Field>
      <div className="col-span-2 md:col-span-6">
        <Checkbox name="requiresReference" value="true" defaultChecked={m?.requiresReference ?? true} label="Wajib nomor referensi / approval code" />
      </div>
    </div>
  );
}

export default async function PaymentMethodsPage() {
  const ctx = await pageContext("settings.master");
  const methods = await listPaymentMethods(ctx);
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Metode pembayaran" subtitle="Cash, QRIS, Debit, Kartu Kredit, Transfer, E-Wallet. Piutang dikelola via otorisasi di invoice." />
      {methods.map((m) => (
        <Card key={m.id}>
          <ActionForm action={savePaymentMethodAction} className="space-y-2">
            <input type="hidden" name="id" value={m.id} />
            <MethodFields m={m} />
            <SubmitButton variant="secondary">Simpan</SubmitButton>
          </ActionForm>
        </Card>
      ))}
      <Card title="Tambah metode">
        <ActionForm action={savePaymentMethodAction} className="space-y-2" resetOnSuccess>
          <MethodFields />
          <SubmitButton>Tambah</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
