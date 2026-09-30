"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

export async function saveSettings(current: Record<string, unknown>, _: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const value = {
    ...current,
    store_name: String(formData.get("store_name") ?? "").trim(),
    store_address: String(formData.get("store_address") ?? "").trim(),
    receipt_footer: String(formData.get("receipt_footer") ?? "").trim(),
    points_per_amount: Number(formData.get("points_per_amount")) || 0,
    otp_ttl_minutes: Math.min(30, Math.max(1, Number(formData.get("otp_ttl_minutes")) || 5)),
  };
  const { error } = await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "pos").select("key").single();
  if (error) return { error: error.message };
  revalidatePath("/pengaturan");
  return { ok: "Pengaturan disimpan." };
}

export async function saveSecret(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  for (const key of ["wa_api_url", "wa_api_token", "resend_api_key", "email_from"]) {
    const v = formData.get(key);
    if (v === null || String(v) === "") continue; // kosong = tidak diubah
    const { error } = await supabase.rpc("set_notification_secret", { p_key: key, p_value: String(v) === "-" ? "" : String(v) });
    if (error) return { error: error.message };
  }
  revalidatePath("/pengaturan");
  return { ok: "Konfigurasi provider disimpan." };
}
