import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { saveSecret, saveSettings } from "./actions";
import { SecretForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Pengaturan POS" };

export default async function SettingsPage() {
  const { supabase, role } = await getSession();
  if (role !== "admin") redirect("/");
  const [{ data }, { data: status }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "pos").maybeSingle(),
    supabase.rpc("notification_config_status"),
  ]);
  const value = (data?.value ?? {}) as Record<string, string | number>;
  return (
    <>
      <PageHeader title="Pengaturan POS" subtitle="Informasi struk, program poin, dan provider pengiriman OTP." />
      <h2 className="mb-2 font-semibold">Toko & poin</h2>
      <SettingsForm action={saveSettings.bind(null, value)} value={value} />
      <h2 className="mb-2 mt-6 font-semibold">Provider OTP (WhatsApp / Email)</h2>
      <SecretForm action={saveSecret} status={status} />
      <p className="mt-3 text-xs text-slate-500">
        Pemetaan akun jurnal POS: Kas {String(value.cash_account)}, non-tunai {String(value.noncash_account)}, penjualan {String(value.revenue_account)},
        diskon/retur {String(value.discount_account)}, HPP {String(value.cogs_account)}, persediaan {String(value.inventory_account)}, selisih kas{" "}
        {String(value.cash_variance_account)}.
      </p>
    </>
  );
}
