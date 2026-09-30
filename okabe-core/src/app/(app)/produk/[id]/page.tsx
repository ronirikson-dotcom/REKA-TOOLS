import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canManagePos, canWrite, getSession } from "@/lib/data";
import { fmtDateTime, money } from "@/lib/format";
import type { Product } from "@/lib/pos/types";
import { ProductForm } from "../product-form";
import { saveProduct } from "../actions";

export const metadata: Metadata = { title: "Kartu Stok" };

const REF: Record<string, string> = {
  opening: "Saldo awal",
  stock_receipt: "Penerimaan",
  pos_sale: "Penjualan POS",
  pos_void: "Void POS",
  pos_return: "Retur POS",
};

export default async function ProductPage({ params }: PageProps<"/produk/[id]">) {
  const { id } = await params;
  const { supabase, role } = await getSession();
  const [{ data: product }, { data: moves }, { data: cats }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("stock_movements").select("*").eq("product_id", id).order("id", { ascending: false }).limit(100),
    supabase.from("products").select("category"),
  ]);
  if (!product) notFound();
  const p = product as Product;
  const categories = [...new Set((cats ?? []).map((d) => d.category).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`${p.sku} · stok ${Number(p.stock_qty)} ${p.unit}${role !== "cashier" ? ` · HPP rata-rata Rp ${money(Number(p.avg_cost))}` : ""}`}
      />
      <ProductForm product={p} categories={categories} action={saveProduct.bind(null, id)} readOnly={!canManagePos(role) && !canWrite(role)} />
      <h2 className="mb-2 mt-6 font-semibold">Kartu stok</h2>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr><th>Waktu</th><th>Transaksi</th><th>Referensi</th><th className="text-right">Masuk</th><th className="text-right">Keluar</th><th className="text-right">Saldo</th>{role !== "cashier" && <th className="text-right">Biaya/unit</th>}</tr>
          </thead>
          <tbody>
            {(moves ?? []).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(m.moved_at)}</td>
                <td className="text-xs">{REF[m.ref_type] ?? m.ref_type}</td>
                <td className="font-mono text-xs">
                  {m.journal_entry_id ? <Link className="link" href={`/jurnal/${m.journal_entry_id}`}>{m.ref_no}</Link> : m.ref_no}
                </td>
                <td className="num">{Number(m.qty) > 0 ? Number(m.qty) : ""}</td>
                <td className="num">{Number(m.qty) < 0 ? -Number(m.qty) : ""}</td>
                <td className="num font-medium">{Number(m.balance_qty)}</td>
                {role !== "cashier" && <td className="num">{money(Number(m.unit_cost))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
