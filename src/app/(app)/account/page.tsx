import { pageContext } from "@/server/page";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { changePasswordAction } from "@/server/actions/auth";
import { Badge, Card, DL, Field, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Akun" };

export default async function AccountPage() {
  const ctx = await pageContext();
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Akun saya" />
      <Card title="Profil">
        <DL
          items={[
            ["Nama", ctx.userName],
            ["Role", ctx.roleName],
            ["Scope cabang", ctx.allBranches ? "Semua cabang" : "Cabang sendiri"],
            ["Jumlah permission", ctx.permissions.size],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-1">
          {[...ctx.permissions].sort().map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
        </div>
      </Card>
      <Card title="Ganti password">
        <ActionForm action={changePasswordAction} className="space-y-3" resetOnSuccess>
          <Field label="Password saat ini" required>
            <Input type="password" name="current" required autoComplete="current-password" />
          </Field>
          <Field label="Password baru" required hint="Minimal 8 karakter, kombinasi huruf dan angka">
            <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Ulangi password baru" required>
            <Input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
          </Field>
          <SubmitButton>Simpan password</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
