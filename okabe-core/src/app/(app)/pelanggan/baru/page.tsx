import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "../customer-form";
import { saveCustomer } from "../actions";

export const metadata: Metadata = { title: "Pelanggan Baru" };

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="Pelanggan Baru" subtitle="Nomor HP dinormalisasi ke format 62…" />
      <CustomerForm action={saveCustomer.bind(null, null)} />
    </>
  );
}
