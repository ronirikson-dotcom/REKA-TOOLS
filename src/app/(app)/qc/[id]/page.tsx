import { load, pageContext } from "@/server/page";
import { getWorkOrder } from "@/server/services/workorders";
import { QC_DEFAULT_CHECKLIST } from "@/server/services/qc";
import { QcForm } from "@/components/client/qc-form";
import { submitQcAction } from "@/server/actions/workshop";
import { Alert, Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatDuration } from "@/lib/format";

export const metadata = { title: "Quality Control" };

export default async function QcFormPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("qc.execute");
  const { id } = await params;
  const wo = await load(() => getWorkOrder(ctx, id));
  const jobs = wo.jobs.filter((j) => j.status !== "cancelled");
  return (
    <div className="max-w-5xl">
      <PageHeader title={`QC ${wo.vehicle.plateNumber}`} subtitle={`${wo.woNumber} · ${wo.customer.name} · Keluhan: ${wo.complaint}`} back={{ href: `/work-orders/${id}`, label: wo.woNumber }} />
      {wo.status !== "qc" ? (
        <Alert tone="amber">
          Work Order berstatus <StatusBadge domain="workorder" status={wo.status} /> — belum berada di tahap QC.
        </Alert>
      ) : (
        <>
          <Card title="Pekerjaan yang diperiksa" className="mb-4">
            <ul className="divide-y divide-slate-100 text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex justify-between py-2">
                  <span>
                    {j.description}
                    {j.notes && <span className="block text-xs text-slate-500">Catatan mekanik: {j.notes}</span>}
                  </span>
                  <span className="text-slate-500">
                    {j.mechanics.find((m) => m.isActive)?.mechanic.name} · {formatDuration(j.actualMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <QcForm
            action={submitQcAction}
            woId={id}
            checklist={QC_DEFAULT_CHECKLIST}
            jobs={jobs.map((j) => ({ id: j.id, description: j.description, mechanic: j.mechanics.find((m) => m.isActive)?.mechanic.name ?? null }))}
          />
        </>
      )}
    </div>
  );
}
