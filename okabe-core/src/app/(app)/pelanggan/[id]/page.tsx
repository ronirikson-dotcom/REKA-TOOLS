import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { fmtDateTime, money } from "@/lib/format";
import type { Customer } from "@/lib/pos/types";
import { CustomerForm } from "../customer-form";
import { saveCustomer } from "../actions";

export const metadata: Metadata = { title: "Detail Pelanggan" };

export default async function CustomerPage({ params }: PageProps<"/pelanggan/[id]">) {
  const { id } = await params;
  const { supabase } = await getSession();
  const [{ data: c }, { data: sales }, { data: points }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("pos_sales").select("id, sale_no, sold_at, total, status").eq("customer_id", id).order("sold_at", { ascending: false }).limit(30),
    supabase.from("point_ledger").select("*").eq("customer_id", id).order("id", { ascending: false }).limit(30),
  ]);
  if (!c) notFound();
  const { data: detail } = await supabase.rpc("pos_customer_insight", { p_phone: (c as Customer).phone, p_cart: [] });

  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.phone} · ${c.tier} · ${c.points_balance} poin`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CustomerForm customer={c as Customer} action={saveCustomer.bind(null, id)} />
        </div>
        <div className="card p-4 text-sm">
          <div className="label">Favorit</div>
          <ul className="mb-3 space-y-1">
            {(detail?.favorites ?? []).map((f: { product_id: string; name: string; qty: number }) => (
              <li key={f.product_id} className="flex justify-between"><span>{f.name}</span><span className="font-mono">{Number(f.qty)}</span></li>
            ))}
            {(detail?.favorites ?? []).length === 0 && <li className="text-slate-400">Belum ada.</li>}
          </ul>
          <div className="label">Rekomendasi upselling</div>
          <ul className="space-y-1">
            {(detail?.recommendations ?? []).map((r: { product_id: string; name: string; reason: string }) => (
              <li key={r.product_id}>{r.name} <div className="text-[11px] text-slate-500">{r.reason}</div></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-2 font-semibold">Histori transaksi</div>
          <table className="tbl">
            <tbody>
              {(sales ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs"><Link className="link" href={`/penjualan/${s.id}`}>{s.sale_no}</Link></td>
                  <td className="text-xs">{fmtDateTime(s.sold_at)}</td>
                  <td className={`num ${s.status === "voided" ? "text-slate-400 line-through" : ""}`}>{money(s.total)}</td>
                </tr>
              ))}
              {(sales ?? []).length === 0 && <tr><td className="py-6 text-center text-slate-400">Belum ada transaksi.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-2 font-semibold">Mutasi poin</div>
          <table className="tbl">
            <tbody>
              {(points ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="text-xs">{fmtDateTime(p.created_at)}</td>
                  <td className="text-xs">{p.note}</td>
                  <td className={`num ${p.points < 0 ? "text-red-600" : "text-green-700"}`}>{p.points > 0 ? "+" : ""}{p.points}</td>
                  <td className="num">{p.balance}</td>
                </tr>
              ))}
              {(points ?? []).length === 0 && <tr><td className="py-6 text-center text-slate-400">Belum ada mutasi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
