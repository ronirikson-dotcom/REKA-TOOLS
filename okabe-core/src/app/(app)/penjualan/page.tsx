import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { METHOD_LABEL, fmtDateTime, money, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Penjualan POS" };

interface Row {
  id: string;
  sale_no: string;
  sold_at: string;
  total: number;
  payment_method: string;
  status: string;
  offline: boolean;
  price_mismatch: boolean;
  fulfillment_status: string;
  cashier_id: string;
  customers: { name: string } | null;
  pos_returns: { refund_amount: number }[];
}

const FULFILL: Record<string, string> = { preparing: "Disiapkan", ready: "Siap", completed: "Selesai" };

export default async function SalesPage({ searchParams }: PageProps<"/penjualan">) {
  const sp = await searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = todayISO();
  const from = typeof sp.dari === "string" && iso.test(sp.dari) ? sp.dari : today;
  const to = typeof sp.sampai === "string" && iso.test(sp.sampai) ? sp.sampai : today;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const { supabase } = await getSession();
  let query = supabase
    .from("pos_sales")
    .select("id, sale_no, sold_at, total, payment_method, status, offline, price_mismatch, fulfillment_status, cashier_id, customers(name), pos_returns(refund_amount)")
    .gte("sold_at", `${from}T00:00:00+07:00`)
    .lte("sold_at", `${to}T23:59:59.999+07:00`)
    .order("sold_at", { ascending: false })
    .limit(500);
  if (q) query = query.ilike("sale_no", `%${q.replace(/[%,]/g, "")}%`);
  const [{ data, error }, { data: people }] = await Promise.all([query, supabase.from("profiles").select("id, full_name, email")]);
  const rows = (data ?? []) as unknown as Row[];
  const who = (id: string) => {
    const p = people?.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "-";
  };

  const done = rows.filter((r) => r.status === "completed");
  const gross = done.reduce((s, r) => s + Number(r.total), 0);
  const refunds = done.reduce((s, r) => s + r.pos_returns.reduce((a, x) => a + Number(x.refund_amount), 0), 0);
  const byMethod = done.reduce<Record<string, number>>((m, r) => ({ ...m, [r.payment_method]: (m[r.payment_method] ?? 0) + Number(r.total) }), {});

  return (
    <>
      <PageHeader title="Penjualan POS" subtitle="Transaksi kasir, termasuk yang tersinkron dari mode offline." />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="dari">Dari</label>
          <input id="dari" type="date" name="dari" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sampai">Sampai</label>
          <input id="sampai" type="date" name="sampai" defaultValue={to} className="input" />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">No. transaksi</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="POS…" />
        </div>
        <button className="btn btn-primary">Tampilkan</button>
      </form>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Kpi label="Penjualan bersih" value={`Rp ${money(gross - refunds)}`} />
        <Kpi label="Transaksi" value={`${done.length}${rows.length - done.length ? ` (+${rows.length - done.length} void)` : ""}`} />
        <Kpi label="Retur" value={`Rp ${money(refunds)}`} />
        <Kpi label="Per metode" value={Object.entries(byMethod).map(([m, v]) => `${METHOD_LABEL[m]} ${money(v)}`).join(" · ") || "-"} small />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[820px]">
          <thead>
            <tr>
              <th>No</th><th>Waktu</th><th>Kasir</th><th>Pelanggan</th><th>Metode</th><th className="text-right">Total</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">Belum ada transaksi.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="font-mono whitespace-nowrap"><Link className="link" href={`/penjualan/${r.id}`}>{r.sale_no}</Link></td>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(r.sold_at)}</td>
                <td className="text-xs">{who(r.cashier_id)}</td>
                <td className="text-xs">{r.customers?.name ?? "-"}</td>
                <td className="text-xs">{METHOD_LABEL[r.payment_method]}</td>
                <td className={`num ${r.status === "voided" ? "text-slate-400 line-through" : ""}`}>{money(r.total)}</td>
                <td className="space-x-1 whitespace-nowrap">
                  {r.status === "voided" ? (
                    <span className="badge bg-red-100 text-red-700">Void</span>
                  ) : (
                    <span className="badge bg-green-100 text-green-800">{FULFILL[r.fulfillment_status]}</span>
                  )}
                  {r.pos_returns.length > 0 && <span className="badge bg-amber-100 text-amber-800">Retur</span>}
                  {r.offline && <span className="badge bg-slate-100 text-slate-600">Offline</span>}
                  {r.price_mismatch && <span className="badge bg-orange-100 text-orange-800" title="Total di perangkat berbeda dengan hitungan server">Selisih harga</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold ${small ? "text-xs" : "font-mono text-lg"}`}>{value}</div>
    </div>
  );
}
