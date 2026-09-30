"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function closePeriod(year: number, month: number) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_period", { p_year: year, p_month: month });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}

export async function reopenPeriod(year: number, month: number, reason?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_period", { p_year: year, p_month: month, p_reason: reason ?? "" });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
