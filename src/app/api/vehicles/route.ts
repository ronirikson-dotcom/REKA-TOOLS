import { api, body, query } from "@/server/api";
import { createVehicle, listVehicles } from "@/server/services/vehicles";

/** GET /api/vehicles?q= — list/search vehicle (nomor polisi, rangka, customer) */
export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listVehicles(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, customerId: q.get("customerId") });
});

export const POST = api(async (req, ctx) => createVehicle(ctx, await body(req)), 201);
