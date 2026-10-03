import { api, body } from "@/server/api";
import { submitQc } from "@/server/services/qc";

/** POST /api/quality-controls — { workOrderId, result: pass|fail|rework, notes, reworkJobIds } */
export const POST = api(async (req, ctx) => {
  const b = await body(req);
  return submitQc(ctx, String(b.workOrderId ?? ""), b);
}, 201);
