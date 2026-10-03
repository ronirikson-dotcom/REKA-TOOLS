import { api, body, query } from "@/server/api";
import { createPartRequest, listPartRequests } from "@/server/services/inventory";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listPartRequests(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, status: q.get("status") });
});

/** POST /api/part-requests — { workOrderId, items: [{ partId, qty }] } */
export const POST = api(async (req, ctx) => {
  const b = await body(req);
  return createPartRequest(ctx, String(b.workOrderId ?? ""), b);
}, 201);
