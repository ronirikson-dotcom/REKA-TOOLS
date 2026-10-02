import { load, pageContext } from "@/server/page";
import { getEstimate } from "@/server/services/estimates";
import { listServices } from "@/server/services/masters";
import { EstimateEditor } from "@/components/client/estimate-editor";
import { saveEstimateAction } from "@/server/actions/front";
import { Alert, PageHeader } from "@/components/ui";

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("estimate.create");
  const { id } = await params;
  const e = await load(() => getEstimate(ctx, id));
  if (!["draft", "sent"].includes(e.status)) return <Alert tone="amber">Estimate yang sudah diputuskan tidak dapat diubah (BR-010).</Alert>;
  const services = await listServices(ctx, { vehicleType: e.vehicle.vehicleType, activeOnly: true, pageSize: 200 });
  return (
    <>
      <PageHeader title={`Ubah ${e.estimateNumber}`} back={{ href: `/estimates/${id}`, label: e.estimateNumber }} />
      <EstimateEditor
        action={saveEstimateAction}
        hidden={{ id }}
        services={services.rows}
        taxRate={e.taxRate}
        initialNotes={e.notes ?? ""}
        initialItems={e.items.map((i) => ({
          itemType: i.itemType as "service" | "part" | "material",
          serviceId: i.serviceId,
          partId: i.partId,
          description: i.description,
          qty: i.qty,
          price: i.price,
          discount: i.discount,
        }))}
      />
    </>
  );
}
