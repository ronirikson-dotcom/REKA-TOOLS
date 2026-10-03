import { api, query } from "@/server/api";
import { listCustomers } from "@/server/services/customers";

export const GET = api(async (req, ctx) => (await listCustomers(ctx, { q: query(req).q, pageSize: 15 })).rows);
