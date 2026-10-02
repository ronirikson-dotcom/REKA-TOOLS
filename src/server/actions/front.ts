"use server";

import { createCustomer, deactivateCustomer, updateCustomer } from "@/server/services/customers";
import { createVehicle, transferOwnership, updateVehicle } from "@/server/services/vehicles";
import { cancelBooking, confirmBooking, createBooking, rescheduleBooking } from "@/server/services/bookings";
import { addCheckinPhotos, cancelCheckin, createCheckin, createInspection } from "@/server/services/checkins";
import { cancelEstimate, createEstimate, recordApproval, sendEstimate, updateEstimate } from "@/server/services/estimates";
import { act, files, formObj, payload, str, type ActionState } from "./_helpers";

// Customer
export async function saveCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  const data = formObj(fd);
  const back = str(fd, "returnTo");
  return act((ctx) => (id ? updateCustomer(ctx, id, data) : createCustomer(ctx, data)), {
    redirect: (r) => (back ? `${back}${back.includes("?") ? "&" : "?"}customerId=${r.id}` : `/customers/${r.id}`),
  });
}

export async function deactivateCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => deactivateCustomer(ctx, str(fd, "id"), str(fd, "reason")), { redirect: "/customers" });
}

// Vehicle
export async function saveVehicleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  const data = formObj(fd);
  const back = str(fd, "returnTo");
  return act((ctx) => (id ? updateVehicle(ctx, id, data) : createVehicle(ctx, data)), {
    redirect: (r) => (back ? `${back}${back.includes("?") ? "&" : "?"}vehicleId=${r.id}` : `/vehicles/${r.id}`),
  });
}

export async function transferVehicleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => transferOwnership(ctx, str(fd, "id"), formObj(fd)), { success: "Kepemilikan kendaraan dipindahkan" });
}

// Booking
export async function createBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => createBooking(ctx, formObj(fd)), { redirect: (r) => `/bookings/${r.id}` });
}
export async function confirmBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => confirmBooking(ctx, str(fd, "id")), { success: "Booking dikonfirmasi" });
}
export async function rescheduleBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => rescheduleBooking(ctx, str(fd, "id"), formObj(fd)), { success: "Jadwal booking diubah" });
}
export async function cancelBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelBooking(ctx, str(fd, "id"), { reason: str(fd, "reason"), noShow: str(fd, "noShow") === "1" }), { success: "Booking diperbarui" });
}

// Check-in & inspeksi
export async function createCheckinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const photos = await files(fd, "photos");
  return act((ctx) => createCheckin(ctx, formObj(fd), photos), { redirect: (r) => `/checkins/${r.id}` });
}
export async function addCheckinPhotosAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const photos = await files(fd, "photos");
  return act((ctx) => addCheckinPhotos(ctx, str(fd, "id"), photos), { success: "Foto ditambahkan" });
}
export async function cancelCheckinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelCheckin(ctx, str(fd, "id"), str(fd, "reason")), { success: "Check-in dibatalkan" });
}
export async function createInspectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "checkinId");
  return act((ctx) => createInspection(ctx, id, payload(fd)), { redirect: `/checkins/${id}` });
}

// Estimate
export async function saveEstimateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  const data = payload<Record<string, unknown>>(fd);
  return act(async (ctx) => (id ? (await updateEstimate(ctx, id, data), { id }) : createEstimate(ctx, data)), { redirect: (r) => `/estimates/${r.id}` });
}
export async function sendEstimateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => sendEstimate(ctx, str(fd, "id")), { success: "Estimate ditandai terkirim ke customer" });
}
export async function approveEstimateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const evidence = await files(fd, "evidence");
  return act((ctx) => recordApproval(ctx, str(fd, "id"), payload(fd), evidence), { success: (r) => `Keputusan customer tersimpan: ${r.status}` });
}
export async function cancelEstimateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act((ctx) => cancelEstimate(ctx, str(fd, "id"), str(fd, "reason")), { success: "Estimate dibatalkan" });
}
