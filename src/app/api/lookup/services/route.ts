import { api, query } from "@/server/api";
import { listServices } from "@/server/services/masters";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return (await listServices(ctx, { q: q.q, vehicleType: q.get("vehicleType"), activeOnly: true, pageSize: 200 })).rows;
});
