import { resetPasswordAction } from "@/server/actions/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, Input } from "@/components/ui";

export const metadata = { title: "Reset Password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Reset password</h1>
      <p className="mb-5 text-sm text-slate-500">Minimal 8 karakter, kombinasi huruf dan angka.</p>
      <ActionForm action={resetPasswordAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Password baru" required>
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Ulangi password" required>
          <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <SubmitButton className="w-full">Simpan password</SubmitButton>
      </ActionForm>
    </>
  );
}
