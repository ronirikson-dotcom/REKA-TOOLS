import { api, body, query } from "@/server/api";
import { listPayments, receivePayment } from "@/server/services/invoices";

export const GET = api(async (req, ctx) => {
  const q = query(req);
  return listPayments(ctx, { q: q.q, page: q.page, pageSize: q.pageSize, from: q.get("from"), to: q.get("to") });
});

/**
 * POST /api/payments — { invoiceId, idempotencyKey, lines: [{ paymentMethodId, amount, referenceNumber, tenderedAmount }] }
 * Header Idempotency-Key juga diterima.
 */
export const POST = api(async (req, ctx) => {
  const b = await body(req);
  const key = (b.idempotencyKey as string) ?? req.headers.get("idempotency-key") ?? "";
  return receivePayment(ctx, String(b.invoiceId ?? ""), { ...b, idempotencyKey: key });
}, 201);
