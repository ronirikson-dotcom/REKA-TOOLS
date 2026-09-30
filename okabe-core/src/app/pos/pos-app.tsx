"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/pos/modal";
import { OtpDialog } from "@/components/pos/otp-dialog";
import { METHOD_LABEL, Receipt } from "@/components/pos/receipt";
import { useCatalog, useOnline, useQueue, useShift } from "@/components/pos/hooks";
import { money } from "@/lib/format";
import { kv, queueStore } from "@/lib/pos/idb";
import { priceCart } from "@/lib/pos/pricing";
import { createClient } from "@/lib/supabase/client";
import type { Customer, PaymentMethod, Product, QueuedSale, ReceiptData } from "@/lib/pos/types";

interface User {
  id: string;
  name: string;
  role: string;
}

type CartItem = { product_id: string; qty: number };

interface Insight {
  customer: Customer | null;
  stats?: { visits: number; spend: number; last_visit: string | null };
  recent?: { id: string; sale_no: string; sold_at: string; total: number; items: string }[];
  favorites?: { product_id: string; name: string; qty: number }[];
  recommendations: { product_id: string; name: string; price: number; reason: string }[];
}

interface Held {
  id: string;
  items: CartItem[];
  customer: Customer | null;
  created_at: string;
}

const uuid = () => crypto.randomUUID();

