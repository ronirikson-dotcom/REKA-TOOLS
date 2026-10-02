import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/page";
import { db } from "@/server/db";
import { suppliers } from "@/server/db/schema";
import { SupplierForm } from "@/components/forms/supplier-form";
import { PageHeader } from "@/components/ui";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("supplier.manage");
  const { id } = await params;
  const s = await db.query.suppliers.findFirst({ where: and(eq(suppliers.id, id), eq(suppliers.companyId, ctx.companyId)) });
  if (!s) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Ubah ${s.name}`} back={{ href: "/master/suppliers", label: "Supplier" }} />
      <SupplierForm supplier={s} />
    </div>
  );
}
