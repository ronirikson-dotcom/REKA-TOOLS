import { api, body } from "@/server/api";
import { ValidationError } from "@/server/errors";
import { assignMechanic, cancelWorkOrder, getWorkOrder, jobAction, setWaitingParts, updateWorkOrder, type JobAction } from "@/server/services/workorders";

type P = { id: string };

export const GET = api<P>(async (_req, ctx, { id }) => getWorkOrder(ctx, id));

/**
 * PATCH /api/work-orders/:id — update status/detail WO
 * body.action: update | assign | job | waiting_parts | resume_parts | cancel
 */
export const PATCH = api<P>(async (req, ctx, { id }) => {
  const b = await body(req);
  switch (b.action ?? "update") {
    case "update":
      await updateWorkOrder(ctx, id, b);
      break;
    case "assign":
      await assignMechanic(ctx, id, b);
      break;
    case "job":
      await jobAction(ctx, String(b.jobId), String(b.jobAction) as JobAction, (b.note as string) ?? null);
      break;
    case "waiting_parts":
      await setWaitingParts(ctx, id, true, (b.note as string) ?? null);
      break;
    case "resume_parts":
      await setWaitingParts(ctx, id, false, (b.note as string) ?? null);
      break;
    case "cancel":
      await cancelWorkOrder(ctx, id, b.reason);
      break;
    default:
      throw new ValidationError("Action tidak dikenal");
  }
  return getWorkOrder(ctx, id);
});
