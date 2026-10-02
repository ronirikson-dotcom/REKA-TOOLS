import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/server/auth/session";
import { loginAction } from "@/server/actions/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { params, type SP } from "@/server/page";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  if (await getContext()) redirect("/dashboard");
  const p = await params(searchParams);
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Masuk</h1>
      <p className="mb-5 text-sm text-slate-500">Gunakan email atau username Anda.</p>
      {p.get("reset") && (
        <div className="mb-4">
          <Alert tone="green">Password berhasil direset. Silakan login.</Alert>
        </div>
      )}
      <ActionForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={p.get("next") ?? ""} />
        <Field label="Email / Username" required>
          <Input name="identifier" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password" required>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full">Masuk</SubmitButton>
        <div className="text-center">
          <Link href="/forgot-password" className="text-xs text-brand-700 hover:underline">
            Lupa password?
          </Link>
        </div>
      </ActionForm>
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-5 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-semibold">Akun demo</div>
          superadmin / owner / sa.jkt / mekanik1.jkt / qc.jkt / parts.jkt / kasir.jkt — password <code>Password123</code>
        </div>
      )}
    </>
  );
}
