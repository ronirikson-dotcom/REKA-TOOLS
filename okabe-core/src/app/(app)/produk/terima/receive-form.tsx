"use client";

import { useState, useTransition } from "react";
import { money } from "@/lib/format";
import type { Product } from "@/lib/pos/types";
import { receiveStock } from "../actions";

type Line = { key: number; product_id: string; qty: string; unit_cost: string };
let seq = 0;
const blank = (): Line => ({ key: ++seq, product_id: "", qty: "", unit_cost: "" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

export function ReceiveForm({ products, counters, today }: { products: Product[]; counters: { code: string; name: string }[]; today: string }) {
  const [date, setDate] = useState(today);
  const [counter, setCounter] = useState(counters.find((c) => c.code === "2130")?.code ?? counters[0]?.code ?? "");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = lines.reduce((s, l) => s + num(l.qty) * num(l.unit_cost), 0);
  const upd = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await receiveStock({
        date, counter_account: counter, ref, note,
        lines: lines.map((l) => ({ product_id: l.product_id, qty: num(l.qty), unit_cost: num(l.unit_cost) })),
      });
      if (res?.error) setError(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-5 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="date">Tanggal</label>
          <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="counter">Dibayar / dicatat ke</label>
          <select id="counter" className="input" value={counter} onChange={(e) => setCounter(e.target.value)}>
            {counters.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ref">No. dokumen</label>
          <input id="ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="mis. SJ-001 (opsional)" />
        </div>
        <div>
          <label className="label" htmlFor="note">Catatan / supplier</label>
          <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[640px]">
          <thead><tr><th>Produk</th><th className="w-32 text-right">Qty</th><th className="w-40 text-right">Harga pokok/unit</th><th className="w-40 text-right">Jumlah</th><th className="w-10" /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <select className="input" value={l.product_id} onChange={(e) => upd(l.key, { product_id: e.target.value })}>
                    <option value="">— Pilih produk —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </select>
                </td>
                <td><input className="input text-right font-mono" inputMode="decimal" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} /></td>
                <td><input className="input text-right font-mono" inputMode="decimal" value={l.unit_cost} onChange={(e) => upd(l.key, { unit_cost: e.target.value })} /></td>
                <td className="num pt-3">{money(num(l.qty) * num(l.unit_cost))}</td>
                <td><button className="btn btn-ghost px-2" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="px-3 py-2"><button className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>+ Baris</button></td>
              <td className="num px-3 py-2">{money(total)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className="btn btn-primary" disabled={pending || total <= 0} onClick={submit}>
        {pending ? "Menyimpan…" : "Simpan penerimaan & posting jurnal"}
      </button>
    </div>
  );
}
