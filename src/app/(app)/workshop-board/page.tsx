import Link from "next/link";
import { pageContext } from "@/server/page";
import { workshopBoard } from "@/server/services/workorders";
import { Badge, cn, PageHeader, StatusBadge } from "@/components/ui";
import { ageHours, formatAge, formatTime } from "@/lib/format";
import { statusInfo } from "@/lib/status";
import { AutoRefresh } from "@/components/client/auto-refresh";

export const metadata = { title: "Workshop Board" };

const COLUMNS: { key: string; statuses: string[]; title: string }[] = [
  { key: "waiting", statuses: ["waiting", "assigned"], title: "Menunggu" },
  { key: "progress", statuses: ["in_progress", "paused"], title: "Dikerjakan" },
  { key: "parts", statuses: ["waiting_parts"], title: "Waiting Parts" },
  { key: "qc", statuses: ["qc", "rework"], title: "QC / Rework" },
  { key: "done", statuses: ["completed"], title: "Siap Diserahkan" },
];

/** Workshop board: status & aging pekerjaan (URS-WO-006, SRS 4.7) */
export default async function WorkshopBoardPage() {
  const ctx = await pageContext("workorder.view");
  const rows = await workshopBoard(ctx);
  return (
    <>
      <PageHeader title="Workshop Board" subtitle={`${rows.length} kendaraan di workshop · diperbarui otomatis tiap 60 detik`} actions={<AutoRefresh seconds={60} />} />
      <div className="grid gap-3 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = rows.filter((r) => col.statuses.includes(r.status));
          return (
            <div key={col.key} className="rounded-lg bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-700">{col.title}</h2>
                <Badge>{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">Kosong</div>}
                {items.map((w) => {
                  const h = ageHours(w.arrivalTime);
                  const late = w.estimatedFinishAt && new Date(w.estimatedFinishAt) < new Date() && w.status !== "completed";
                  return (
                    <Link
                      key={w.id}
                      href={`/work-orders/${w.id}`}
                      className={cn(
                        "block rounded-md border bg-white p-3 shadow-sm transition hover:shadow-md",
                        h > 72 ? "border-red-300" : h > 24 ? "border-amber-300" : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">{w.plateNumber}</span>
                        {w.priority !== "normal" && <StatusBadge domain="priority" status={w.priority} />}
                      </div>
                      <div className="text-xs text-slate-500">
                        {w.woNumber} · {w.vehicleType === "car" ? "Mobil" : "Motor"}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-700">{w.customerName}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <Badge tone={statusInfo("workorder", w.status).tone}>{statusInfo("workorder", w.status).label}</Badge>
                        <span className={cn("font-semibold", h > 72 ? "text-red-600" : h > 24 ? "text-amber-600" : "text-slate-500")}>⏱ {formatAge(w.arrivalTime)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${w.jobsTotal ? (w.jobsDone / w.jobsTotal) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                        <span>
                          {w.jobsDone}/{w.jobsTotal} job · {w.mechanics ?? "belum ada mekanik"}
                        </span>
                        {w.bay && <span>{w.bay}</span>}
                      </div>
                      {w.estimatedFinishAt && (
                        <div className={cn("mt-1 text-[11px]", late ? "font-semibold text-red-600" : "text-slate-500")}>Target {formatTime(w.estimatedFinishAt)}{late ? " (terlambat)" : ""}</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
