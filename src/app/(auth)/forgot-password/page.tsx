import Link from "next/link";
import { forgotPasswordAction } from "@/server/actions/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, Input } from "@/components/ui";

export const metadata = { title: "Lupa Password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Lupa password</h1>
      <p className="mb-5 text-sm text-slate-500">Masukkan email atau username. Link reset berlaku 1 jam.</p>
      <ActionForm action={forgotPasswordAction} className="space-y-4" inlineSuccess>
        <Field label="Email / Username" required>
          <Input name="identifier" required autoFocus />
        </Field>
        <SubmitButton className="w-full">Kirim link reset</SubmitButton>
      </ActionForm>
      <div className="mt-4 text-center">
        <Link href="/login" className="text-xs text-brand-700 hover:underline">
          ← Kembali ke login
        </Link>
      </div>
    </>
  );
}
