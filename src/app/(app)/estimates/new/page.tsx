import { load, pageContext, params, type SP } from "@/server/page";
import { getCheckin } from "@/server/services/checkins";
import { getWorkOrder } from "@/server/services/workorders";
import { listServices } from "@/server/services/masters";
import { getCompany } from "@/server/services/settings";
import { EstimateEditor } from "@/components/client/estimate-editor";
import { saveEstimateAction } from "@/server/actions/front";
import { Alert, PageHeader } from "@/components/ui";

export const metadata = { title: "Estimate Baru" };

export default async function NewEstimatePage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("estimate.create");
  const p = await params(searchParams);
  const woId = p.get("workOrderId");
  const checkinId = woId ? (await load(() => getWorkOrder(ctx, woId))).checkinId : p.get("checkinId");
  if (!checkinId) return <Alert tone="amber">Buat estimate dari halaman check-in atau Work Order.</Alert>;
  const c = await load(() => getCheckin(ctx, checkinId));
  const [services, company] = await Promise.all([listServices(ctx, { vehicleType: c.vehicle.vehicleType, activeOnly: true, pageSize: 200 }), getCompany(ctx)]);
  const findings = c.inspections.flatMap((i) => i.items.filter((x) => x.result === "attention" || x.result === "replace"));
  return (
    <>
      <PageHeader
        title={woId ? "Estimate tambahan" : "Estimate baru"}
        subtitle={`${c.vehicle.plateNumber} · ${c.customer.name} · Keluhan: ${c.complaint}`}
        back={woId ? { href: `/work-orders/${woId}`, label: "Work Order" } : { href: `/checkins/${checkinId}`, label: c.checkinNumber }}
      />
      {woId && (
        <div className="mb-4">
          <Alert tone="blue">Pekerjaan tambahan wajib disetujui customer sebelum dapat ditagihkan (BR-006). Jasa yang disetujui otomatis menjadi job baru di Work Order.</Alert>
        </div>
      )}
      <EstimateEditor
        action={saveEstimateAction}
        hidden={woId ? { workOrderId: woId } : { checkinId }}
        services={services.rows}
        taxRate={company.taxRate}
        findings={findings}
      />
    </>
  );
}
