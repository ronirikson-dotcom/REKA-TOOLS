import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-xl font-semibold text-slate-900">Data tidak ditemukan</h1>
      <p className="mt-2 text-sm text-slate-600">Data yang Anda cari tidak ada atau berada di luar akses Anda.</p>
      <ButtonLink href="/dashboard" variant="primary" className="mt-6">
        Kembali ke Dashboard
      </ButtonLink>
    </div>
  );
}
