import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EPOCH, canManagePos, canWrite, getActivity, getSession } from "@/lib/data";
import { money, todayISO } from "@/lib/format";
import type { Product } from "@/lib/pos/types";

export const metadata: Metadata = { title: "Produk & Stok" };

export default async function ProductsPage({ searchParams }: PageProps<"/produk">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const { supabase, role } = await getSession();
  const [{ data }, { data: invAcc }] = await Promise.all([
    supabase.from("products").select("*").order("category").order("name"),
    supabase.from("accounts").select("id").eq("code", "1140").maybeSingle(),
  ]);
  const all = (data ?? []) as Product[];
  const rows = all.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q);
  const stockValue = all.reduce((s, p) => s + Math.round(Number(p.stock_qty) * Number(p.avg_cost) * 100) / 100, 0);

  let glValue: number | null = null;
  if (role !== "cashier" && invAcc) {
    const act = await getActivity(EPOCH, todayISO());
    const a = act.get(invAcc.id);
    glValue = a ? a.opening + a.period_debit - a.period_credit : 0;
  }
  const manage = canManagePos(role) || canWrite(role);

  return (
    <>
      <PageHeader
        title="Produk & Stok"
        subtitle="Stok dan HPP rata-rata tertimbang (moving average) berubah otomatis dari penerimaan, penjualan, void, dan retur."
        actions={
          manage && (
            <>
              <Link className="btn" href="/produk/terima">+ Terima stok</Link>
              <Link className="btn btn-primary" href="/produk/baru">+ Produk baru</Link>
            </>
          )
        }
      />
      {glValue !== null && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${Math.abs(glValue - stockValue) < 1 ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
          Nilai stok (qty × HPP rata-rata) Rp {money(stockValue)} · saldo akun Persediaan (1140) Rp {money(glValue)}{" "}
          {Math.abs(glValue - stockValue) < 1 ? "✓ cocok" : `· selisih ${money(glValue - stockValue)}`}
        </div>
      )}
      <form className="mb-4 flex gap-2">
        <input className="input max-w-sm" name="q" defaultValue={q} placeholder="Cari nama, SKU, barcode…" />
        <button className="btn">Cari</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead>
            <tr>
              <th>SKU</th><th>Nama</th><th>Kategori</th><th className="text-right">Harga jual</th>
              {role !== "cashier" && <th className="text-right">HPP rata-rata</th>}
              <th className="text-right">Stok</th>
              {role !== "cashier" && <th className="text-right">Nilai stok</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.is_active ? "hover:bg-slate-50" : "text-slate-400"}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td>
                  <Link className="hover:underline" href={`/produk/${p.id}`}>{p.name}</Link>
                  {!p.is_active && <span className="badge ml-2 bg-slate-100">Nonaktif</span>}
                </td>
                <td className="text-xs">{p.category}</td>
                <td className="num">{money(p.price)}</td>
                {role !== "cashier" && <td className="num">{money(Number(p.avg_cost))}</td>}
                <td className={`num ${Number(p.stock_qty) <= 5 ? "font-semibold text-red-600" : ""}`}>{Number(p.stock_qty)} {p.unit}</td>
                {role !== "cashier" && <td className="num">{money(Number(p.stock_qty) * Number(p.avg_cost))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
