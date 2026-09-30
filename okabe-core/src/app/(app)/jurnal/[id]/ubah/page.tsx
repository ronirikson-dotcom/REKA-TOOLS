import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canWrite, getAccounts, getSession } from "@/lib/data";
import { todayISO } from "@/lib/format";
import type { JournalEntry, JournalLine } from "@/lib/types";
import { JournalForm } from "../../journal-form";
import { saveJournal } from "../../actions";

export const metadata: Metadata = { title: "Ubah Jurnal" };

export default async function EditJournalPage({ params }: PageProps<"/jurnal/[id]/ubah">) {
  const { id } = await params;
  const { supabase, role } = await getSession();
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*)")
    .eq("id", id)
    .single<JournalEntry & { journal_lines: JournalLine[] }>();
  if (!entry) notFound();
  if (entry.status !== "draft" || !canWrite(role)) redirect(`/jurnal/${id}`);
  const accounts = await getAccounts();
  const lines = [...entry.journal_lines].sort((a, b) => a.line_no - b.line_no);

  return (
    <>
      <PageHeader title={`Ubah ${entry.entry_no}`} subtitle="Jurnal draft" />
      <JournalForm
        accounts={accounts}
        defaultDate={todayISO()}
        initial={{
          entry_date: entry.entry_date,
          description: entry.description,
          source_ref: entry.source_ref ?? "",
          lines: lines.map((l) => ({ account_id: l.account_id, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo })),
        }}
        onSave={saveJournal.bind(null, id)}
        cancelHref={`/jurnal/${id}`}
      />
    </>
  );
}
