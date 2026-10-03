import { api, body, query } from "@/server/api";
import { createCheckin, listCheckins } from "@/server/services/checkins";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listCheckins(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, status: q.get("status") });
});

/** POST /api/checkins — create vehicle check-in */
export const POST = api(async (req, ctx) => createCheckin(ctx, await body(req)), 201);
