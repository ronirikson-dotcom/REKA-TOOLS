import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/data";
import { PosApp } from "./pos-app";

export const metadata: Metadata = { title: "Kasir" };

export default async function PosPage() {
  const { user, profile, role } = await getSession();
  if (!["admin", "manager", "cashier"].includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Akses kasir ditolak</h1>
          <p className="mt-1 text-sm text-slate-500">Layar kasir hanya untuk peran Kasir, Manajer, atau Admin.</p>
          <Link href="/" className="btn mt-4">Kembali</Link>
        </div>
      </div>
    );
  }
  return <PosApp user={{ id: user.id, name: profile?.full_name ?? user.email ?? "Kasir", role }} />;
}
