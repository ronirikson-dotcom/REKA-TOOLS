import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getAccounts } from "@/lib/data";
import { AccountForm } from "../account-form";
import { saveAccount } from "../actions";

export const metadata: Metadata = { title: "Akun Baru" };

export default async function NewAccountPage() {
  const accounts = await getAccounts();
  return (
    <>
      <PageHeader title="Akun Baru" subtitle="Tambah akun ke Chart of Accounts" />
      <AccountForm headers={accounts.filter((a) => !a.is_postable)} action={saveAccount.bind(null, null)} />
    </>
  );
}
