import { load, pageContext } from "@/server/page";
import { getPart, partCategoryOptions } from "@/server/services/masters";
import { PartForm } from "@/components/forms/part-form";
import { ButtonLink, PageHeader } from "@/components/ui";

export default async function EditPartPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("part.manage");
  const { id } = await params;
  const [part, categories] = await Promise.all([load(() => getPart(ctx, id)), partCategoryOptions(ctx)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Ubah ${part.partName}`} back={{ href: "/master/parts", label: "Master Part" }} actions={<ButtonLink href={`/inventory/parts/${id}`}>Kartu stok</ButtonLink>} />
      <PartForm part={part} categories={categories} />
    </div>
  );
}
