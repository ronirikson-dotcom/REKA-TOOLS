import { api, body, query } from "@/server/api";
import { createWorkOrder, listWorkOrders } from "@/server/services/workorders";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listWorkOrders(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, status: q.get("status") });
});

/** POST /api/work-orders — create WO dari estimate yang disetujui */
export const POST = api(async (req, ctx) => createWorkOrder(ctx, await body(req)), 201);
