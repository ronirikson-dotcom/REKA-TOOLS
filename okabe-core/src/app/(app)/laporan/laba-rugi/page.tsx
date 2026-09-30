import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { AccountTreeRows, DateRangeForm, SectionRow, TotalRow, readRange } from "@/components/report-parts";
import { getAccounts, getActivity, rollup } from "@/lib/data";
import { fmtDate, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Laba / Rugi" };

export default async function ProfitLossPage({ searchParams }: PageProps<"/laporan/laba-rugi">) {
  const { from, to } = readRange(await searchParams, todayISO());
  const [accounts, activity] = await Promise.all([getAccounts(), getActivity(from, to)]);

  const movement = (id: string) => {
    const a = activity.get(id);
    return a ? a.period_debit - a.period_credit : 0;
  };
  const revenue = rollup(accounts.filter((a) => a.type === "revenue"), (a) => -movement(a.id));
  const expense = rollup(accounts.filter((a) => a.type === "expense"), (a) => movement(a.id));
  const sumLeaf = (type: "revenue" | "expense", m: Map<string, number>) =>
    accounts.filter((a) => a.type === type && a.is_postable).reduce((s, a) => s + (m.get(a.id) ?? 0), 0);
  const totalRevenue = sumLeaf("revenue", revenue);
  const totalExpense = sumLeaf("expense", expense);
  const q = `dari=${from}&sampai=${to}`;

  return (
    <>
      <PageHeader
        title="Laporan Laba / Rugi"
        subtitle={`Periode ${fmtDate(from)} – ${fmtDate(to)} · real-time dari jurnal Posted`}
        actions={<PrintButton />}
      />
      <DateRangeForm from={from} to={to} />
      <div className="card overflow-x-auto p-2">
        <table className="tbl">
          <tbody>
            <SectionRow label="Pendapatan" />
            <AccountTreeRows accounts={accounts} types={["revenue"]} values={revenue} ledgerQuery={q} />
            <TotalRow label="Total Pendapatan" value={totalRevenue} />
            <SectionRow label="Beban" />
            <AccountTreeRows accounts={accounts} types={["expense"]} values={expense} ledgerQuery={q} />
            <TotalRow label="Total Beban" value={totalExpense} />
            <tr><td colSpan={2} className="border-0 py-2" /></tr>
            <TotalRow label={totalRevenue - totalExpense >= 0 ? "LABA BERSIH" : "RUGI BERSIH"} value={totalRevenue - totalExpense} strong />
          </tbody>
        </table>
      </div>
    </>
  );
}
