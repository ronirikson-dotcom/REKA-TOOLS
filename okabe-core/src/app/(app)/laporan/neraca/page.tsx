import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { AccountTreeRows, DateRangeForm, SectionRow, TotalRow, readRange } from "@/components/report-parts";
import { EPOCH, closingDebit, getAccounts, getActivity, rollup } from "@/lib/data";
import { fmtDate, money, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Neraca" };

export default async function BalanceSheetPage({ searchParams }: PageProps<"/laporan/neraca">) {
  const { to } = readRange(await searchParams, todayISO());
  const [accounts, activity] = await Promise.all([getAccounts(), getActivity(EPOCH, to)]);

  const bal = (id: string) => closingDebit(activity.get(id));
  const assets = rollup(accounts.filter((a) => a.type === "asset"), (a) => bal(a.id));
  const liabilities = rollup(accounts.filter((a) => a.type === "liability"), (a) => -bal(a.id));
  const equity = rollup(accounts.filter((a) => a.type === "equity"), (a) => -bal(a.id));
  const leafSum = (type: string, m: Map<string, number>) =>
    accounts.filter((a) => a.type === type && a.is_postable).reduce((s, a) => s + (m.get(a.id) ?? 0), 0);

  const totalAssets = leafSum("asset", assets);
  const totalLiabilities = leafSum("liability", liabilities);
  const totalEquityAccounts = leafSum("equity", equity);
  // Laba berjalan = akumulasi pendapatan − beban yang belum ditutup ke Laba Ditahan.
  const currentEarnings = accounts
    .filter((a) => (a.type === "revenue" || a.type === "expense") && a.is_postable)
    .reduce((s, a) => s - bal(a.id), 0);
  const totalEquity = totalEquityAccounts + currentEarnings;
  const diff = Math.round((totalAssets - totalLiabilities - totalEquity) * 100) / 100;
  const q = `sampai=${to}`;

  return (
    <>
      <PageHeader title="Neraca" subtitle={`Per ${fmtDate(to)} · real-time dari jurnal Posted`} actions={<PrintButton />} />
      <DateRangeForm to={to} single />
      <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${diff === 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
        {diff === 0 ? "✓ Neraca seimbang: Aset = Kewajiban + Ekuitas" : `Neraca tidak seimbang, selisih ${money(diff)}`}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto p-2">
          <table className="tbl">
            <tbody>
              <SectionRow label="Aset" />
              <AccountTreeRows accounts={accounts} types={["asset"]} values={assets} ledgerQuery={q} />
              <TotalRow label="TOTAL ASET" value={totalAssets} strong />
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto p-2">
          <table className="tbl">
            <tbody>
              <SectionRow label="Kewajiban" />
              <AccountTreeRows accounts={accounts} types={["liability"]} values={liabilities} ledgerQuery={q} />
              <TotalRow label="Total Kewajiban" value={totalLiabilities} />
              <SectionRow label="Ekuitas" />
              <AccountTreeRows accounts={accounts} types={["equity"]} values={equity} ledgerQuery={q} />
              <tr>
                <td>
                  <span className="mr-2 font-mono text-xs text-slate-400">—</span>Laba (Rugi) Berjalan
                </td>
                <td className="num">{money(currentEarnings)}</td>
              </tr>
              <TotalRow label="Total Ekuitas" value={totalEquity} />
              <TotalRow label="TOTAL KEWAJIBAN + EKUITAS" value={totalLiabilities + totalEquity} strong />
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Laba (Rugi) Berjalan adalah akumulasi pendapatan dikurangi beban sampai tanggal laporan yang belum dipindahkan ke Laba Ditahan.
      </p>
    </>
  );
}
