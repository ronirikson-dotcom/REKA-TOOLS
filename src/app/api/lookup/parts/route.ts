import { api, query } from "@/server/api";
import { searchParts } from "@/server/services/inventory";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return searchParts(ctx, q.q, q.get("warehouseId"));
});
