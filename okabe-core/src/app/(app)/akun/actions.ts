"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

export async function saveAccount(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const isPostable = formData.get("is_postable") === "on";
  const payload = {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type")),
    parent_id: (formData.get("parent_id") as string) || null,
    is_postable: isPostable,
    is_cash: isPostable && formData.get("is_cash") === "on",
    cash_flow_category: String(formData.get("cash_flow_category") ?? "operating"),
    is_active: formData.get("is_active") === "on",
    description: String(formData.get("description") ?? "").trim() || null,
  };
  if (!payload.code || !payload.name) return { error: "Kode dan nama akun wajib diisi." };

  const { error } = id
    ? await supabase.from("accounts").update(payload).eq("id", id).select("id").single()
    : await supabase.from("accounts").insert(payload).select("id").single();

  if (error) {
    if (error.code === "23505") return { error: `Kode akun ${payload.code} sudah digunakan.` };
    if (error.code === "PGRST116" || error.code === "42501")
      return { error: "Anda tidak memiliki hak untuk mengubah Chart of Accounts." };
    return { error: error.message };
  }
  revalidatePath("/akun");
  redirect("/akun");
}

export async function deleteAccount(id: string) {
  const supabase = await createClient();
  const { error, count } = await supabase.from("accounts").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503")
      return { error: "Akun tidak dapat dihapus karena sudah memiliki transaksi atau sub-akun. Nonaktifkan saja." };
    return { error: error.message };
  }
  if (!count) return { error: "Hanya admin yang dapat menghapus akun." };
  revalidatePath("/akun");
  redirect("/akun");
}
