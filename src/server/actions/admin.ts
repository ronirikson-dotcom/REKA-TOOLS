"use server";

import { createManualReminder, followUpReminder } from "@/server/services/reminders";
import { saveBranch, saveRole, saveUser, saveWarehouse, unlockUser, updateCompany } from "@/server/services/settings";
import { saveBrand, saveInspectionTemplateItems, saveModel, savePaymentMethod } from "@/server/services/masters";
import { markAllRead } from "@/server/services/notifications";
import { act, formObj, payload, str, type ActionState } from "./_helpers";

export async function followUpReminderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => followUpReminder(ctx, str(fd, "id"), formObj(fd)), { success: "Follow-up tersimpan" });
}
export async function createReminderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createManualReminder(ctx, formObj(fd)), { success: "Reminder ditambahkan" });
}
export async function updateCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => updateCompany(ctx, payload(fd)), { success: "Pengaturan perusahaan disimpan" });
}
export async function saveBranchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveBranch(ctx, str(fd, "id") || null, formObj(fd)), { success: "Cabang disimpan" });
}
export async function saveWarehouseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveWarehouse(ctx, str(fd, "id") || null, formObj(fd)), { success: "Gudang disimpan" });
}
export async function saveUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveUser(ctx, str(fd, "id") || null, formObj(fd)), { redirect: "/settings/users" });
}
export async function unlockUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => unlockUser(ctx, str(fd, "id")), { success: "User dibuka kuncinya" });
}
export async function saveRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveRole(ctx, str(fd, "id") || null, payload(fd)), { redirect: "/settings/roles" });
}
export async function savePaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => savePaymentMethod(ctx, str(fd, "id") || null, formObj(fd)), { success: "Metode pembayaran disimpan" });
}
export async function saveBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveBrand(ctx, formObj(fd)), { success: "Merk ditambahkan" });
}
export async function saveModelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveModel(ctx, formObj(fd)), { success: "Model ditambahkan" });
}
export async function saveTemplateItemsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => saveInspectionTemplateItems(ctx, str(fd, "id"), payload(fd)), { success: "Template inspeksi disimpan" });
}
export async function markNotificationsReadAction() {
  await act((ctx) => markAllRead(ctx));
}
