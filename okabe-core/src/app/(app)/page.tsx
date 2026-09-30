import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/page-header";
import { EPOCH, canWrite, closingDebit, getAccounts, getActivity, getSession } from "@/lib/data";
import { fmtDate, money, periodLabel, sourceLabel, todayISO } from "@/lib/format";
import type { FiscalPeriod, JournalEntry } from "@/lib/types";

export default async function DashboardPage() {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const { supabase, profile, role } = await getSession();
  const [accounts, allTime, month, { data: recent }, { count: drafts }, { data: periods }] = await Promise.all([
    getAccounts(),
    getActivity(EPOCH, today),
    getActivity(monthStart, today),
    supabase.from("journal_entries").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("fiscal_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false }).limit(4),
  ]);

  const leaf = accounts.filter((a) => a.is_postable);
  const cash = leaf.filter((a) => a.is_cash).reduce((s, a) => s + closingDebit(allTime.get(a.id)), 0);
  const mv = (id: string) => {
    const x = month.get(id);
    return x ? x.period_debit - x.period_credit : 0;
  };
  const revenue = leaf.filter((a) => a.type === "revenue").reduce((s, a) => s - mv(a.id), 0);
  const expense = leaf.filter((a) => a.type === "expense").reduce((s, a) => s + mv(a.id), 0);
  const receivable = leaf.filter((a) => a.code === "1130").reduce((s, a) => s + closingDebit(allTime.get(a.id)), 0);

  const kpis = [
    { label: "Saldo Kas & Bank", value: money(cash), href: "/laporan/arus-kas" },
    { label: `Pendapatan ${periodLabel(+today.slice(0, 4), +today.slice(5, 7))}`, value: money(revenue), href: "/laporan/laba-rugi" },
    { label: "Laba bersih bulan ini", value: money(revenue - expense), href: "/laporan/laba-rugi" },
    { label: "Piutang Usaha", value: money(receivable), href: "/laporan/neraca" },
  ];

  return (
    <>
      <PageHeader
        title={`Selamat datang, ${profile?.full_name ?? "Pengguna"}`}
        subtitle={`Ringkasan per ${fmtDate(today)} — seluruh angka real-time dari jurnal Posted.`}
        actions={canWrite(role) && <Link href="/jurnal/baru" className="btn btn-primary">+ Jurnal umum</Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="card p-4 hover:border-brand-500">
            <div className="text-xs font-medium text-slate-500">{k.label}</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums">Rp {k.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">Jurnal terbaru</h2>
            <Link href="/jurnal" className="text-sm link">Semua jurnal →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <tbody>
                {((recent ?? []) as JournalEntry[]).map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="font-mono whitespace-nowrap">
                      <Link href={`/jurnal/${e.id}`} className="link">{e.entry_no}</Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                    <td>
                      {e.description}
                      <div className="text-xs text-slate-500">{sourceLabel(e.source_type)}</div>
                    </td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Perlu perhatian</h2>
            {drafts ? (
              <Link href="/jurnal?status=draft" className="block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100">
                {drafts} jurnal masih draft (belum masuk laporan) →
              </Link>
            ) : (
              <p className="text-sm text-slate-500">Tidak ada jurnal draft.</p>
            )}
          </div>
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Periode</h2>
              <Link href="/periode" className="text-sm link">Kelola →</Link>
            </div>
            <ul className="space-y-1.5 text-sm">
              {((periods ?? []) as FiscalPeriod[]).map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{periodLabel(p.year, p.month)}</span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
