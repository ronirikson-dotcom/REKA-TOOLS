import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { DateRangeForm, readRange } from "@/components/report-parts";
import { getAccounts, getActivity, getSession } from "@/lib/data";
import { ACCOUNT_TYPE_LABEL, fmtDate, isDebitNormal, money, sourceLabel, todayISO } from "@/lib/format";
import type { JournalEntry, JournalLine } from "@/lib/types";

export const metadata: Metadata = { title: "Buku Besar" };

type Line = JournalLine & { journal_entries: JournalEntry };

export default async function LedgerPage({ searchParams }: PageProps<"/laporan/buku-besar">) {
  const sp = await searchParams;
  const { from, to } = readRange(sp, todayISO());
  const accountId = typeof sp.akun === "string" ? sp.akun : "";
  const { supabase } = await getSession();
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === accountId && a.is_postable);

  let lines: Line[] = [];
  let opening = 0;
  if (account) {
    const [activity, { data }] = await Promise.all([
      getActivity(from, to),
      supabase
        .from("journal_lines")
        .select("*, journal_entries!inner(*)")
        .eq("account_id", account.id)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to),
    ]);
    opening = activity.get(account.id)?.opening ?? 0;
    lines = ((data ?? []) as Line[]).sort(
      (a, b) =>
        a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date) ||
        a.journal_entries.entry_no.localeCompare(b.journal_entries.entry_no) ||
        a.line_no - b.line_no,
    );
  }

  const sign = account && isDebitNormal(account.type) ? 1 : -1;
  const balances = lines.reduce<number[]>((acc, l) => {
    const prev = acc.length ? acc[acc.length - 1] : opening * sign;
    acc.push(prev + (Number(l.debit) - Number(l.credit)) * sign);
    return acc;
  }, []);
  const ending = balances.length ? balances[balances.length - 1] : opening * sign;
  const totalD = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <>
      <PageHeader
        title="Buku Besar"
        subtitle={
          account
            ? `${account.code} · ${account.name} (${ACCOUNT_TYPE_LABEL[account.type]}, saldo normal ${sign === 1 ? "Debit" : "Kredit"}) · ${fmtDate(from)} – ${fmtDate(to)}`
            : "Pilih akun untuk melihat rincian transaksi"
        }
        actions={account && <PrintButton />}
      />
      <DateRangeForm from={from} to={to}>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="akun">Akun</label>
          <select id="akun" name="akun" className="input" defaultValue={accountId}>
            <option value="">— Pilih akun —</option>
            {accounts
              .filter((a) => a.is_postable)
              .map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
          </select>
        </div>
      </DateRangeForm>

      {account && (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[860px]">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>No. jurnal</th>
                <th>Keterangan</th>
                <th>Dokumen sumber</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Kredit</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50 italic">
                <td colSpan={6}>Saldo awal</td>
                <td className="num">{money(opening * sign)}</td>
              </tr>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">Tidak ada transaksi pada periode ini.</td>
                </tr>
              )}
              {lines.map((l, i) => {
                const e = l.journal_entries;
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                    <td className="font-mono whitespace-nowrap">
                      <Link className="link" href={`/jurnal/${e.id}`}>{e.entry_no}</Link>
                    </td>
                    <td>
                      {e.description}
                      {l.memo && <div className="text-xs text-slate-500">{l.memo}</div>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-slate-600">
                      {sourceLabel(e.source_type)}
                      {e.source_ref && <div className="font-mono text-slate-400">{e.source_ref}</div>}
                    </td>
                    <td className="num">{money(l.debit, { blankZero: true })}</td>
                    <td className="num">{money(l.credit, { blankZero: true })}</td>
                    <td className="num font-medium">{money(balances[i])}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td colSpan={4} className="px-3 py-2">Total mutasi & saldo akhir</td>
                <td className="num px-3 py-2">{money(totalD)}</td>
                <td className="num px-3 py-2">{money(totalC)}</td>
                <td className="num px-3 py-2">{money(ending)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
