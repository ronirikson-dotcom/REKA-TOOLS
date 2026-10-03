import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/page";
import { db } from "@/server/db";
import { services } from "@/server/db/schema";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui";

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("service.manage");
  const { id } = await params;
  const s = await db.query.services.findFirst({ where: and(eq(services.id, id), eq(services.companyId, ctx.companyId)) });
  if (!s) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Ubah ${s.serviceName}`} back={{ href: "/master/services", label: "Master Jasa" }} />
      <ServiceForm service={s} />
    </div>
  );
}
