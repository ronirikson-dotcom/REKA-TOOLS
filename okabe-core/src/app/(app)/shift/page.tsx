import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { fmtDateTime, money } from "@/lib/format";
import type { Shift } from "@/lib/pos/types";

export const metadata: Metadata = { title: "Shift Kasir" };

export default async function ShiftsPage() {
  const { supabase, role } = await getSession();
  if (role === "cashier") redirect("/pos");
  const [{ data }, { data: people }, { data: sales }] = await Promise.all([
    supabase.from("pos_shifts").select("*").order("opened_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("pos_sales").select("shift_id, total, status"),
  ]);
  const who = (id: string) => people?.find((p) => p.id === id)?.full_name ?? "-";
  const totals = new Map<string, { n: number; total: number }>();
  for (const s of sales ?? []) {
    if (s.status !== "completed") continue;
    const t = totals.get(s.shift_id) ?? { n: 0, total: 0 };
    t.n += 1;
    t.total += Number(s.total);
    totals.set(s.shift_id, t);
  }

  return (
    <>
      <PageHeader title="Shift Kasir" subtitle="Rekap buka/tutup kas per kasir. Selisih kas dijurnal otomatis ke akun Selisih Kas saat tutup shift." />
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[900px]">
          <thead>
            <tr><th>Shift</th><th>Kasir</th><th>Dibuka</th><th>Ditutup</th><th className="text-right">Trx</th><th className="text-right">Penjualan</th><th className="text-right">Kas awal</th><th className="text-right">Kas seharusnya</th><th className="text-right">Kas aktual</th><th className="text-right">Selisih</th><th>Status</th></tr>
          </thead>
          <tbody>
            {((data ?? []) as (Shift & { variance_journal_id: string | null })[]).map((s) => (
              <tr key={s.id}>
                <td className="font-mono text-xs">{s.shift_no}</td>
                <td className="text-xs">{who(s.cashier_id)}</td>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(s.opened_at)}</td>
                <td className="whitespace-nowrap text-xs">{s.closed_at ? fmtDateTime(s.closed_at) : "-"}</td>
                <td className="num">{totals.get(s.id)?.n ?? 0}</td>
                <td className="num">{money(totals.get(s.id)?.total ?? 0)}</td>
                <td className="num">{money(s.opening_cash)}</td>
                <td className="num">{s.expected_cash !== null ? money(s.expected_cash) : "-"}</td>
                <td className="num">{s.actual_cash !== null ? money(s.actual_cash) : "-"}</td>
                <td className={`num ${Number(s.variance) < 0 ? "text-red-600" : Number(s.variance) > 0 ? "text-amber-700" : ""}`}>
                  {s.variance !== null ? (s.variance_journal_id ? <Link className="hover:underline" href={`/jurnal/${s.variance_journal_id}`}>{money(s.variance)}</Link> : money(s.variance)) : "-"}
                </td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
