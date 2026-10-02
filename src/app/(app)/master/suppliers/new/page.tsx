import { pageContext } from "@/server/page";
import { SupplierForm } from "@/components/forms/supplier-form";
import { PageHeader } from "@/components/ui";

export default async function NewSupplierPage() {
  await pageContext("supplier.manage");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Supplier baru" back={{ href: "/master/suppliers", label: "Supplier" }} />
      <SupplierForm />
    </div>
  );
}
