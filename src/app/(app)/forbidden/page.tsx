import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { params, type SP } from "@/server/page";

export default async function ForbiddenPage({ searchParams }: { searchParams: SP }) {
  const p = await params(searchParams);
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Akses ditolak</h1>
      <p className="mt-2 text-sm text-slate-600">{p.get("m") ?? "Anda tidak memiliki izin untuk membuka halaman ini."}</p>
      <ButtonLink href="/dashboard" variant="primary" className="mt-6">
        Kembali ke Dashboard
      </ButtonLink>
    </div>
  );
}
