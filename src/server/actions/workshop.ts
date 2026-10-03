"use server";

import {
  assignMechanic,
  cancelWorkOrder,
  createWorkOrder,
  jobAction,
  overrideJobPrice,
  setWaitingParts,
  updateJobNotes,
  updateWorkOrder,
  type JobAction,
} from "@/server/services/workorders";
import { submitQc } from "@/server/services/qc";
import { cancelPartRequest, createPartRequest, issuePartRequest, returnPartItem } from "@/server/services/inventory";
import { handoverVehicle } from "@/server/services/handover";
import { act, formObj, payload, str, type ActionState } from "./_helpers";

export async function createWorkOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createWorkOrder(ctx, formObj(fd)), { redirect: (r) => `/work-orders/${r.id}` });
}
export async function updateWorkOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => updateWorkOrder(ctx, str(fd, "id"), formObj(fd)), { success: "Work Order diperbarui" });
}
export async function assignMechanicAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => assignMechanic(ctx, str(fd, "woId"), formObj(fd)), { success: "Mekanik ditugaskan" });
}
export async function jobActionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const action = str(fd, "action") as JobAction;
  return act((ctx) => jobAction(ctx, str(fd, "jobId"), action, str(fd, "note") || null), { success: "Status job diperbarui" });
}
export async function jobNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => updateJobNotes(ctx, str(fd, "jobId"), str(fd, "notes") || null), { success: "Catatan disimpan" });
}
export async function waitingPartsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => setWaitingParts(ctx, str(fd, "id"), str(fd, "waiting") === "1", str(fd, "reason") || null), { success: "Status diperbarui" });
}
export async function cancelWorkOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelWorkOrder(ctx, str(fd, "id"), str(fd, "reason")), { success: "Work Order dibatalkan" });
}
export async function overrideJobPriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => overrideJobPrice(ctx, str(fd, "jobId"), formObj(fd)), { success: "Harga job diubah dan tercatat di audit" });
}
export async function createPartRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createPartRequest(ctx, str(fd, "woId"), payload(fd)), {
    success: (r) => `${r.requestNumber} dibuat.${r.shortage ? " Stok kurang — WO berstatus Waiting Parts." : ""}${r.warnings.length ? " " + r.warnings.join(" ") : ""}`,
  });
}
export async function issuePartRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => issuePartRequest(ctx, str(fd, "id"), payload(fd)), { success: (r) => `Part dikeluarkan (${r.status})` });
}
export async function returnPartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => returnPartItem(ctx, str(fd, "itemId"), { qty: str(fd, "qty"), reason: str(fd, "reason") }), { success: "Part diretur ke gudang" });
}
export async function cancelPartRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelPartRequest(ctx, str(fd, "id"), str(fd, "reason")), { success: "Permintaan part dibatalkan" });
}
export async function submitQcAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const woId = str(fd, "woId");
  return act((ctx) => submitQc(ctx, woId, payload(fd)), { redirect: `/work-orders/${woId}` });
}
export async function handoverAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => handoverVehicle(ctx, str(fd, "woId"), formObj(fd)), {
    success: (r) => `Kendaraan diserahkan${r.override ? " (override tercatat)" : ""}. ${r.reminders.length} service reminder dibuat.`,
  });
}
