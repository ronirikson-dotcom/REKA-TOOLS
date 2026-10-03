import { load, pageContext } from "@/server/page";
import { getCustomer } from "@/server/services/customers";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/forms/customer-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("customer.edit");
  const { id } = await params;
  const c = await load(() => getCustomer(ctx, id));
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Ubah ${c.name}`} back={{ href: `/customers/${id}`, label: c.name }} />
      <CustomerForm customer={c} />
    </div>
  );
}
