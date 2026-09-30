import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canWrite, getAccounts, getSession } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { JournalForm } from "../journal-form";
import { saveJournal } from "../actions";

export const metadata: Metadata = { title: "Jurnal Baru" };

export default async function NewJournalPage() {
  const { role } = await getSession();
  if (!canWrite(role)) redirect("/jurnal");
  const accounts = await getAccounts();
  return (
    <>
      <PageHeader
        title="Jurnal Umum Baru"
        subtitle="Jurnal hanya bisa diposting jika total Debit = total Kredit. Jurnal Posted tidak dapat diubah atau dihapus."
      />
      <JournalForm accounts={accounts} defaultDate={todayISO()} onSave={saveJournal.bind(null, null)} cancelHref="/jurnal" />
    </>
  );
}
