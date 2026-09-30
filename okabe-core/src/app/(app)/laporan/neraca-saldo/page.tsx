import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { DateRangeForm, readRange } from "@/components/report-parts";
import { flattenTree, getAccounts, getActivity } from "@/lib/data";
import { fmtDate, money, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Neraca Saldo" };

export default async function TrialBalancePage({ searchParams }: PageProps<"/laporan/neraca-saldo">) {
  const { from, to } = readRange(await searchParams, todayISO());
  const [accounts, activity] = await Promise.all([getAccounts(), getActivity(from, to)]);

  const rows = flattenTree(accounts)
    .filter(({ account }) => account.is_postable && activity.has(account.id))
    .map(({ account }) => {
      const a = activity.get(account.id)!;
      const closing = a.opening + a.period_debit - a.period_credit;
      return { account, ...a, closing };
    })
    .filter((r) => r.opening || r.period_debit || r.period_credit);

  const t = rows.reduce(
    (s, r) => ({
      od: s.od + Math.max(r.opening, 0),
      oc: s.oc + Math.max(-r.opening, 0),
      d: s.d + r.period_debit,
      c: s.c + r.period_credit,
      cd: s.cd + Math.max(r.closing, 0),
      cc: s.cc + Math.max(-r.closing, 0),
    }),
    { od: 0, oc: 0, d: 0, c: 0, cd: 0, cc: 0 },
  );
  const balanced = Math.abs(t.cd - t.cc) < 0.005 && Math.abs(t.d - t.c) < 0.005;
  const q = `dari=${from}&sampai=${to}`;

  return (
    <>
      <PageHeader
        title="Neraca Saldo"
        subtitle={`Periode ${fmtDate(from)} – ${fmtDate(to)} · real-time dari jurnal Posted`}
        actions={<PrintButton />}
      />
      <DateRangeForm from={from} to={to} />
      <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${balanced ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
        {balanced ? "✓ Seimbang: total Debit = total Kredit" : "Neraca saldo tidak seimbang"}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[860px]">
          <thead>
            <tr>
              <th rowSpan={2}>Akun</th>
              <th colSpan={2} className="text-center">Saldo awal</th>
              <th colSpan={2} className="text-center">Mutasi</th>
              <th colSpan={2} className="text-center">Saldo akhir</th>
            </tr>
            <tr>
              {["Debit", "Kredit", "Debit", "Kredit", "Debit", "Kredit"].map((h, i) => (
                <th key={i} className="text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id} className="hover:bg-slate-50">
                <td>
                  <Link className="hover:underline" href={`/laporan/buku-besar?akun=${r.account.id}&${q}`}>
                    <span className="mr-2 font-mono text-xs text-slate-400">{r.account.code}</span>
                    {r.account.name}
                  </Link>
                </td>
                <td className="num">{money(Math.max(r.opening, 0), { blankZero: true })}</td>
                <td className="num">{money(Math.max(-r.opening, 0), { blankZero: true })}</td>
                <td className="num">{money(r.period_debit, { blankZero: true })}</td>
                <td className="num">{money(r.period_credit, { blankZero: true })}</td>
                <td className="num font-medium">{money(Math.max(r.closing, 0), { blankZero: true })}</td>
                <td className="num font-medium">{money(Math.max(-r.closing, 0), { blankZero: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td className="px-3 py-2">TOTAL</td>
              {[t.od, t.oc, t.d, t.c, t.cd, t.cc].map((v, i) => (
                <td key={i} className="num px-3 py-2">{money(v)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
