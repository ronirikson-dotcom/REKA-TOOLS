"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Account } from "@/lib/types";
import { money } from "@/lib/format";
import type { JournalInput } from "./actions";

type Line = { key: number; account_id: string; debit: string; credit: string; memo: string };

interface Props {
  accounts: Account[];
  initial?: {
    entry_date: string;
    description: string;
    source_ref: string;
    lines: { account_id: string; debit: number; credit: number; memo: string | null }[];
  };
  defaultDate: string;
  onSave: (input: JournalInput, post: boolean) => Promise<{ error?: string } | void>;
  cancelHref: string;
}

let seq = 0;
const blank = (): Line => ({ key: ++seq, account_id: "", debit: "", credit: "", memo: "" });
// Format input Indonesia: titik = pemisah ribuan, koma = desimal.
const toNum = (s: string) => {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export function JournalForm({ accounts, initial, defaultDate, onSave, cancelHref }: Props) {
  const [date, setDate] = useState(initial?.entry_date ?? defaultDate);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ref, setRef] = useState(initial?.source_ref ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: ++seq,
          account_id: l.account_id,
          debit: l.debit ? String(l.debit).replace(".", ",") : "",
          credit: l.credit ? String(l.credit).replace(".", ",") : "",
          memo: l.memo ?? "",
        }))
      : [blank(), blank()],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const postable = accounts.filter((a) => a.is_postable && a.is_active);
  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + toNum(l.debit), 0);
    const c = lines.reduce((s, l) => s + toNum(l.credit), 0);
    return { d: Math.round(d * 100) / 100, c: Math.round(c * 100) / 100 };
  }, [lines]);
  const diff = Math.round((totals.d - totals.c) * 100) / 100;
  const balanced = diff === 0 && totals.d > 0;

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (post: boolean) => {
    setError(null);
    const input: JournalInput = {
      entry_date: date,
      description,
      source_ref: ref,
      lines: lines.map((l) => ({ account_id: l.account_id, debit: toNum(l.debit), credit: toNum(l.credit), memo: l.memo })),
    };
    start(async () => {
      const res = await onSave(input, post);
      if (res && res.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-5 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="date">Tanggal</label>
          <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="desc">Keterangan</label>
          <input id="desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Pembayaran sewa gudang Oktober" />
        </div>
        <div>
          <label className="label" htmlFor="ref">No. referensi / dokumen</label>
          <input id="ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Opsional" />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Akun</th>
              <th>Memo</th>
              <th className="w-40 text-right">Debit</th>
              <th className="w-40 text-right">Kredit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="pt-3 text-slate-400">{i + 1}</td>
                <td>
                  <select className="input" value={l.account_id} onChange={(e) => update(l.key, { account_id: e.target.value })}>
                    <option value="">— Pilih akun —</option>
                    {postable.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input" value={l.memo} onChange={(e) => update(l.key, { memo: e.target.value })} />
                </td>
                <td>
                  <input
                    className="input text-right font-mono"
                    inputMode="decimal"
                    value={l.debit}
                    onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                    placeholder="0"
                  />
                </td>
                <td>
                  <input
                    className="input text-right font-mono"
                    inputMode="decimal"
                    value={l.credit}
                    onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                    placeholder="0"
                  />
                </td>
                <td className="pt-2.5">
                  <button
                    type="button"
                    className="btn btn-ghost px-2 text-slate-400"
                    title="Hapus baris"
                    onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="px-3 py-2">
                <button type="button" className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>+ Baris</button>
              </td>
              <td className="num px-3 py-2">{money(totals.d)}</td>
              <td className="num px-3 py-2">{money(totals.c)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`text-sm font-medium ${balanced ? "text-green-700" : "text-amber-700"}`}>
          {balanced ? "✓ Seimbang: total Debit = total Kredit" : `Selisih Debit − Kredit: ${money(diff)}`}
        </div>
        <div className="flex gap-2">
          <Link href={cancelHref} className="btn">Batal</Link>
          <button className="btn" disabled={pending} onClick={() => submit(false)}>Simpan draft</button>
          <button className="btn btn-primary" disabled={pending || !balanced} onClick={() => submit(true)}>
            {pending ? "Memproses…" : "Simpan & Posting"}
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
