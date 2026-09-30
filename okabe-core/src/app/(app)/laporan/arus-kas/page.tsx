import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { DateRangeForm, SectionRow, TotalRow, readRange } from "@/components/report-parts";
import { getAccounts, getActivity, getSession } from "@/lib/data";
import { CASH_FLOW_LABEL, fmtDate, money, todayISO } from "@/lib/format";
import type { CashFlowCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Arus Kas" };

type Row = { category: CashFlowCategory; account_id: string; amount: number };

export default async function CashFlowPage({ searchParams }: PageProps<"/laporan/arus-kas">) {
  const { from, to } = readRange(await searchParams, todayISO());
  const { supabase } = await getSession();
  const [accounts, activity, { data, error }] = await Promise.all([
    getAccounts(),
    getActivity(from, to),
    supabase.rpc("cash_flow", { p_from: from, p_to: to }),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const flows = ((data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount) }));

  const cashAccounts = accounts.filter((a) => a.is_cash);
  const opening = cashAccounts.reduce((s, a) => s + (activity.get(a.id)?.opening ?? 0), 0);
  const closing = cashAccounts.reduce((s, a) => {
    const x = activity.get(a.id);
    return s + (x ? x.opening + x.period_debit - x.period_credit : 0);
  }, 0);
  const cats: CashFlowCategory[] = ["operating", "investing", "financing"];
  const totals = Object.fromEntries(
    cats.map((c) => [c, flows.filter((f) => f.category === c).reduce((s, f) => s + f.amount, 0)]),
  ) as Record<CashFlowCategory, number>;
  const net = totals.operating + totals.investing + totals.financing;
  const reconciled = Math.abs(opening + net - closing) < 0.005;
  const q = `dari=${from}&sampai=${to}`;

  return (
    <>
      <PageHeader
        title="Laporan Arus Kas"
        subtitle={`Metode langsung · ${fmtDate(from)} – ${fmtDate(to)} · real-time dari jurnal Posted`}
        actions={<PrintButton />}
      />
      <DateRangeForm from={from} to={to} />
      {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto p-2">
        <table className="tbl">
          <tbody>
            {cats.map((c) => (
              <CategoryBlock key={c} label={CASH_FLOW_LABEL[c]} total={totals[c]}>
                {flows
                  .filter((f) => f.category === c)
                  .sort((a, b) => (byId.get(a.account_id)?.code ?? "").localeCompare(byId.get(b.account_id)?.code ?? ""))
                  .map((f) => {
                    const a = byId.get(f.account_id);
                    return (
                      <tr key={f.account_id}>
                        <td>
                          <span className="pl-4">
                            {f.amount >= 0 ? "Penerimaan dari " : "Pembayaran untuk "}
                            <Link className="hover:underline" href={`/laporan/buku-besar?akun=${f.account_id}&${q}`}>
                              {a?.name}
                            </Link>
                          </span>
                        </td>
                        <td className="num">{money(f.amount)}</td>
                      </tr>
                    );
                  })}
              </CategoryBlock>
            ))}
            <tr><td colSpan={2} className="border-0 py-2" /></tr>
            <TotalRow label="Kenaikan (penurunan) bersih kas" value={net} />
            <tr>
              <td>Saldo kas & bank awal periode</td>
              <td className="num">{money(opening)}</td>
            </tr>
            <TotalRow label="SALDO KAS & BANK AKHIR PERIODE" value={opening + net} strong />
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-sm ${reconciled ? "text-green-700" : "text-red-600"}`}>
        {reconciled
          ? `✓ Cocok dengan saldo akun kas/bank di buku besar (${money(closing)}).`
          : `Tidak cocok dengan saldo kas/bank di buku besar (${money(closing)}).`}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Kategori arus kas ditentukan dari pengaturan akun lawan di Chart of Accounts. Akun kas/bank:{" "}
        {cashAccounts.map((a) => a.name).join(", ") || "belum ada"}.
      </p>
    </>
  );
}

function CategoryBlock({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  return (
    <>
      <SectionRow label={label} />
      {children}
      <TotalRow label={`Kas bersih dari ${label.toLowerCase()}`} value={total} />
    </>
  );
}
