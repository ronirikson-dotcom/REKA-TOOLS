"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

export async function saveProduct(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const payload = {
    sku: String(formData.get("sku") ?? "").trim(),
    barcode: String(formData.get("barcode") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    unit: String(formData.get("unit") ?? "pcs").trim() || "pcs",
    price: Number(String(formData.get("price") ?? "0").replace(/\D/g, "")),
    is_active: formData.get("is_active") === "on",
  };
  if (!payload.sku || !payload.name) return { error: "SKU dan nama wajib diisi." };
  const { error } = id
    ? await supabase.from("products").update(payload).eq("id", id).select("id").single()
    : await supabase.from("products").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "SKU atau barcode sudah dipakai produk lain." };
    if (error.code === "PGRST116" || error.code === "42501") return { error: "Anda tidak berwenang mengubah produk." };
    return { error: error.message };
  }
  revalidatePath("/produk");
  redirect("/produk");
}

export interface ReceiveInput {
  date: string;
  counter_account: string;
  ref: string;
  note: string;
  lines: { product_id: string; qty: number; unit_cost: number }[];
}

export async function receiveStock(input: ReceiveInput) {
  const supabase = await createClient();
  const lines = input.lines.filter((l) => l.product_id && l.qty > 0);
  if (lines.length === 0) return { error: "Isi minimal satu barang." };
  const { data, error } = await supabase.rpc("receive_stock", {
    p_date: input.date,
    p_counter_account: input.counter_account,
    p_ref: input.ref,
    p_note: input.note,
    p_lines: lines,
  });
  if (error) return { error: error.message };
  revalidatePath("/produk");
  redirect(`/jurnal/${data.entry_id}`);
}
