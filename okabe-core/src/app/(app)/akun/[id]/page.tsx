import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { getAccounts, getSession } from "@/lib/data";
import { AccountForm } from "../account-form";
import { deleteAccount, saveAccount } from "../actions";

export const metadata: Metadata = { title: "Ubah Akun" };

export default async function EditAccountPage({ params }: PageProps<"/akun/[id]">) {
  const { id } = await params;
  const { supabase, role } = await getSession();
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();

  const { count } = await supabase
    .from("journal_lines")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);
  const hasChildren = accounts.some((a) => a.parent_id === id);

  return (
    <>
      <PageHeader
        title={`${account.code} · ${account.name}`}
        subtitle={count ? `${count} baris jurnal menggunakan akun ini` : "Belum ada transaksi"}
        actions={
          <>
            <Link className="btn" href={`/laporan/buku-besar?akun=${id}`}>Buku besar</Link>
            {role === "admin" && !count && !hasChildren && (
              <ActionButton
                action={deleteAccount.bind(null, id)}
                label="Hapus akun"
                className="btn btn-danger"
                confirm={`Hapus akun ${account.code}?`}
              />
            )}
          </>
        }
      />
      <AccountForm
        account={account}
        headers={accounts.filter((a) => !a.is_postable)}
        action={saveAccount.bind(null, id)}
        hasTransactions={!!count}
        hasChildren={hasChildren}
      />
    </>
  );
}
