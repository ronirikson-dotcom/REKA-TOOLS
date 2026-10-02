import { api, body, query } from "@/server/api";
import { createCounterSale, createWorkOrderInvoice, listInvoices } from "@/server/services/invoices";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listInvoices(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, paymentStatus: q.get("paymentStatus") });
});

/** POST /api/invoices — { workOrderId, additionalDiscount } atau penjualan langsung { items: [...] } */
export const POST = api(async (req, ctx) => {
  const b = await body(req);
  return b.workOrderId ? createWorkOrderInvoice(ctx, String(b.workOrderId), b) : createCounterSale(ctx, b);
}, 201);
