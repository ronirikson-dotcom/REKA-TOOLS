"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PromoRules, PromoType } from "@/lib/pos/types";

export interface PromoInput {
  name: string;
  type: PromoType;
  priority: number;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  rules: PromoRules;
}

export async function savePromo(id: string | null, input: PromoInput) {
  const supabase = await createClient();
  const payload = { ...input, name: input.name.trim(), starts_on: input.starts_on || null, ends_on: input.ends_on || null };
  const { error } = id
    ? await supabase.from("promotions").update(payload).eq("id", id).select("id").single()
    : await supabase.from("promotions").insert(payload).select("id").single();
  if (error) {
    if (error.code === "PGRST116" || error.code === "42501") return { error: "Hanya manajer atau admin yang dapat mengelola promo." };
    return { error: error.message };
  }
  revalidatePath("/promo");
  redirect("/promo");
}

export async function togglePromo(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("promotions").update({ is_active: active }).eq("id", id).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/promo");
}

export async function deletePromo(id: string) {
  const supabase = await createClient();
  const { error, count } = await supabase.from("promotions").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Promo sudah dipakai di transaksi. Nonaktifkan saja." };
    return { error: error.message };
  }
  if (!count) return { error: "Tidak berwenang menghapus promo." };
  revalidatePath("/promo");
  redirect("/promo");
}
