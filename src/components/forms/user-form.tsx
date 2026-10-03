import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionFooter, Card, Checkbox, Field, Grid, Input, Select } from "@/components/ui";
import { saveUserAction } from "@/server/actions/admin";

type User = { id: string; name: string; username: string; email: string; phone: string | null; roleId: string; branchId: string | null; allBranches: boolean; status: string };

export function UserForm({ user, roles, branches }: { user?: User; roles: { id: string; name: string }[]; branches: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveUserAction}>
      {user && <input type="hidden" name="id" value={user.id} />}
      <Card>
        <Grid cols={2}>
          <Field label="Nama lengkap" required>
            <Input name="name" defaultValue={user?.name} required />
          </Field>
          <Field label="Username" required>
            <Input name="username" defaultValue={user?.username} required autoComplete="off" />
          </Field>
          <Field label="Email" required>
            <Input name="email" type="email" defaultValue={user?.email} required />
          </Field>
          <Field label="HP">
            <Input name="phone" defaultValue={user?.phone ?? ""} />
          </Field>
          <Field label="Role" required>
            <Select name="roleId" defaultValue={user?.roleId} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cabang utama">
            <Select name="branchId" defaultValue={user?.branchId ?? ""}>
              <option value="">-</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={user?.status ?? "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </Field>
          <Field label={user ? "Password baru (opsional)" : "Password"} required={!user} hint="Min. 8 karakter, huruf & angka. Disimpan sebagai hash.">
            <Input name="password" type="password" autoComplete="new-password" required={!user} minLength={8} />
          </Field>
        </Grid>
        <div className="mt-4">
          <Checkbox name="allBranches" value="true" defaultChecked={user?.allBranches} label="Akses seluruh cabang (Owner / Super Admin / Accounting)" />
        </div>
        <ActionFooter>
          <SubmitButton>Simpan user</SubmitButton>
        </ActionFooter>
      </Card>
    </ActionForm>
  );
}
