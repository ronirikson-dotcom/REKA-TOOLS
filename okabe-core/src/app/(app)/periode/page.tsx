import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PageHeader, StatusBadge } from "@/components/page-header";
import { canWrite, getSession } from "@/lib/data";
import { fmtDateTime, monthRange, periodLabel } from "@/lib/format";
import type { FiscalPeriod, JournalEntry, Profile } from "@/lib/types";
import { closePeriod, reopenPeriod } from "./actions";

export const metadata: Metadata = { title: "Periode & Tutup Buku" };

export default async function PeriodsPage() {
  const { supabase, role } = await getSession();
  const [{ data: periods }, { data: entries }, { data: people }] = await Promise.all([
    supabase.from("fiscal_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
    supabase.from("journal_entries").select("entry_date, status"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const list = (periods ?? []) as FiscalPeriod[];
  const stats = new Map<string, { posted: number; draft: number }>();
  for (const e of (entries ?? []) as Pick<JournalEntry, "entry_date" | "status">[]) {
    const k = e.entry_date.slice(0, 7);
    const s = stats.get(k) ?? { posted: 0, draft: 0 };
    s[e.status] += 1;
    stats.set(k, s);
  }
  const who = (uid: string | null) => {
    const p = (people as Profile[] | null)?.find((x) => x.id === uid);
    return p ? p.full_name ?? p.email : "Sistem";
  };

  const key = (p: FiscalPeriod) => p.year * 100 + p.month;
  const openList = list.filter((p) => p.status === "open");
  const closedList = list.filter((p) => p.status === "closed");
  const nextToClose = openList.length ? openList.reduce((a, b) => (key(a) < key(b) ? a : b)) : null;
  const lastClosed = closedList.length ? closedList.reduce((a, b) => (key(a) > key(b) ? a : b)) : null;

  return (
    <>
      <PageHeader
        title="Periode & Tutup Buku"
        subtitle="Periode berstatus Closed tidak dapat ditambah, diubah, atau dihapus transaksinya. Periode dibuat otomatis saat ada jurnal pertama di bulan tersebut."
      />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Status</th>
              <th className="text-right">Jurnal posted</th>
              <th className="text-right">Draft</th>
              <th>Ditutup</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">Belum ada periode.</td>
              </tr>
            )}
            {list.map((p) => {
              const k = `${p.year}-${String(p.month).padStart(2, "0")}`;
              const s = stats.get(k) ?? { posted: 0, draft: 0 };
              const { from, to } = monthRange(p.year, p.month);
              return (
                <tr key={p.id}>
                  <td className="font-medium">{periodLabel(p.year, p.month)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="num">
                    <Link className="link" href={`/jurnal?bulan=${k}&status=posted`}>{s.posted}</Link>
                  </td>
                  <td className="num">
                    {s.draft ? <Link className="link text-amber-700" href={`/jurnal?bulan=${k}&status=draft`}>{s.draft}</Link> : 0}
                  </td>
                  <td className="text-xs text-slate-500">{p.closed_at ? `${who(p.closed_by)} · ${fmtDateTime(p.closed_at)}` : "-"}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link className="btn btn-ghost" href={`/laporan/laba-rugi?dari=${from}&sampai=${to}`}>Laba/Rugi</Link>
                    {canWrite(role) && nextToClose?.id === p.id && (
                      <ActionButton
                        action={closePeriod.bind(null, p.year, p.month)}
                        label="Tutup buku"
                        className="btn btn-primary"
                        confirm={`Tutup buku ${periodLabel(p.year, p.month)}? Setelah ditutup, transaksi periode ini terkunci.`}
                      />
                    )}
                    {role === "admin" && lastClosed?.id === p.id && (
                      <ActionButton
                        action={reopenPeriod.bind(null, p.year, p.month)}
                        label="Buka kembali"
                        prompt={`Alasan membuka kembali ${periodLabel(p.year, p.month)} (wajib, tercatat di audit trail):`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Tutup buku dilakukan berurutan dari periode terlama. Periode dengan jurnal draft tidak dapat ditutup. Hanya admin yang
        dapat membuka kembali periode terakhir yang ditutup, dan alasannya tercatat di audit trail.
      </p>
    </>
  );
}