export function PosApp({ user }: { user: User }) {
  const online = useOnline();
  const { catalog, source, error: catalogError, reload } = useCatalog();
  const { queue, syncing, sync, refresh } = useQueue(online);
  const { shift, loaded: shiftLoaded, reload: reloadShift } = useShift(user.id, online);

  const [cartId, setCartId] = useState(uuid);
  const [items, setItems] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [manual, setManual] = useState<{ amount: number; otpId: string } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [now, setNow] = useState(() => new Date());
  const [modal, setModal] = useState<
    null | "pay" | "receipt" | "discount" | "otp-discount" | "customer" | "queue" | "held" | "close-shift"
  >(null);
  const [pendingDiscount, setPendingDiscount] = useState(0);
  const [lastSale, setLastSale] = useState<QueuedSale | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Jam untuk promo happy hour.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    kv.get<Held[]>(`held:${user.id}`).then((h) => setHeld(h ?? []));
  }, [user.id]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const productMap = useMemo(() => new Map((catalog?.products ?? []).map((p) => [p.id, p])), [catalog]);
  const categories = useMemo(
    () => [...new Set((catalog?.products ?? []).map((p) => p.category).filter(Boolean) as string[])].sort(),
    [catalog],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog?.products ?? []).filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q),
    );
  }, [catalog, search, category]);

  const priced = useMemo(() => {
    if (!catalog || items.length === 0) return { lines: [], subtotal: 0, promo_discount: 0 };
    try {
      return priceCart(items, productMap, catalog.promotions, now);
    } catch {
      return { lines: [], subtotal: 0, promo_discount: 0 };
    }
  }, [catalog, items, productMap, now]);
  const maxManual = priced.subtotal - priced.promo_discount;
  const manualAmount = manual ? Math.min(manual.amount, maxManual) : 0;
  const total = priced.subtotal - priced.promo_discount - manualAmount;
  const pending = queue.filter((q) => q.state !== "synced");
  const errors = queue.filter((q) => q.state === "error");

  // Rekomendasi upselling berdasarkan isi keranjang (dan pelanggan bila ada).
  const cartKey = items.map((i) => i.product_id).sort().join(",");
  useEffect(() => {
    if (!online || !cartKey) return;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("pos_recommendations", {
        p_customer_id: customer?.id ?? null,
        p_cart: cartKey.split(","),
      });
      if (data) setInsight((prev) => ({ ...(prev ?? { customer: null }), recommendations: data }));
    }, 700);
    return () => clearTimeout(t);
  }, [cartKey, customer, online]);

  const add = (p: Product, qty = 1) => {
    setItems((cur) => {
      const found = cur.find((i) => i.product_id === p.id);
      if (found) return cur.map((i) => (i.product_id === p.id ? { ...i, qty: i.qty + qty } : i));
      return [...cur, { product_id: p.id, qty }];
    });
  };
  const setQty = (id: string, qty: number) =>
    setItems((cur) => (qty <= 0 ? cur.filter((i) => i.product_id !== id) : cur.map((i) => (i.product_id === id ? { ...i, qty } : i))));

  const resetCart = () => {
    setItems([]);
    setCustomer(null);
    setInsight(null);
    setManual(null);
    setCartId(uuid());
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = search.trim();
    const exact = (catalog?.products ?? []).find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      add(target);
      setSearch("");
    }
  };

  const hold = async () => {
    if (items.length === 0) return;
    const next = [...held, { id: uuid(), items, customer, created_at: new Date().toISOString() }];
    setHeld(next);
    await kv.set(`held:${user.id}`, next);
    resetCart();
    flash("Transaksi ditahan (HOLD)");
  };
  const resume = async (h: Held) => {
    if (items.length > 0) await hold();
    const next = held.filter((x) => x.id !== h.id);
    setHeld(next);
    await kv.set(`held:${user.id}`, next);
    setItems(h.items);
    setCustomer(h.customer);
    setModal(null);
  };

  const checkout = async (method: PaymentMethod, paid: number) => {
    if (!shift || !catalog) return;
    const soldAt = new Date().toISOString();
    const receipt: ReceiptData = {
      lines: priced.lines,
      subtotal: priced.subtotal,
      promo_discount: priced.promo_discount,
      manual_discount: manualAmount,
      total,
      paid_amount: method === "cash" ? paid : total,
      change: method === "cash" ? paid - total : 0,
      payment_method: method,
      customer_name: customer?.name ?? null,
      cashier_name: user.name,
      sold_at: soldAt,
      temp_no: "OFF-" + cartId.slice(0, 8).toUpperCase(),
    };
    const sale: QueuedSale = {
      client_uuid: cartId,
      sold_at: soldAt,
      shift_id: shift.id,
      customer_id: customer?.id ?? null,
      customer_name: customer?.name ?? null,
      payment_method: method,
      paid_amount: receipt.paid_amount,
      items,
      manual_discount: manualAmount,
      manual_discount_otp: manualAmount > 0 ? manual!.otpId : null,
      client_total: total,
      offline: !online,
      note: null,
      state: "pending",
      attempts: 0,
      receipt,
    };
    await queueStore.put(sale);
    setLastSale(sale);
    resetCart();
    setModal("receipt");
    await refresh();
    if (online) await sync();
  };

  // Nomor struk resmi setelah tersinkron.
  const lastSynced = lastSale ? queue.find((q) => q.client_uuid === lastSale.client_uuid) : undefined;

  if (catalogError && !catalog) {
    return <FullMessage title="Katalog belum tersedia" body={`${catalogError}. Sambungkan perangkat ke internet untuk memuat katalog pertama kali.`} />;
  }
  if (!catalog || !shiftLoaded) return <FullMessage title="Memuat kasir…" />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">OK</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{catalog.settings.store_name}</div>
            <div className="text-[11px] text-slate-500">
              {user.name} · {shift ? shift.shift_no : "Shift belum dibuka"}
            </div>
          </div>
        </div>
        <input
          ref={searchRef}
          className="input order-last min-w-0 flex-1 basis-full py-2 sm:order-none sm:basis-auto"
          placeholder="Cari produk / scan barcode lalu Enter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
        />
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={`badge ${online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
            {online ? "● Online" : "● Offline"}
          </span>
          <button className="badge bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => setModal("queue")}>
            {syncing ? "Sinkron…" : `Antrean ${pending.length}`}
            {errors.length > 0 && <span className="ml-1 text-red-600">({errors.length} gagal)</span>}
          </button>
          <details className="relative">
            <summary className="btn cursor-pointer list-none py-1">Menu ▾</summary>
            <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
              <Link className="block rounded px-3 py-2 hover:bg-slate-100" href="/pos/checker">Checker display</Link>
              <Link className="block rounded px-3 py-2 hover:bg-slate-100" href="/penjualan">Riwayat transaksi</Link>
              <button className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100" onClick={() => reload()}>
                Muat ulang katalog
              </button>
              {shift && (
                <button className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100" onClick={() => setModal("close-shift")}>
                  Tutup shift
                </button>
              )}
              <Link className="block rounded px-3 py-2 hover:bg-slate-100" href="/">Ke backoffice</Link>
            </div>
          </details>
        </div>
      </header>

      {source === "cache" && (
        <div className="bg-amber-50 px-4 py-1 text-xs text-amber-800">
          Mode offline: memakai katalog tersimpan ({new Date(catalog.fetchedAt).toLocaleString("id-ID")}). Transaksi disimpan di perangkat dan
          dikirim otomatis saat online.
        </div>
      )}

      {!shift ? (
        <OpenShift online={online} onOpened={reloadShift} />
      ) : (
        <div className="grid flex-1 gap-3 p-3 lg:grid-cols-12">
          {/* Produk */}
          <section className="lg:col-span-8">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {["", ...categories].map((c) => (
                <button
                  key={c || "all"}
                  className={`btn whitespace-nowrap ${category === c ? "btn-primary" : ""}`}
                  onClick={() => setCategory(c)}
                >
                  {c || "Semua"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const inCart = items.find((i) => i.product_id === p.id)?.qty ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    className={`card flex min-h-28 flex-col items-start justify-between p-3 text-left transition hover:border-brand-500 active:scale-[0.98] ${
                      inCart ? "border-brand-500 ring-2 ring-brand-100" : ""
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium leading-tight">{p.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{p.sku}</div>
                    </div>
                    <div className="mt-2 flex w-full items-end justify-between">
                      <span className="font-mono text-sm font-semibold">{money(p.price)}</span>
                      <span className={`text-[11px] ${p.stock_qty <= 5 ? "text-red-600" : "text-slate-400"}`}>
                        stok {Number(p.stock_qty)}
                      </span>
                    </div>
                    {inCart > 0 && <span className="badge mt-1 bg-brand-600 text-white">× {inCart}</span>}
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-500">Produk tidak ditemukan.</p>}
            </div>
          </section>

          {/* Keranjang */}
          <aside className="flex flex-col gap-3 lg:col-span-4">
            <div className="card p-3">
              {customer ? (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{customer.name}</div>
                    <div className="text-xs text-slate-500">
                      {customer.phone} · {customer.tier} · <b>{customer.points_balance}</b> poin
                    </div>
                    {insight?.stats && (
                      <div className="text-[11px] text-slate-500">
                        {insight.stats.visits} kunjungan · belanja Rp {money(insight.stats.spend)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn px-2 py-1 text-xs" onClick={() => setModal("customer")}>Detail</button>
                    <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => { setCustomer(null); setInsight(null); }}>✕</button>
                  </div>
                </div>
              ) : (
                <button className="btn w-full" onClick={() => setModal("customer")} disabled={!online}>
                  {online ? "+ Pelanggan / member (nomor HP)" : "CRM butuh koneksi internet"}
                </button>
              )}
            </div>

            <div className="card flex flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h2 className="text-sm font-semibold">Keranjang</h2>
                {held.length > 0 && (
                  <button className="text-xs link" onClick={() => setModal("held")}>{held.length} ditahan</button>
                )}
              </div>
              <div className="max-h-[45vh] flex-1 overflow-y-auto">
                {priced.lines.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Belum ada item.</p>}
                {priced.lines.map((l) => {
                  const stock = productMap.get(l.product_id)?.stock_qty ?? 0;
                  return (
                    <div key={l.product_id} className="border-b border-slate-100 px-3 py-2 last:border-0">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{l.name}</span>
                        <span className="font-mono">{money(l.gross)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button className="btn h-7 w-7 p-0" onClick={() => setQty(l.product_id, l.qty - 1)} aria-label="Kurangi">−</button>
                          <input
                            className="input h-7 w-12 px-1 text-center"
                            inputMode="numeric"
                            value={l.qty}
                            onChange={(e) => setQty(l.product_id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                            aria-label={`Qty ${l.name}`}
                          />
                          <button className="btn h-7 w-7 p-0" onClick={() => setQty(l.product_id, l.qty + 1)} aria-label="Tambah">+</button>
                          <span className="ml-1 text-[11px] text-slate-400">@ {money(l.unit_price)}</span>
                        </div>
                        {l.qty > stock && <span className="text-[11px] text-red-600">stok {stock}</span>}
                      </div>
                      {l.promo_discount > 0 && (
                        <div className="mt-1 flex justify-between text-xs text-green-700">
                          <span>🏷 {l.promo_name}</span>
                          <span className="font-mono">−{money(l.promo_discount)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {insight && insight.recommendations.length > 0 && items.length > 0 && (
                <div className="border-t border-slate-200 px-3 py-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rekomendasi</div>
                  <div className="flex flex-wrap gap-1">
                    {insight.recommendations.map((r) => {
                      const p = productMap.get(r.product_id);
                      return (
                        p && (
                          <button key={r.product_id} className="badge bg-amber-50 text-amber-800 hover:bg-amber-100" title={r.reason} onClick={() => add(p)}>
                            + {r.name}
                          </button>
                        )
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1 border-t border-slate-200 px-3 py-3 text-sm">
                <Line label="Subtotal" value={priced.subtotal} />
                {priced.promo_discount > 0 && <Line label="Diskon promo" value={-priced.promo_discount} green />}
                <div className="flex items-center justify-between">
                  <button className="text-xs link" onClick={() => setModal("discount")} disabled={items.length === 0}>
                    {manual ? "Diskon manual (disetujui)" : "+ Diskon manual (OTP)"}
                  </button>
                  {manualAmount > 0 && <span className="font-mono text-green-700">−{money(manualAmount)}</span>}
                </div>
                {manual && manual.amount > maxManual && (
                  <p className="text-[11px] text-amber-700">Diskon dibatasi sebesar total setelah promo.</p>
                )}
                <div className="flex items-center justify-between pt-1 text-lg font-bold">
                  <span>Total</span>
                  <span className="font-mono">Rp {money(total)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-slate-200 p-3">
                <button className="btn py-3" onClick={hold} disabled={items.length === 0}>HOLD</button>
                <button className="btn py-3" onClick={resetCart} disabled={items.length === 0}>Batal</button>
                <button className="btn btn-primary py-3 text-base" onClick={() => setModal("pay")} disabled={items.length === 0}>
                  BAYAR
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}

      {modal === "pay" && (
        <PaymentModal total={total} onClose={() => setModal(null)} onPay={checkout} online={online} />
      )}

      {modal === "receipt" && lastSale && (
        <Modal title="Transaksi berhasil" onClose={() => setModal(null)}>
          <div className="mb-3 text-center text-sm">
            {lastSynced?.state === "synced" ? (
              <span className="text-green-700">✓ Tersimpan di server · {lastSynced.sale_no}</span>
            ) : lastSynced?.state === "error" ? (
              <span className="text-red-600">Ditolak server: {lastSynced.error}</span>
            ) : (
              <span className="text-amber-700">Tersimpan di perangkat, menunggu sinkronisasi…</span>
            )}
          </div>
          <Receipt
            data={lastSale.receipt}
            settings={catalog.settings}
            saleNo={lastSynced?.sale_no}
            pending={lastSynced?.state !== "synced"}
          />
          <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
            <button className="btn py-2" onClick={() => window.print()}>Cetak struk</button>
            <button className="btn btn-primary py-2" onClick={() => { setModal(null); searchRef.current?.focus(); }}>
              Transaksi baru
            </button>
          </div>
        </Modal>
      )}

      {modal === "discount" && (
        <DiscountModal
          max={maxManual}
          online={online}
          onClose={() => setModal(null)}
          onNext={(amount) => {
            setPendingDiscount(amount);
            setModal("otp-discount");
          }}
        />
      )}
      {modal === "otp-discount" && (
        <OtpDialog
          action="manual_discount"
          title={`Persetujuan diskon Rp ${money(pendingDiscount)}`}
          context={{ ref: cartId, amount: pendingDiscount, summary: `Diskon Rp ${money(pendingDiscount)} untuk belanja Rp ${money(maxManual)}` }}
          approvers={catalog.managers}
          onClose={() => setModal(null)}
          onApproved={(otpId) => {
            setManual({ amount: pendingDiscount, otpId });
            setModal(null);
            flash("Diskon manual disetujui manajer");
          }}
        />
      )}

      {modal === "customer" && (
        <CustomerModal
          current={customer}
          insight={insight}
          cart={items.map((i) => i.product_id)}
          onClose={() => setModal(null)}
          onSelect={(c, ins) => {
            setCustomer(c);
            setInsight(ins);
            setModal(null);
          }}
          onAdd={(id) => {
            const p = productMap.get(id);
            if (p) add(p);
          }}
        />
      )}

      {modal === "held" && (
        <Modal title="Transaksi ditahan" onClose={() => setModal(null)}>
          <ul className="space-y-2">
            {held.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span>
                  {new Date(h.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {h.items.reduce((s, i) => s + i.qty, 0)} item {h.customer ? `· ${h.customer.name}` : ""}
                </span>
                <button className="btn btn-primary py-1" onClick={() => resume(h)}>Lanjutkan</button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {modal === "queue" && (
        <Modal title="Antrean sinkronisasi" onClose={() => setModal(null)} wide>
          <p className="mb-3 text-sm text-slate-600">
            Transaksi disimpan di perangkat lalu dikirim ke server berurutan sesuai waktu transaksi. Transaksi yang ditolak (mis. periode
            sudah ditutup) perlu ditangani manajer.
          </p>
          <div className="mb-3 flex gap-2">
            <button className="btn btn-primary" onClick={sync} disabled={!online || syncing}>
              {syncing ? "Menyinkronkan…" : "Sinkronkan sekarang"}
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Waktu</th><th>No</th><th className="text-right">Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {[...queue].reverse().map((q) => (
                <tr key={q.client_uuid}>
                  <td className="whitespace-nowrap text-xs">{new Date(q.sold_at).toLocaleString("id-ID")}</td>
                  <td className="font-mono text-xs">{q.sale_no ?? q.receipt.temp_no}</td>
                  <td className="num">{money(q.client_total)}</td>
                  <td className="text-xs">
                    {q.state === "synced" ? (
                      <span className="text-green-700">Tersinkron</span>
                    ) : q.state === "error" ? (
                      <span className="text-red-600">Gagal: {q.error}</span>
                    ) : (
                      <span className="text-amber-700">Menunggu</span>
                    )}
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">Antrean kosong.</td></tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}

      {modal === "close-shift" && shift && (
        <CloseShiftModal
          shiftId={shift.id}
          online={online}
          pendingCount={pending.length}
          onClose={() => setModal(null)}
          onClosed={async () => {
            setModal(null);
            await kv.del(`shift:${user.id}`);
            await reloadShift();
            flash("Shift ditutup");
          }}
        />
      )}
    </div>
  );
}

function Line({ label, value, green }: { label: string; value: number; green?: boolean }) {
  return (
    <div className={`flex justify-between ${green ? "text-green-700" : ""}`}>
      <span>{label}</span>
      <span className="font-mono">{value < 0 ? `−${money(-value)}` : money(value)}</span>
    </div>
  );
}

function FullMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {body && <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>}
        <Link href="/" className="btn mt-4">Ke backoffice</Link>
      </div>
    </div>
  );
}

function OpenShift({ online, onOpened }: { online: boolean; onOpened: () => void }) {
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("pos_open_shift", { p_opening_cash: Number(cash.replace(/\D/g, "")) || 0 });
    setBusy(false);
    if (error) return setError(error.message);
    onOpened();
  };
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Buka shift kasir</h1>
          <p className="text-sm text-slate-500">Hitung uang modal di laci kas sebelum mulai berjualan.</p>
        </div>
        <div>
          <label className="label" htmlFor="opening">Kas awal (Rp)</label>
          <input id="opening" className="input py-2 text-right font-mono text-lg" inputMode="numeric" value={cash}
            onChange={(e) => setCash(e.target.value.replace(/\D/g, ""))} placeholder="0" />
        </div>
        {!online && <p className="text-sm text-amber-700">Membuka shift membutuhkan koneksi internet.</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary w-full py-2" disabled={busy || !online} onClick={open}>
          {busy ? "Membuka…" : "Buka shift"}
        </button>
      </div>
    </div>
  );
}

function PaymentModal({
  total,
  online,
  onClose,
  onPay,
}: {
  total: number;
  online: boolean;
  onClose: () => void;
  onPay: (method: PaymentMethod, paid: number) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState(String(total));
  const [busy, setBusy] = useState(false);
  const paidNum = Number(paid.replace(/\D/g, "")) || 0;
  const quick = [...new Set([total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000])].filter((v) => v >= total);
  const ok = method !== "cash" || paidNum >= total;

  return (
    <Modal title="Pembayaran" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-900 p-4 text-center text-white">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total tagihan</div>
          <div className="font-mono text-3xl font-bold">Rp {money(total)}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(["cash", "qris", "card", "transfer"] as PaymentMethod[]).map((m) => (
            <button key={m} className={`btn py-3 text-xs ${method === m ? "btn-primary" : ""}`} onClick={() => setMethod(m)}>
              {METHOD_LABEL[m].replace(" Debit/Kredit", "")}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <div className="space-y-2">
            <label className="label" htmlFor="paid">Uang diterima</label>
            <input id="paid" autoFocus className="input py-2 text-right font-mono text-2xl" inputMode="numeric" value={paid}
              onChange={(e) => setPaid(e.target.value.replace(/\D/g, ""))} />
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <button key={q} className="btn" onClick={() => setPaid(String(q))}>{q === total ? "Uang pas" : money(q)}</button>
              ))}
            </div>
            <div className="flex justify-between text-lg">
              <span>Kembali</span>
              <span className={`font-mono font-bold ${paidNum >= total ? "text-green-700" : "text-red-600"}`}>
                {paidNum >= total ? money(paidNum - total) : `kurang ${money(total - paidNum)}`}
              </span>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Pastikan pembayaran {METHOD_LABEL[method]} sebesar Rp {money(total)} sudah berhasil di terminal/aplikasi sebelum konfirmasi.
          </p>
        )}
        {!online && <p className="text-xs text-slate-500">Offline: transaksi disimpan di perangkat dan dikirim otomatis saat online.</p>}
        <button
          className="btn btn-primary w-full py-3 text-base"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            await onPay(method, method === "cash" ? paidNum : total);
          }}
        >
          {busy ? "Menyimpan…" : "Konfirmasi pembayaran"}
        </button>
      </div>
    </Modal>
  );
}

function DiscountModal({ max, online, onClose, onNext }: { max: number; online: boolean; onClose: () => void; onNext: (amount: number) => void }) {
  const [mode, setMode] = useState<"nominal" | "pct">("nominal");
  const [value, setValue] = useState("");
  const n = Number(value.replace(/[^\d.]/g, "")) || 0;
  const amount = Math.round(mode === "pct" ? (max * Math.min(n, 100)) / 100 : n);
  const valid = amount > 0 && amount <= max;
  return (
    <Modal title="Diskon manual" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button className={`btn ${mode === "nominal" ? "btn-primary" : ""}`} onClick={() => setMode("nominal")}>Nominal (Rp)</button>
          <button className={`btn ${mode === "pct" ? "btn-primary" : ""}`} onClick={() => setMode("pct")}>Persen (%)</button>
        </div>
        <input className="input py-2 text-right font-mono text-xl" inputMode="decimal" autoFocus value={value}
          onChange={(e) => setValue(e.target.value)} placeholder="0" />
        <div className="flex justify-between text-sm">
          <span>Diskon</span>
          <span className={`font-mono ${valid || amount === 0 ? "" : "text-red-600"}`}>Rp {money(amount)}</span>
        </div>
        {amount > max && <p className="text-xs text-red-600">Tidak boleh melebihi total belanja setelah promo (Rp {money(max)}).</p>}
        {!online && <p className="text-xs text-amber-700">Diskon manual membutuhkan OTP manajer sehingga harus online.</p>}
        <button className="btn btn-primary w-full py-2" disabled={!valid || !online} onClick={() => onNext(amount)}>
          Minta persetujuan manajer (OTP)
        </button>
      </div>
    </Modal>
  );
}

function CustomerModal({
  current,
  insight,
  cart,
  onClose,
  onSelect,
  onAdd,
}: {
  current: Customer | null;
  insight: Insight | null;
  cart: string[];
  onClose: () => void;
  onSelect: (c: Customer | null, insight: Insight | null) => void;
  onAdd: (productId: string) => void;
}) {
  const [phone, setPhone] = useState(current?.phone ?? "");
  const [name, setName] = useState("");
  const [result, setResult] = useState<Insight | null>(current ? insight : null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("pos_customer_insight", { p_phone: phone, p_cart: cart });
    setBusy(false);
    if (error) return setError(error.message);
    setResult(data);
    setNotFound(!data?.customer);
  };
  const register = async () => {
    setBusy(true);
    setError(null);
    const { error } = await createClient().from("customers").insert({ phone, name: name.trim() });
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "Nomor HP sudah terdaftar" : error.message);
    await lookup();
  };

  const c = result?.customer;
  return (
    <Modal title="Pelanggan (CRM)" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input className="input py-2" inputMode="tel" placeholder="Nomor HP pelanggan, mis. 0812…" value={phone}
            onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} autoFocus />
          <button className="btn btn-primary" onClick={lookup} disabled={busy || phone.replace(/\D/g, "").length < 8}>Cari</button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notFound && (
          <div className="rounded-lg border border-dashed border-slate-300 p-3">
            <p className="mb-2 text-sm">Nomor belum terdaftar. Daftarkan sebagai member baru:</p>
            <div className="flex gap-2">
              <input className="input" placeholder="Nama pelanggan" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary" onClick={register} disabled={busy || !name.trim()}>Daftar</button>
            </div>
          </div>
        )}
        {c && result && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div>
                <div className="text-lg font-semibold">{c.name}</div>
                <div className="text-sm text-slate-500">{c.phone} · {c.email ?? "tanpa email"}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Poin" value={String(c.points_balance)} />
                <Stat label="Kunjungan" value={String(result.stats?.visits ?? 0)} />
                <Stat label="Tier" value={c.tier} />
              </div>
              {c.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">📝 {c.notes}</p>}
              <div>
                <div className="label">Transaksi terakhir</div>
                <ul className="space-y-1 text-xs">
                  {(result.recent ?? []).map((r) => (
                    <li key={r.id} className="rounded bg-slate-50 px-2 py-1">
                      <div className="flex justify-between"><span className="font-mono">{r.sale_no}</span><span className="font-mono">{money(r.total)}</span></div>
                      <div className="text-slate-500">{r.items}</div>
                    </li>
                  ))}
                  {(result.recent ?? []).length === 0 && <li className="text-slate-400">Belum ada transaksi.</li>}
                </ul>
              </div>
            </div>
            <div>
              <div className="label">Rekomendasi upselling</div>
              <ul className="space-y-1">
                {result.recommendations.map((r) => (
                  <li key={r.product_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <div>{r.name} <span className="font-mono text-xs text-slate-500">{money(r.price)}</span></div>
                      <div className="text-[11px] text-slate-500">{r.reason}</div>
                    </div>
                    <button className="btn py-1" onClick={() => onAdd(r.product_id)}>+ Tambah</button>
                  </li>
                ))}
                {result.recommendations.length === 0 && <li className="text-xs text-slate-400">Belum ada rekomendasi.</li>}
              </ul>
              <button className="btn btn-primary mt-4 w-full py-2" onClick={() => onSelect(c, result)}>Gunakan pelanggan ini</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

interface ShiftSummary {
  sales_count: number;
  voided_count: number;
  by_method: Record<string, number>;
  cash_sales: number;
  cash_refunds: number;
  expected_cash: number;
  shift: { opening_cash: number; shift_no: string; opened_at: string };
}

function CloseShiftModal({
  shiftId,
  online,
  pendingCount,
  onClose,
  onClosed,
}: {
  shiftId: string;
  online: boolean;
  pendingCount: number;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    (async () => {
      const { data, error } = await createClient().rpc("pos_shift_summary", { p_shift_id: shiftId });
      if (error) setError(error.message);
      else setSummary(data as ShiftSummary);
    })();
  }, [shiftId, online]);

  const actualNum = Number(actual.replace(/\D/g, "")) || 0;
  const variance = summary ? actualNum - Number(summary.expected_cash) : 0;

  const close = async () => {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("pos_close_shift", { p_actual_cash: actualNum, p_note: note });
    setBusy(false);
    if (error) return setError(error.message);
    onClosed();
  };

  return (
    <Modal title="Tutup shift" onClose={onClose}>
      {!online ? (
        <p className="text-sm text-amber-700">Tutup shift membutuhkan koneksi internet.</p>
      ) : pendingCount > 0 ? (
        <p className="text-sm text-amber-700">Masih ada {pendingCount} transaksi di antrean. Sinkronkan dulu sebelum menutup shift.</p>
      ) : !summary ? (
        <p className="text-sm text-slate-500">{error ?? "Memuat ringkasan…"}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <Line label="Kas awal" value={Number(summary.shift.opening_cash)} />
            <Line label={`Penjualan tunai (${summary.sales_count} trx)`} value={Number(summary.cash_sales)} />
            {Number(summary.cash_refunds) > 0 && <Line label="Refund tunai" value={-Number(summary.cash_refunds)} />}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <span>Kas seharusnya</span>
              <span className="font-mono">{money(summary.expected_cash)}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Non-tunai:{" "}
            {Object.entries(summary.by_method)
              .filter(([m]) => m !== "cash")
              .map(([m, v]) => `${METHOD_LABEL[m]} ${money(v)}`)
              .join(" · ") || "-"}
          </div>
          <div>
            <label className="label" htmlFor="actual">Kas aktual di laci (Rp)</label>
            <input id="actual" className="input py-2 text-right font-mono text-xl" inputMode="numeric" value={actual}
              onChange={(e) => setActual(e.target.value.replace(/\D/g, ""))} autoFocus />
          </div>
          {actual && (
            <div className={`flex justify-between font-semibold ${variance === 0 ? "text-green-700" : "text-red-600"}`}>
              <span>Selisih</span>
              <span className="font-mono">{variance === 0 ? "0 (sesuai)" : money(variance)}</span>
            </div>
          )}
          <input className="input" placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn btn-primary w-full py-2" disabled={busy || !actual} onClick={close}>
            {busy ? "Menutup…" : "Tutup shift"}
          </button>
          <p className="text-[11px] text-slate-500">Selisih kas otomatis dijurnal ke akun Selisih Kas.</p>
        </div>
      )}
    </Modal>
  );
}
