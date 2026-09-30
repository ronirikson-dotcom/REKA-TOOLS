"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export async function setRole(userId: string, role: AppRole) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error) return { error: error.message };
  revalidatePath("/pengguna");
}

export async function setPhone(userId: string, phone?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_profile_contact", { p_user_id: userId, p_phone: phone ?? "" });
  if (error) return { error: error.message };
  revalidatePath("/pengguna");
}
