"use client";

import { useActionState } from "react";
import type { Customer } from "@/lib/pos/types";
import type { FormState } from "./actions";

export const TIERS = ["regular", "silver", "gold", "corporate"];

export function CustomerForm({ customer, action }: { customer?: Customer; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="phone">Nomor HP</label>
        <input id="phone" name="phone" className="input font-mono" inputMode="tel" defaultValue={customer?.phone} required />
      </div>
      <div>
        <label className="label" htmlFor="name">Nama</label>
        <input id="name" name="name" className="input" defaultValue={customer?.name} required />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" defaultValue={customer?.email ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="tier">Level</label>
        <select id="tier" name="tier" className="input" defaultValue={customer?.tier ?? "regular"}>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Catatan (tampil di kasir)</label>
        <input id="notes" name="notes" className="input" defaultValue={customer?.notes ?? ""} />
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </form>
  );
}
