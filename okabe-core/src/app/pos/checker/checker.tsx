"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/components/pos/hooks";

interface Order {
  id: string;
  sale_no: string;
  sold_at: string;
  fulfillment_status: "preparing" | "ready" | "completed";
  fulfillment_updated_at: string | null;
  customers: { name: string } | null;
  pos_sale_items: { product_name: string; qty: number; line_no: number }[];
}

/** Layar penyiapan barang (POS-03): Preparing → Ready → Completed, diperbarui tiap 5 detik. */
export function Checker({ canUpdate }: { canUpdate: boolean }) {
  const online = useOnline();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
    const { data, error } = await createClient()
      .from("pos_sales")
      .select("id, sale_no, sold_at, fulfillment_status, fulfillment_updated_at, customers(name), pos_sale_items(product_name, qty, line_no)")
      .eq("status", "completed")
      .in("fulfillment_status", ["preparing", "ready"])
      .gte("sold_at", since)
      .order("sold_at");
    if (error) return setError(error.message);
    setError(null);
    setOrders((data ?? []) as unknown as Order[]);
    setUpdated(new Date());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling data eksternal
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const move = async (id: string, status: "ready" | "completed") => {
    setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, fulfillment_status: status } : o)).filter((o) => o.fulfillment_status !== "completed"));
    const { error } = await createClient().rpc("pos_set_fulfillment", { p_sale_id: id, p_status: status });
    if (error) setError(error.message);
    load();
  };

  const col = (status: "preparing" | "ready") => orders.filter((o) => o.fulfillment_status === status);

  return (
    <div className="min-h-screen bg-slate-900 p-4 text-white">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Checker Display</h1>
          <p className="text-xs text-slate-400">
            {online ? "Online" : "Offline — menampilkan data terakhir"} · diperbarui{" "}
            {updated ? updated.toLocaleTimeString("id-ID") : "-"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn border-slate-700 bg-slate-800 text-white hover:bg-slate-700" href="/pos">← Kasir</Link>
        </div>
      </header>
      {error && <p className="mb-3 rounded-lg bg-red-900/60 px-3 py-2 text-sm">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(["preparing", "ready"] as const).map((status) => (
          <section key={status}>
            <h2 className={`mb-3 rounded-lg px-3 py-2 text-lg font-bold ${status === "preparing" ? "bg-amber-500 text-slate-900" : "bg-green-500 text-slate-900"}`}>
              {status === "preparing" ? "SEDANG DISIAPKAN" : "SIAP DIAMBIL"} ({col(status).length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {col(status).map((o) => {
                const mins = updated ? Math.max(0, Math.floor((updated.getTime() - new Date(o.sold_at).getTime()) / 60000)) : 0;
                return (
                  <div key={o.id} className="rounded-xl bg-slate-800 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-2xl font-bold">#{o.sale_no.slice(-4)}</span>
                      <span className={`text-xs ${mins >= 10 && status === "preparing" ? "text-red-400" : "text-slate-400"}`}>{mins} mnt</span>
                    </div>
                    {o.customers && <div className="text-sm text-slate-300">{o.customers.name}</div>}
                    <ul className="my-2 space-y-0.5 text-sm">
                      {[...o.pos_sale_items].sort((a, b) => a.line_no - b.line_no).map((i) => (
                        <li key={i.line_no}><b>{Number(i.qty)}×</b> {i.product_name}</li>
                      ))}
                    </ul>
                    {canUpdate && (
                      <button
                        className={`w-full rounded-lg py-2 font-semibold ${status === "preparing" ? "bg-green-500 text-slate-900" : "bg-slate-600"}`}
                        onClick={() => move(o.id, status === "preparing" ? "ready" : "completed")}
                      >
                        {status === "preparing" ? "Tandai SIAP" : "Selesai / diambil"}
                      </button>
                    )}
                  </div>
                );
              })}
              {col(status).length === 0 && <p className="text-sm text-slate-500">Tidak ada pesanan.</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
