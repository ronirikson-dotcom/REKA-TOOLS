"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Account, AccountType } from "@/lib/types";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, CASH_FLOW_LABEL } from "@/lib/format";
import type { FormState } from "./actions";

interface Props {
  account?: Account;
  headers: Account[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  hasTransactions?: boolean;
  hasChildren?: boolean;
}

export function AccountForm({ account, headers, action, hasTransactions, hasChildren }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<AccountType>(account?.type ?? "asset");
  const [postable, setPostable] = useState(account?.is_postable ?? true);
  const parents = headers.filter((h) => h.type === type && h.id !== account?.id);

  return (
    <form action={formAction} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="code">Kode akun</label>
        <input className="input font-mono" id="code" name="code" defaultValue={account?.code} required />
      </div>
      <div>
        <label className="label" htmlFor="name">Nama akun</label>
        <input className="input" id="name" name="name" defaultValue={account?.name} required />
      </div>
      <div>
        <label className="label" htmlFor="type">Tipe</label>
        <select
          className="input"
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          disabled={hasTransactions || hasChildren}
        >
          {ACCOUNT_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
          ))}
        </select>
        {(hasTransactions || hasChildren) && <input type="hidden" name="type" value={type} />}
      </div>
      <div>
        <label className="label" htmlFor="parent_id">Akun induk (header)</label>
        <select className="input" id="parent_id" name="parent_id" defaultValue={account?.parent_id ?? ""} key={type}>
          <option value="">— Tingkat teratas —</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="cash_flow_category">Kategori arus kas</label>
        <select
          className="input"
          id="cash_flow_category"
          name="cash_flow_category"
          defaultValue={account?.cash_flow_category ?? "operating"}
        >
          {Object.entries(CASH_FLOW_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="description">Keterangan</label>
        <input className="input" id="description" name="description" defaultValue={account?.description ?? ""} />
      </div>
      <div className="flex flex-col gap-2 text-sm sm:col-span-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_postable"
            checked={postable}
            onChange={(e) => setPostable(e.target.checked)}
            disabled={(hasTransactions && postable) || (hasChildren && !postable)}
          />
          Akun transaksi (bisa dipakai di jurnal). Kosongkan untuk akun header/pengelompokan.
          {((hasTransactions && postable) || (hasChildren && !postable)) && (
            <input type="hidden" name="is_postable" value={postable ? "on" : ""} />
          )}
        </label>
        {postable && type === "asset" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_cash" defaultChecked={account?.is_cash} />
            Akun Kas / Bank (dipakai untuk laporan arus kas)
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={account?.is_active ?? true} />
          Aktif
        </label>
      </div>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
        <Link href="/akun" className="btn">Batal</Link>
      </div>
    </form>
  );
}
