"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { JournalEntry } from "@/lib/types";

export interface JournalInput {
  entry_date: string;
  description: string;
  source_ref: string;
  lines: { account_id: string; debit: number; credit: number; memo: string }[];
}

export async function saveJournal(id: string | null, input: JournalInput, post: boolean) {
  const supabase = await createClient();
  const lines = input.lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
  if (!input.description.trim()) return { error: "Keterangan jurnal wajib diisi." };
  if (lines.some((l) => l.debit > 0 && l.credit > 0))
    return { error: "Satu baris hanya boleh berisi Debit atau Kredit, tidak keduanya." };

  const { data, error } = await supabase
    .rpc("save_journal", {
      p_entry_id: id,
      p_entry_date: input.entry_date,
      p_description: input.description.trim(),
      p_lines: lines,
      p_post: post,
      p_source_ref: input.source_ref.trim() || null,
    })
    .single<JournalEntry>();
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(`/jurnal/${data.id}`);
}

export async function postJournal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_journal", { p_entry_id: id });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}

export async function deleteJournal(id: string) {
  const supabase = await createClient();
  const { error, count } = await supabase.from("journal_entries").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: error.message };
  if (!count) return { error: "Jurnal tidak dapat dihapus (sudah Posted atau Anda tidak berwenang)." };
  revalidatePath("/", "layout");
  redirect("/jurnal");
}

export async function reverseJournal(id: string, reason?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reverse_journal", { p_entry_id: id, p_reason: reason ?? "" })
    .single<JournalEntry>();
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/jurnal/${data.id}`);
}
