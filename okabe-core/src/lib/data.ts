import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Account, AccountActivity, AppRole, Profile } from "./types";
import { isDebitNormal } from "./format";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  return { supabase, user, profile, role: (profile?.role ?? "viewer") as AppRole };
});

export function canWrite(role: AppRole) {
  return role === "admin" || role === "accountant";
}

export async function getAccounts() {
  const { supabase } = await getSession();
  const { data, error } = await supabase.from("accounts").select("*").order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

/** Urutkan akun sebagai pohon (depth-first berdasarkan kode). */
export function flattenTree(accounts: Account[]): { account: Account; depth: number; hasChildren: boolean }[] {
  const byParent = new Map<string | null, Account[]>();
  for (const a of accounts) {
    const key = a.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.code.localeCompare(b.code));

  const ids = new Set(accounts.map((a) => a.id));
  const out: { account: Account; depth: number; hasChildren: boolean }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of byParent.get(parent) ?? []) {
      const children = byParent.get(a.id) ?? [];
      out.push({ account: a, depth, hasChildren: children.length > 0 });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  // Akun yang induknya tidak ada di himpunan (mis. hasil filter) tampil di tingkat atas.
  for (const a of accounts) {
    if (a.parent_id && !ids.has(a.parent_id) && !out.some((r) => r.account.id === a.id)) {
      out.push({ account: a, depth: 0, hasChildren: (byParent.get(a.id) ?? []).length > 0 });
      walk(a.id, 1);
    }
  }
  return out;
}

/** Jumlahkan nilai akun transaksi ke seluruh akun induknya. */
export function rollup(accounts: Account[], leafValue: (a: Account) => number) {
  const totals = new Map<string, number>();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) {
    if (!a.is_postable) continue;
    const v = leafValue(a);
    if (!v) continue;
    let cur: Account | undefined = a;
    while (cur) {
      totals.set(cur.id, (totals.get(cur.id) ?? 0) + v);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  }
  return totals;
}

export async function getActivity(from: string, to: string) {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("account_activity", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const map = new Map<string, AccountActivity>();
  for (const r of (data ?? []) as AccountActivity[]) {
    map.set(r.account_id, {
      account_id: r.account_id,
      opening: Number(r.opening),
      period_debit: Number(r.period_debit),
      period_credit: Number(r.period_credit),
    });
  }
  return map;
}

/** Saldo akhir bertanda debit-positif. */
export function closingDebit(act: AccountActivity | undefined) {
  if (!act) return 0;
  return act.opening + act.period_debit - act.period_credit;
}

/** Saldo dalam arah saldo normal akun (positif = normal). */
export function normalBalance(account: Account, debitPositive: number) {
  return isDebitNormal(account.type) ? debitPositive : -debitPositive;
}

export const EPOCH = "1900-01-01";
