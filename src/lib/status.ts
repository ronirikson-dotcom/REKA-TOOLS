/** Label & warna badge status yang konsisten (SRS 4.6, 4.7) */
export type Tone = "gray" | "blue" | "indigo" | "amber" | "orange" | "green" | "red" | "purple" | "teal";

type StatusMap = Record<string, { label: string; tone: Tone }>;

export const STATUS: Record<string, StatusMap> = {
  booking: {
    scheduled: { label: "Scheduled", tone: "blue" },
    confirmed: { label: "Confirmed", tone: "indigo" },
    arrived: { label: "Arrived", tone: "green" },
    cancelled: { label: "Cancelled", tone: "red" },
    no_show: { label: "No Show", tone: "gray" },
  },
  checkin: {
    open: { label: "Open", tone: "blue" },
    in_progress: { label: "Di Workshop", tone: "amber" },
    completed: { label: "Selesai", tone: "green" },
    cancelled: { label: "Batal", tone: "red" },
  },
  estimate: {
    draft: { label: "Draft", tone: "gray" },
    sent: { label: "Sent", tone: "blue" },
    partially_approved: { label: "Partially Approved", tone: "teal" },
    approved: { label: "Approved", tone: "green" },
    rejected: { label: "Rejected", tone: "red" },
    expired: { label: "Expired", tone: "orange" },
    cancelled: { label: "Cancelled", tone: "gray" },
  },
  estimateItem: {
    pending: { label: "Menunggu", tone: "gray" },
    approved: { label: "Disetujui", tone: "green" },
    rejected: { label: "Ditolak", tone: "red" },
  },
  workorder: {
    waiting: { label: "Waiting", tone: "gray" },
    assigned: { label: "Assigned", tone: "blue" },
    in_progress: { label: "In Progress", tone: "indigo" },
    paused: { label: "Paused", tone: "amber" },
    waiting_parts: { label: "Waiting Parts", tone: "orange" },
    qc: { label: "QC", tone: "purple" },
    rework: { label: "Rework", tone: "red" },
    completed: { label: "Completed", tone: "green" },
    cancelled: { label: "Cancelled", tone: "gray" },
  },
  job: {
    pending: { label: "Belum mulai", tone: "gray" },
    in_progress: { label: "Dikerjakan", tone: "indigo" },
    paused: { label: "Pause", tone: "amber" },
    completed: { label: "Selesai", tone: "green" },
    cancelled: { label: "Batal", tone: "gray" },
  },
  partRequest: {
    requested: { label: "Requested", tone: "blue" },
    partially_issued: { label: "Partially Issued", tone: "amber" },
    issued: { label: "Issued", tone: "green" },
    cancelled: { label: "Cancelled", tone: "gray" },
  },
  qc: {
    pass: { label: "Pass", tone: "green" },
    fail: { label: "Fail", tone: "red" },
    rework: { label: "Rework", tone: "orange" },
  },
  payment: {
    unpaid: { label: "Unpaid", tone: "red" },
    partial: { label: "Partial", tone: "amber" },
    paid: { label: "Paid", tone: "green" },
    refunded: { label: "Refunded", tone: "purple" },
  },
  invoice: {
    issued: { label: "Issued", tone: "blue" },
    void: { label: "Void", tone: "gray" },
  },
  paymentLine: {
    posted: { label: "Posted", tone: "green" },
    void: { label: "Void", tone: "gray" },
  },
  inspection: {
    good: { label: "Good", tone: "green" },
    attention: { label: "Attention", tone: "amber" },
    replace: { label: "Replace", tone: "red" },
    not_checked: { label: "Not Checked", tone: "gray" },
  },
  reminder: {
    pending: { label: "Pending", tone: "blue" },
    contacted: { label: "Dihubungi", tone: "amber" },
    booked: { label: "Booked", tone: "indigo" },
    done: { label: "Selesai", tone: "green" },
    cancelled: { label: "Batal", tone: "gray" },
  },
  po: {
    draft: { label: "Draft", tone: "gray" },
    ordered: { label: "Ordered", tone: "blue" },
    partially_received: { label: "Partial Received", tone: "amber" },
    received: { label: "Received", tone: "green" },
    cancelled: { label: "Cancelled", tone: "gray" },
  },
  priority: {
    low: { label: "Low", tone: "gray" },
    normal: { label: "Normal", tone: "blue" },
    high: { label: "High", tone: "orange" },
    urgent: { label: "Urgent", tone: "red" },
  },
  active: {
    active: { label: "Aktif", tone: "green" },
    inactive: { label: "Nonaktif", tone: "gray" },
  },
};

export function statusInfo(domain: string, status: string | null | undefined) {
  if (!status) return { label: "-", tone: "gray" as Tone };
  return STATUS[domain]?.[status] ?? { label: status, tone: "gray" as Tone };
}

export const CUSTOMER_TYPES: Record<string, string> = { retail: "Retail", corporate: "Corporate", fleet: "Fleet" };
export const VEHICLE_TYPES: Record<string, string> = { car: "Mobil", motorcycle: "Motor", all: "Semua" };
export const BOOKING_SOURCE_LABEL: Record<string, string> = { admin: "Admin", phone: "Telepon", whatsapp: "WhatsApp", walk_in: "Walk-in", online: "Online" };
export const ITEM_TYPE_LABEL: Record<string, string> = { service: "Jasa", part: "Part", material: "Material" };
export const CHANNEL_LABEL: Record<string, string> = { in_person: "Langsung", phone: "Telepon", whatsapp: "WhatsApp", email: "Email" };
export const MOVEMENT_LABEL: Record<string, string> = {
  receive: "Penerimaan",
  issue: "Issue WO",
  return: "Retur WO",
  adjust_in: "Adjustment +",
  adjust_out: "Adjustment -",
  transfer_in: "Transfer Masuk",
  transfer_out: "Transfer Keluar",
  sale: "Penjualan",
  sale_void: "Void Penjualan",
};
export const PAYMENT_TYPE_LABEL: Record<string, string> = { cash: "Tunai", qris: "QRIS", debit: "Debit", credit_card: "Kartu Kredit", transfer: "Transfer", ewallet: "E-Wallet" };
