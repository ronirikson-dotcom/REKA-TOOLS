"use server";

import {
  authorizeReceivable,
  createCounterSale,
  createWorkOrderInvoice,
  receivePayment,
  refundPayment,
  voidInvoice,
  voidPayment,
} from "@/server/services/invoices";
import { act, formObj, payload, str, type ActionState } from "./_helpers";

export async function createInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createWorkOrderInvoice(ctx, str(fd, "woId"), formObj(fd)), { redirect: (r) => `/invoices/${r.id}` });
}
export async function counterSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createCounterSale(ctx, payload(fd)), { redirect: (r) => `/invoices/${r.id}` });
}
export async function receivePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => receivePayment(ctx, str(fd, "invoiceId"), payload(fd)), {
    success: (r) => {
      if (r.duplicate) return "Pembayaran ini sudah tercatat sebelumnya (duplikat diabaikan)";
      const change = (r.payments ?? []).reduce((a, p) => a + (p.changeAmount ?? 0), 0);
      return `Pembayaran diterima. Status: ${r.paymentStatus.toUpperCase()}${change > 0 ? ` · Kembalian Rp${change.toLocaleString("id-ID")}` : ""}`;
    },
  });
}
export async function voidPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => voidPayment(ctx, str(fd, "id"), str(fd, "reason")), { success: "Pembayaran di-void" });
}
export async function refundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => refundPayment(ctx, str(fd, "invoiceId"), formObj(fd)), { success: "Refund tercatat" });
}
export async function voidInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => voidInvoice(ctx, str(fd, "id"), str(fd, "reason")), { success: "Invoice di-void" });
}
export async function authorizeReceivableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => authorizeReceivable(ctx, str(fd, "id"), { dueDate: str(fd, "dueDate"), note: str(fd, "reason") }), { success: "Piutang diotorisasi" });
}
