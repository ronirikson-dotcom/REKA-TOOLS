"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

export async function saveCustomer(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const payload = {
    phone: String(formData.get("phone") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim() || null,
    tier: String(formData.get("tier") ?? "regular"),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  if (!payload.phone || !payload.name) return { error: "Nomor HP dan nama wajib diisi." };
  const { data, error } = id
    ? await supabase.from("customers").update(payload).eq("id", id).select("id").single()
    : await supabase.from("customers").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "Nomor HP sudah terdaftar." };
    if (error.code === "PGRST116" || error.code === "42501") return { error: "Anda tidak berwenang mengubah data pelanggan." };
    return { error: error.message };
  }
  revalidatePath("/pelanggan");
  redirect(`/pelanggan/${data.id}`);
}
