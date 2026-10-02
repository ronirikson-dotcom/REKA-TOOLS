import { load, pageContext } from "@/server/page";
import { getCheckin, getInspectionTemplate } from "@/server/services/checkins";
import { InspectionForm } from "@/components/client/inspection-form";
import { createInspectionAction } from "@/server/actions/front";
import { Alert, PageHeader } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/status";

export const metadata = { title: "Inspeksi Kendaraan" };

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("inspection.execute");
  const { id } = await params;
  const c = await load(() => getCheckin(ctx, id));
  const tpl = await getInspectionTemplate(ctx, c.vehicle.vehicleType);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Inspeksi ${c.vehicle.plateNumber}`}
        subtitle={`${tpl?.name ?? "Checklist"} · ${VEHICLE_TYPES[c.vehicle.vehicleType]} · Keluhan: ${c.complaint}`}
        back={{ href: `/checkins/${id}`, label: c.checkinNumber }}
      />
      {tpl ? (
        <InspectionForm action={createInspectionAction} checkinId={id} items={tpl.items.map((i) => ({ category: i.category, itemName: i.itemName }))} />
      ) : (
        <Alert tone="amber">Template inspeksi untuk jenis kendaraan ini belum tersedia. Atur di Settings → Template Inspeksi.</Alert>
      )}
    </div>
  );
}
