"use client";

import { useEffect, useState } from "react";
import { Pause, Play, CheckCircle2, RotateCcw } from "lucide-react";
import { InlineAction, type FormAction } from "./action-form";
import { formatDuration } from "@/lib/format";

/** Timer berjalan untuk job yang sedang dikerjakan */
export function JobTimer({ actualMinutes, runningSince }: { actualMinutes: number; runningSince: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [runningSince]);
  const running = runningSince ? Math.max(0, Math.round((now - new Date(runningSince).getTime()) / 60000)) : 0;
  return (
    <span className="tabular-nums">
      {formatDuration(actualMinutes + running)}
      {runningSince && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
    </span>
  );
}

/** Start / Pause / Resume / Complete (URS-WO-005) */
export function JobButtons({ action, jobId, status, size = "sm" }: { action: FormAction; jobId: string; status: string; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "pending" && (
        <InlineAction action={action} fields={{ jobId, action: "start" }} variant="primary" size={size}>
          <Play className="h-3.5 w-3.5" /> Start
        </InlineAction>
      )}
      {status === "in_progress" && (
        <>
          <InlineAction action={action} fields={{ jobId, action: "pause" }} variant="warning" size={size}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </InlineAction>
          <InlineAction action={action} fields={{ jobId, action: "complete" }} variant="success" size={size}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </InlineAction>
        </>
      )}
      {status === "paused" && (
        <>
          <InlineAction action={action} fields={{ jobId, action: "resume" }} variant="primary" size={size}>
            <RotateCcw className="h-3.5 w-3.5" /> Resume
          </InlineAction>
          <InlineAction action={action} fields={{ jobId, action: "complete" }} variant="success" size={size}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </InlineAction>
        </>
      )}
    </div>
  );
}
