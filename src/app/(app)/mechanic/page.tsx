import Link from "next/link";
import { pageContext } from "@/server/page";
import { listMyJobs } from "@/server/services/workorders";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { JobButtons, JobTimer } from "@/components/client/job-controls";
import { jobActionAction, jobNotesAction } from "@/server/actions/workshop";
import { Badge, Card, Input, PageHeader, StatusBadge } from "@/components/ui";
import { AutoRefresh } from "@/components/client/auto-refresh";

export const metadata = { title: "Pekerjaan Saya" };

/** Mechanic view: sederhana, mobile-friendly, fokus job aktif (SRS 4.7) */
export default async function MechanicPage() {
  const ctx = await pageContext("job.execute");
  const jobs = await listMyJobs(ctx);
  const active = jobs.filter((j) => j.jobStatus !== "completed");
  const done = jobs.filter((j) => j.jobStatus === "completed");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Pekerjaan Saya" subtitle={`${active.length} job aktif`} actions={<AutoRefresh seconds={60} />} />
      {active.length === 0 && (
        <Card>
          <p className="py-6 text-center text-sm text-slate-500">Belum ada job yang ditugaskan. Hubungi supervisor.</p>
        </Card>
      )}
      <div className="space-y-3">
        {active.map((j) => (
          <Card key={j.jobId} className={j.jobStatus === "in_progress" ? "border-indigo-300 ring-2 ring-indigo-100" : undefined}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xl font-bold text-slate-900">{j.plateNumber}</div>
                <div className="text-xs text-slate-500">
                  <Link className="text-brand-700 hover:underline" href={`/work-orders/${j.woId}`}>
                    {j.woNumber}
                  </Link>{" "}
                  · {j.customerName} {j.bay ? `· ${j.bay}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge domain="job" status={j.jobStatus} />
                {j.priority !== "normal" && <StatusBadge domain="priority" status={j.priority} />}
                {j.woStatus === "waiting_parts" && <Badge tone="orange">Waiting parts</Badge>}
              </div>
            </div>
            <div className="mt-3 text-base font-semibold text-slate-800">{j.description}</div>
            {j.reworkCount > 0 && <Badge tone="red">Rework dari QC ×{j.reworkCount}</Badge>}
            <div className="mt-1 text-sm text-slate-600">Keluhan: {j.complaint}</div>
            <div className="mt-2 text-sm text-slate-600">
              Standard {j.standardHour} jam · Aktual <JobTimer actualMinutes={j.actualMinutes} runningSince={j.runningSince?.toISOString() ?? null} />
            </div>
            <div className="mt-3">
              <JobButtons action={jobActionAction} jobId={j.jobId} status={j.jobStatus} size="md" />
            </div>
            <ActionForm action={jobNotesAction} className="mt-3 flex gap-2" showSuccess={false}>
              <input type="hidden" name="jobId" value={j.jobId} />
              <Input name="notes" defaultValue={j.notes ?? ""} placeholder="Catatan pekerjaan / temuan" />
              <SubmitButton variant="secondary">Simpan</SubmitButton>
            </ActionForm>
            <Link className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline" href={`/work-orders/${j.woId}`}>
              Minta part / detail WO →
            </Link>
          </Card>
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-600">Selesai, menunggu QC</h2>
          <ul className="space-y-1 text-sm">
            {done.map((j) => (
              <li key={j.jobId} className="flex justify-between rounded-md bg-white px-3 py-2 shadow-sm">
                <span>
                  {j.plateNumber} · {j.description}
                </span>
                <StatusBadge domain="workorder" status={j.woStatus} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
