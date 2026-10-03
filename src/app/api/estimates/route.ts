import { api, body, query } from "@/server/api";
import { createEstimate, listEstimates } from "@/server/services/estimates";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listEstimates(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, status: q.get("status") });
});

/** POST /api/estimates — create estimate { checkinId | workOrderId, items[] } */
export const POST = api(async (req, ctx) => createEstimate(ctx, await body(req)), 201);
