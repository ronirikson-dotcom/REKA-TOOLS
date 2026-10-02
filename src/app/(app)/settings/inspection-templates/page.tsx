import { pageContext } from "@/server/page";
import { listInspectionTemplates } from "@/server/services/masters";
import { TemplateItemsForm } from "@/components/client/settings-forms";
import { saveTemplateItemsAction } from "@/server/actions/admin";
import { Card, Grid, PageHeader } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/status";

export const metadata = { title: "Template Inspeksi" };

export default async function InspectionTemplatesPage() {
  const ctx = await pageContext("settings.master");
  const templates = await listInspectionTemplates(ctx);
  return (
    <>
      <PageHeader title="Template inspeksi" subtitle="Checklist berbeda untuk mobil dan motor (BRD 1.5)" />
      <Grid cols={2}>
        {templates.map((t) => (
          <Card key={t.id} title={`${t.name} · ${VEHICLE_TYPES[t.vehicleType]}`}>
            <TemplateItemsForm action={saveTemplateItemsAction} templateId={t.id} items={t.items.map((i) => ({ category: i.category, itemName: i.itemName }))} />
          </Card>
        ))}
      </Grid>
    </>
  );
}
