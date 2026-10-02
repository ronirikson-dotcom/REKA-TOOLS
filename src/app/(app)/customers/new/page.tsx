import { pageContext, params, type SP } from "@/server/page";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/forms/customer-form";

export const metadata = { title: "Customer Baru" };

export default async function NewCustomerPage({ searchParams }: { searchParams: SP }) {
  await pageContext("customer.create");
  const p = await params(searchParams);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Customer baru" back={{ href: "/customers", label: "Customer" }} />
      <CustomerForm returnTo={p.get("returnTo")} />
    </div>
  );
}
