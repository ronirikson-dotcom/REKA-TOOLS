import { pageContext } from "@/server/page";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui";

export default async function NewServicePage() {
  await pageContext("service.manage");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Jasa baru" back={{ href: "/master/services", label: "Master Jasa" }} />
      <ServiceForm />
    </div>
  );
}
