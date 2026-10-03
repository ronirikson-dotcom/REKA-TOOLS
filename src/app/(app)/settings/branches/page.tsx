import { pageContext } from "@/server/page";
import { listBranches, listWarehouses } from "@/server/services/settings";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { saveBranchAction, saveWarehouseAction } from "@/server/actions/admin";
import { Badge, Card, Checkbox, Field, Grid, Input, PageHeader, Select, StatusBadge } from "@/components/ui";

export const metadata = { title: "Cabang & Gudang" };

export default async function BranchesPage() {
  const ctx = await pageContext("settings.branch");
  const [branches, warehouses] = await Promise.all([listBranches(ctx), listWarehouses(ctx)]);
  return (
    <>
      <PageHeader title="Cabang & Gudang" subtitle="Struktur organisasi: Company › Branch › Warehouse/User (SRS 4.2)" />
      <Grid cols={2}>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Cabang</h2>
          {branches.map((b) => (
            <Card key={b.id} title={<span>{b.name} <Badge>{b.code}</Badge></span>} actions={<StatusBadge domain="active" status={b.status} />}>
              <ActionForm action={saveBranchAction} className="space-y-2">
                <input type="hidden" name="id" value={b.id} />
                <Grid cols={3}>
                  <Field label="Kode">
                    <Input name="code" defaultValue={b.code} required />
                  </Field>
                  <Field label="Nama">
                    <Input name="name" defaultValue={b.name} required />
                  </Field>
                  <Field label="Status">
                    <Select name="status" defaultValue={b.status}>
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                    </Select>
                  </Field>
                </Grid>
                <Grid cols={2}>
                  <Field label="Alamat">
                    <Input name="address" defaultValue={b.address ?? ""} />
                  </Field>
                  <Field label="Telepon">
                    <Input name="phone" defaultValue={b.phone ?? ""} />
                  </Field>
                </Grid>
                <SubmitButton variant="secondary">Simpan</SubmitButton>
              </ActionForm>
            </Card>
          ))}
          <Card title="Tambah cabang">
            <ActionForm action={saveBranchAction} className="space-y-2" resetOnSuccess>
              <Grid cols={2}>
                <Field label="Kode (untuk penomoran)" required hint="mis. SBY → WO-SBY-...">
                  <Input name="code" required maxLength={6} />
                </Field>
                <Field label="Nama" required>
                  <Input name="name" required />
                </Field>
                <Field label="Alamat">
                  <Input name="address" />
                </Field>
                <Field label="Telepon">
                  <Input name="phone" />
                </Field>
              </Grid>
              <SubmitButton>Tambah cabang (+ gudang utama)</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Gudang</h2>
          {warehouses.map((w) => (
            <Card key={w.id} title={<span>{w.name} {w.isDefault && <Badge tone="blue">Default</Badge>}</span>} actions={<span className="text-xs text-slate-500">{w.branchName}</span>}>
              <ActionForm action={saveWarehouseAction} className="space-y-2">
                <input type="hidden" name="id" value={w.id} />
                <input type="hidden" name="branchId" value={w.branchId} />
                <Grid cols={3}>
                  <Field label="Kode">
                    <Input name="code" defaultValue={w.code} required />
                  </Field>
                  <Field label="Nama">
                    <Input name="name" defaultValue={w.name} required />
                  </Field>
                  <Field label="Status">
                    <Select name="status" defaultValue={w.status}>
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                    </Select>
                  </Field>
                </Grid>
                <Checkbox name="isDefault" defaultChecked={w.isDefault} label="Gudang default cabang" />
                <div>
                  <SubmitButton variant="secondary">Simpan</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ))}
          <Card title="Tambah gudang">
            <ActionForm action={saveWarehouseAction} className="space-y-2" resetOnSuccess>
              <Grid cols={3}>
                <Field label="Cabang" required>
                  <Select name="branchId" required>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Kode" required>
                  <Input name="code" required />
                </Field>
                <Field label="Nama" required>
                  <Input name="name" required />
                </Field>
              </Grid>
              <SubmitButton>Tambah gudang</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </Grid>
    </>
  );
}
