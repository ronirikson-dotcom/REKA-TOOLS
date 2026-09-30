import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { PageHeader, StatusBadge } from "@/components/page-header";
import { canWrite, getSession } from "@/lib/data";
import { fmtDate, fmtDateTime, money, sourceLabel } from "@/lib/format";
import type { Account, JournalEntry, JournalLine, Profile } from "@/lib/types";
import { deleteJournal, postJournal, reverseJournal } from "../actions";

export const metadata: Metadata = { title: "Detail Jurnal" };

type Line = JournalLine & { accounts: Pick<Account, "id" | "code" | "name"> };

export default async function JournalDetailPage({ params }: PageProps<"/jurnal/[id]">) {
  const { id } = await params;
  const { supabase, role } = await getSession();

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*, accounts(id, code, name))")
    .eq("id", id)
    .single<JournalEntry & { journal_lines: Line[] }>();
  if (!entry) notFound();

  const [{ data: reversedBy }, { data: original }, { data: period }, { data: people }] = await Promise.all([
    supabase.from("journal_entries").select("id, entry_no").eq("reversal_of", id).maybeSingle(),
    entry.reversal_of
      ? supabase.from("journal_entries").select("id, entry_no").eq("id", entry.reversal_of).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("fiscal_periods")
      .select("status")
      .eq("year", Number(entry.entry_date.slice(0, 4)))
      .eq("month", Number(entry.entry_date.slice(5, 7)))
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const who = (uid: string | null) => {
    const p = (people as Profile[] | null)?.find((x) => x.id === uid);
    return p ? p.full_name ?? p.email : "Sistem";
  };

  const lines = [...entry.journal_lines].sort((a, b) => a.line_no - b.line_no);
  const totalD = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit), 0);
  const writable = canWrite(role);
  const periodOpen = period?.status !== "closed";

  return (
    <>
      <PageHeader
        title={entry.entry_no}
        subtitle={entry.description}
        actions={
          <>
            <Link href="/jurnal" className="btn">← Daftar jurnal</Link>
            {writable && entry.status === "draft" && periodOpen && (
              <>
                <Link href={`/jurnal/${id}/ubah`} className="btn">Ubah</Link>
                <ActionButton action={deleteJournal.bind(null, id)} label="Hapus draft" className="btn btn-danger" confirm="Hapus jurnal draft ini?" />
                <ActionButton action={postJournal.bind(null, id)} label="Posting" className="btn btn-primary" confirm="Posting jurnal? Setelah Posted jurnal tidak dapat diubah atau dihapus." />
              </>
            )}
            {writable && entry.status === "posted" && !reversedBy && !entry.reversal_of && (
              <ActionButton
                action={reverseJournal.bind(null, id)}
                label="Buat jurnal pembalik"
                prompt="Alasan pembalikan (wajib):"
              />
            )}
          </>
        }
      />

      {!periodOpen && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          🔒 Periode jurnal ini sudah ditutup (Closed). Koreksi dilakukan melalui jurnal pembalik pada periode yang masih open.
        </p>
      )}
      {reversedBy && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Jurnal ini sudah dibalik oleh <Link className="link font-mono" href={`/jurnal/${reversedBy.id}`}>{reversedBy.entry_no}</Link>.
        </p>
      )}
      {original && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Jurnal pembalik untuk <Link className="link font-mono" href={`/jurnal/${original.id}`}>{original.entry_no}</Link>.
        </p>
      )}

      <div className="card mb-4 grid gap-4 p-5 text-sm sm:grid-cols-4">
        <Info label="Tanggal" value={fmtDate(entry.entry_date)} />
        <Info label="Status" value={<StatusBadge status={entry.status} />} />
        <Info label="Sumber" value={sourceLabel(entry.source_type)} />
        <Info label="Dokumen sumber" value={<span className="font-mono">{entry.source_ref ?? "-"}</span>} />
        <Info label="Dibuat" value={`${who(entry.created_by)} · ${fmtDateTime(entry.created_at)}`} />
        <Info label="Diposting" value={entry.posted_at ? `${who(entry.posted_by)} · ${fmtDateTime(entry.posted_at)}` : "-"} />
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Akun</th>
              <th>Memo</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="text-slate-400">{l.line_no}</td>
                <td>
                  <Link href={`/laporan/buku-besar?akun=${l.accounts.id}`} className="hover:underline">
                    <span className="font-mono">{l.accounts.code}</span> · {l.accounts.name}
                  </Link>
                </td>
                <td className="text-slate-600">{l.memo}</td>
                <td className="num">{money(l.debit, { blankZero: true })}</td>
                <td className="num">{money(l.credit, { blankZero: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="px-3 py-2">
                Total {totalD === totalC ? <span className="text-green-700">✓ seimbang</span> : <span className="text-red-600">tidak seimbang</span>}
              </td>
              <td className="num px-3 py-2">{money(totalD)}</td>
              <td className="num px-3 py-2">{money(totalC)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {role !== "viewer" && (
        <p className="mt-3 text-right text-xs">
          <Link className="link" href={`/audit?record=${id}`}>Lihat audit trail jurnal ini →</Link>
        </p>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div>{value}</div>
    </div>
  );
}
