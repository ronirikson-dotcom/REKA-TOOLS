import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canManagePos, canWrite, getAccounts, getSession } from "@/lib/data";
import { todayISO } from "@/lib/format";
import type { Product } from "@/lib/pos/types";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Terima Stok" };

export default async function ReceivePage() {
  const { supabase, role } = await getSession();
  if (!canManagePos(role) && !canWrite(role)) redirect("/produk");
  const [{ data }, accounts] = await Promise.all([
    supabase.from("products").select("*").eq("is_active", true).order("name"),
    getAccounts(),
  ]);
  const counters = accounts.filter((a) => a.is_postable && a.is_active && a.code !== "1140" && ["asset", "liability", "equity"].includes(a.type));
  return (
    <>
      <PageHeader
        title="Terima Stok"
        subtitle="Penerimaan barang sederhana (sebelum modul Purchase). Jurnal otomatis: Persediaan (D) / akun lawan (K); HPP rata-rata diperbarui."
      />
      <ReceiveForm products={(data ?? []) as Product[]} counters={counters.map((a) => ({ code: a.code, name: a.name }))} today={todayISO()} />
    </>
  );
}
