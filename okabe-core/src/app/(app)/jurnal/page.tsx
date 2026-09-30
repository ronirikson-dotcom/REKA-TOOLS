import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/page-header";
import { canWrite, getSession } from "@/lib/data";
import { SOURCE_LABEL, fmtDate, money, monthRange, sourceLabel } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";

export const metadata: Metadata = { title: "Jurnal" };

type Row = JournalEntry & { journal_lines: { debit: number }[] };

export default async function JournalsPage({ searchParams }: PageProps<"/jurnal">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const bulan = typeof sp.bulan === "string" ? sp.bulan : "";
  const sumber = typeof sp.sumber === "string" ? sp.sumber : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const { supabase, role } = await getSession();
  let query = supabase
    .from("journal_entries")
    .select("*, journal_lines(debit)")
    .order("entry_date", { ascending: false })
    .order("entry_no", { ascending: false })
    .limit(300);
  if (status === "draft" || status === "posted") query = query.eq("status", status);
  if (sumber) query = query.eq("source_type", sumber);
  if (/^\d{4}-\d{2}$/.test(bulan)) {
    const [y, m] = bulan.split("-").map(Number);
    const { from, to } = monthRange(y, m);
    query = query.gte("entry_date", from).lte("entry_date", to);
  }
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`entry_no.ilike.%${safe}%,description.ilike.%${safe}%,source_ref.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  const { data: reversals } = await supabase.from("journal_entries").select("reversal_of").not("reversal_of", "is", null);
  const reversed = new Set((reversals ?? []).map((r) => r.reversal_of as string));

  return (
    <>
      <PageHeader
        title="Jurnal"
        subtitle="Seluruh jurnal manual dan jurnal otomatis dari modul lain."
        actions={canWrite(role) && <Link href="/jurnal/baru" className="btn btn-primary">+ Jurnal umum</Link>}
      />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-5">
        <input className="input sm:col-span-2" name="q" defaultValue={q} placeholder="Cari no. jurnal, keterangan, referensi…" />
        <input className="input" type="month" name="bulan" defaultValue={bulan} />
        <select className="input" name="status" defaultValue={status}>
          <option value="">Semua status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
        <div className="flex gap-2">
          <select className="input" name="sumber" defaultValue={sumber}>
            <option value="">Semua sumber</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn">Filter</button>
        </div>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>No. jurnal</th>
              <th>Tanggal</th>
              <th>Keterangan</th>
              <th>Sumber</th>
              <th className="text-right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">Tidak ada jurnal.</td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="font-mono whitespace-nowrap">
                  <Link href={`/jurnal/${e.id}`} className="link">{e.entry_no}</Link>
                </td>
                <td className="whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                <td>{e.description}</td>
                <td className="whitespace-nowrap text-xs text-slate-600">
                  {sourceLabel(e.source_type)}
                  {e.source_ref && <div className="font-mono text-slate-400">{e.source_ref}</div>}
                </td>
                <td className="num">{money(e.journal_lines.reduce((s, l) => s + Number(l.debit), 0))}</td>
                <td className="whitespace-nowrap">
                  <StatusBadge status={e.status} /> {reversed.has(e.id) && <StatusBadge status="reversed" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
