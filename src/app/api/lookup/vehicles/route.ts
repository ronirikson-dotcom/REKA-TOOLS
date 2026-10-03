import { api, query } from "@/server/api";
import { listVehicles } from "@/server/services/vehicles";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  const res = await listVehicles(ctx, { q: q.q, pageSize: 15, customerId: q.get("customerId") });
  return res.rows;
});
