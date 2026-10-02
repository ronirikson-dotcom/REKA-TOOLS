import { pageContext } from "@/server/page";
import { getCompany } from "@/server/services/settings";
import { DOC_TYPES } from "@/server/services/numbering";
import { CompanyForm } from "@/components/client/settings-forms";
import { updateCompanyAction } from "@/server/actions/admin";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Pengaturan Perusahaan" };

export default async function CompanySettingsPage() {
  const ctx = await pageContext("settings.company");
  const company = await getCompany(ctx);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Pengaturan perusahaan" subtitle={`Kode tenant: ${company.code}`} />
      <CompanyForm action={updateCompanyAction} company={company} docTypes={{ ...DOC_TYPES }} />
    </div>
  );
}
