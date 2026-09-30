"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Product, Promotion, PromoRules, PromoType } from "@/lib/pos/types";
import { PROMO_LABEL } from "@/lib/pos/labels";
import { savePromo } from "./actions";


const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function PromoForm({ promo, products, categories }: { promo?: Promotion; products: Product[]; categories: string[] }) {
  const [name, setName] = useState(promo?.name ?? "");
  const [type, setType] = useState<PromoType>(promo?.type ?? "buy_x_get_y");
  const [priority, setPriority] = useState(String(promo?.priority ?? 100));
  const [active, setActive] = useState(promo?.is_active ?? true);
  const [startsOn, setStartsOn] = useState(promo?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(promo?.ends_on ?? "");
  const [r, setR] = useState<PromoRules>(
    promo?.rules ?? { product_ids: [], categories: [], buy_qty: 2, free_qty: 1, items: [], price: 0, days: [1, 2, 3, 4, 5], start: "14:00", end: "17:00", discount_pct: 10, tiers: [{ min_qty: 10, discount_pct: 5 }] },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<PromoRules>) => setR((cur) => ({ ...cur, ...patch }));

  // Hanya field yang relevan untuk tipe promo yang disimpan.
  const rules: PromoRules =
    type === "buy_x_get_y"
      ? { product_ids: r.product_ids ?? [], categories: r.categories ?? [], buy_qty: Number(r.buy_qty), free_qty: Number(r.free_qty) }
      : type === "bundle"
        ? { items: (r.items ?? []).filter((i) => i.product_id), price: Number(r.price) }
        : type === "happy_hour"
          ? { product_ids: r.product_ids ?? [], categories: r.categories ?? [], days: r.days ?? [], start: r.start, end: r.end, discount_pct: Number(r.discount_pct) }
          : { product_ids: r.product_ids ?? [], categories: r.categories ?? [], tiers: (r.tiers ?? []).map((t) => ({ min_qty: Number(t.min_qty), discount_pct: Number(t.discount_pct) })) };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await savePromo(promo?.id ?? null, {
        name, type, priority: Number(priority) || 100, is_active: active, starts_on: startsOn || null, ends_on: endsOn || null, rules,
      });
      if (res?.error) setError(res.error);
    });

  const Target = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="pids">Produk (kosongkan = semua)</label>
        <select id="pids" multiple className="input h-40" value={r.product_ids ?? []}
          onChange={(e) => set({ product_ids: [...e.target.selectedOptions].map((o) => o.value) })}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="cats">Kategori</label>
        <select id="cats" multiple className="input h-40" value={r.categories ?? []}
          onChange={(e) => set({ categories: [...e.target.selectedOptions].map((o) => o.value) })}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">Ctrl/⌘ + klik untuk memilih lebih dari satu.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-5 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Nama promo</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="type">Tipe</label>
          <select id="type" className="input" value={type} onChange={(e) => setType(e.target.value as PromoType)}>
            {Object.entries(PROMO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="prio">Prioritas (kecil = dulu)</label>
          <input id="prio" className="input" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s">Mulai</label>
          <input id="s" type="date" className="input" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e">Berakhir</label>
          <input id="e" type="date" className="input" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2 sm:mt-6">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif
        </label>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Aturan {PROMO_LABEL[type]}</h2>
        {type === "buy_x_get_y" && (
          <>
            <div className="grid max-w-md grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="buy">Beli (qty)</label>
                <input id="buy" className="input" inputMode="numeric" value={r.buy_qty ?? ""} onChange={(e) => set({ buy_qty: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label" htmlFor="free">Gratis (qty)</label>
                <input id="free" className="input" inputMode="numeric" value={r.free_qty ?? ""} onChange={(e) => set({ free_qty: Number(e.target.value) || 0 })} />
              </div>
            </div>
            {Target}
          </>
        )}
        {type === "bundle" && (
          <>
            {(r.items ?? []).map((it, i) => (
              <div key={i} className="flex gap-2">
                <select className="input" value={it.product_id} onChange={(e) => set({ items: (r.items ?? []).map((x, k) => (k === i ? { ...x, product_id: e.target.value } : x)) })}>
                  <option value="">— Produk —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.price})</option>)}
                </select>
                <input className="input w-24" inputMode="numeric" value={it.qty} onChange={(e) => set({ items: (r.items ?? []).map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 0 } : x)) })} />
                <button className="btn btn-ghost" onClick={() => set({ items: (r.items ?? []).filter((_, k) => k !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn" onClick={() => set({ items: [...(r.items ?? []), { product_id: "", qty: 1 }] })}>+ Item paket</button>
            <div className="max-w-xs">
              <label className="label" htmlFor="bp">Harga paket (Rp)</label>
              <input id="bp" className="input" inputMode="numeric" value={r.price ?? ""} onChange={(e) => set({ price: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </div>
          </>
        )}
        {type === "happy_hour" && (
          <>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = (r.days ?? []).includes(n);
                return (
                  <button key={d} className={`btn ${on ? "btn-primary" : ""}`}
                    onClick={() => set({ days: on ? (r.days ?? []).filter((x) => x !== n) : [...(r.days ?? []), n].sort() })}>{d}</button>
                );
              })}
            </div>
            <div className="grid max-w-md grid-cols-3 gap-4">
              <div>
                <label className="label" htmlFor="hs">Mulai</label>
                <input id="hs" type="time" className="input" value={r.start ?? ""} onChange={(e) => set({ start: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="he">Selesai</label>
                <input id="he" type="time" className="input" value={r.end ?? ""} onChange={(e) => set({ end: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="hp">Diskon %</label>
                <input id="hp" className="input" inputMode="decimal" value={r.discount_pct ?? ""} onChange={(e) => set({ discount_pct: Number(e.target.value) || 0 })} />
              </div>
            </div>
            {Target}
          </>
        )}
        {type === "volume_tier" && (
          <>
            {(r.tiers ?? []).map((t, i) => (
              <div key={i} className="flex max-w-md items-center gap-2 text-sm">
                <span>Min. qty</span>
                <input className="input w-24" inputMode="numeric" value={t.min_qty} onChange={(e) => set({ tiers: (r.tiers ?? []).map((x, k) => (k === i ? { ...x, min_qty: Number(e.target.value) || 0 } : x)) })} />
                <span>diskon %</span>
                <input className="input w-24" inputMode="decimal" value={t.discount_pct} onChange={(e) => set({ tiers: (r.tiers ?? []).map((x, k) => (k === i ? { ...x, discount_pct: Number(e.target.value) || 0 } : x)) })} />
                <button className="btn btn-ghost" onClick={() => set({ tiers: (r.tiers ?? []).filter((_, k) => k !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn" onClick={() => set({ tiers: [...(r.tiers ?? []), { min_qty: 0, discount_pct: 0 }] })}>+ Tingkat</button>
            {Target}
          </>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-slate-500">Aturan JSON (disimpan di database)</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-green-300">{JSON.stringify(rules, null, 2)}</pre>
        </details>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || !name.trim()} onClick={submit}>{pending ? "Menyimpan…" : "Simpan promo"}</button>
        <Link className="btn" href="/promo">Batal</Link>
      </div>
    </div>
  );
}
