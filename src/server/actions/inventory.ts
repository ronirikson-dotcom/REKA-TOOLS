"use server";

import {
  cancelPurchaseOrder,
  createAdjustment,
  createPurchaseOrder,
  createTransfer,
  receiveGoods,
  submitPurchaseOrder,
} from "@/server/services/inventory";
import { savePart, savePartCategory, saveService, saveSupplier } from "@/server/services/masters";
import { act, formObj, payload, str, type ActionState } from "./_helpers";

export async function receiveGoodsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => receiveGoods(ctx, payload(fd)), { redirect: (r) => `/inventory/receiving/${r.id}` });
}
export async function createAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createAdjustment(ctx, payload(fd)), { redirect: (r) => `/inventory/adjustments/${r.id}` });
}
export async function createTransferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createTransfer(ctx, payload(fd)), { redirect: "/inventory/transfers" });
}
export async function createPurchaseOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createPurchaseOrder(ctx, payload(fd)), { redirect: (r) => `/purchasing/${r.id}` });
}
export async function submitPurchaseOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => submitPurchaseOrder(ctx, str(fd, "id")), { success: "PO disetujui & dikirim ke supplier" });
}
export async function cancelPurchaseOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelPurchaseOrder(ctx, str(fd, "id"), str(fd, "reason")), { success: "PO dibatalkan" });
}
export async function savePartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => savePart(ctx, str(fd, "id") || null, formObj(fd)), { redirect: "/master/parts" });
}
export async function savePartCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => savePartCategory(ctx, formObj(fd)), { success: "Kategori ditambahkan" });
}
export async function saveServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveService(ctx, str(fd, "id") || null, formObj(fd)), { redirect: "/master/services" });
}
export async function saveSupplierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveSupplier(ctx, str(fd, "id") || null, formObj(fd)), { redirect: "/master/suppliers" });
}
