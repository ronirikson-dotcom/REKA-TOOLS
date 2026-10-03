import { normalizePhone } from "./utils";

/** Link click-to-chat WhatsApp (notifikasi manual — integrasi API di Phase 3/5) */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export const WA_TEMPLATES = {
  bookingConfirmation: (o: { name: string; plate: string; date: string; time: string; branch: string }) =>
    `Halo ${o.name}, booking servis kendaraan ${o.plate} di ${o.branch} terkonfirmasi pada ${o.date} pukul ${o.time}. Terima kasih.`,
  estimateApproval: (o: { name: string; plate: string; number: string; total: string }) =>
    `Halo ${o.name}, estimate ${o.number} untuk kendaraan ${o.plate} sebesar ${o.total}. Mohon konfirmasi persetujuan pekerjaan. Terima kasih.`,
  serviceProgress: (o: { name: string; plate: string; status: string }) => `Halo ${o.name}, update kendaraan ${o.plate}: ${o.status}.`,
  completion: (o: { name: string; plate: string; total: string }) =>
    `Halo ${o.name}, kendaraan ${o.plate} sudah selesai dikerjakan dan siap diambil. Total tagihan ${o.total}. Terima kasih.`,
  reminder: (o: { name: string; plate: string; description: string; due: string }) =>
    `Halo ${o.name}, kendaraan ${o.plate} sudah waktunya ${o.description.toLowerCase()} (jatuh tempo ${o.due}). Balas pesan ini untuk booking jadwal servis.`,
};
