import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { OtpInbox } from "./otp-inbox";

export const metadata: Metadata = { title: "OTP Manajer" };

export default async function OtpPage() {
  const { role } = await getSession();
  if (role !== "manager" && role !== "admin") redirect("/");
  return (
    <>
      <PageHeader
        title="Kotak OTP Manajer"
        subtitle="Kode OTP untuk void, retur, dan diskon manual. Sebutkan kode ke kasir hanya jika Anda menyetujui. Salinan pesan WhatsApp/Email juga muncul di sini."
      />
      <OtpInbox />
    </>
  );
}
