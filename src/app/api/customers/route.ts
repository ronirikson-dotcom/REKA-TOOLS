import { api, body, query } from "@/server/api";
import { createCustomer, listCustomers } from "@/server/services/customers";

/** GET /api/customers?q= — list/search customer */
export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listCustomers(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, type: q.get("type") });
});

/** POST /api/customers — create customer */
export const POST = api(async (req, ctx) => createCustomer(ctx, await body(req)), 201);
