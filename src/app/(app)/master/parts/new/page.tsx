import { pageContext } from "@/server/page";
import { partCategoryOptions } from "@/server/services/masters";
import { PartForm } from "@/components/forms/part-form";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { savePartCategoryAction } from "@/server/actions/inventory";
import { Card, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Part Baru" };

export default async function NewPartPage() {
  const ctx = await pageContext("part.manage");
  const categories = await partCategoryOptions(ctx);
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Part baru" back={{ href: "/master/parts", label: "Master Part" }} />
      <PartForm categories={categories} />
      <Card title="Tambah kategori">
        <ActionForm action={savePartCategoryAction} className="flex gap-2" resetOnSuccess>
          <Input name="name" placeholder="Nama kategori" required />
          <SubmitButton variant="secondary">Tambah</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
