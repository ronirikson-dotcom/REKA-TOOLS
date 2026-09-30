import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { fmtDate, money } from "@/lib/format";

export const metadata: Metadata = { title: "Pelanggan" };

export default async function CustomersPage({ searchParams }: PageProps<"/pelanggan">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const { supabase, role } = await getSession();
  let query = supabase.from("customers").select("*, pos_sales(total, sold_at, status)").order("name").limit(300);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe.replace(/^0/, "62")}%`);
  }
  const { data } = await query;
  const rows = (data ?? []).map((c) => {
    const sales = (c.pos_sales as { total: number; sold_at: string; status: string }[]).filter((s) => s.status === "completed");
    return {
      ...c,
      visits: sales.length,
      spend: sales.reduce((s, x) => s + Number(x.total), 0),
      last: sales.map((s) => s.sold_at).sort().at(-1) ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Pelanggan (CRM)"
        subtitle="Profil member, histori transaksi, dan saldo poin. Poin didapat otomatis dari transaksi kasir."
        actions={role !== "viewer" && <Link className="btn btn-primary" href="/pelanggan/baru">+ Pelanggan</Link>}
      />
      <form className="mb-4 flex gap-2">
        <input className="input max-w-sm" name="q" defaultValue={q} placeholder="Cari nama atau nomor HP…" />
        <button className="btn">Cari</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[700px]">
          <thead><tr><th>Nama</th><th>Nomor HP</th><th>Level</th><th className="text-right">Poin</th><th className="text-right">Kunjungan</th><th className="text-right">Total belanja</th><th>Terakhir</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td><Link className="link" href={`/pelanggan/${c.id}`}>{c.name}</Link></td>
                <td className="font-mono text-xs">{c.phone}</td>
                <td className="text-xs">{c.tier}</td>
                <td className="num">{c.points_balance}</td>
                <td className="num">{c.visits}</td>
                <td className="num">{money(c.spend)}</td>
                <td className="text-xs">{c.last ? fmtDate(c.last) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
