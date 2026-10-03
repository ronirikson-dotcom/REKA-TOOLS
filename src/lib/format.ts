import { APP_TZ } from "./utils";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "-";
  return idr.format(Number(v));
}

export function formatNumber(v: number | string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "-";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(v));
}

export function formatQty(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "-";
  return num.format(Number(v));
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(v: Date | string | null | undefined): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = toDate(v);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { timeZone: APP_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "-";
  return d.toLocaleString("id-ID", { timeZone: APP_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "-";
  return d.toLocaleTimeString("id-ID", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" });
}

/** Durasi menit -> "1j 25m" */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}j ${m}m` : `${m}m`;
}

/** Umur sejak tanggal -> "3j 10m" / "2h 4j" */
export function formatAge(from: Date | string | null | undefined, now = new Date()): string {
  const d = toDate(from);
  if (!d) return "-";
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}j ${mins % 60}m`;
  return `${Math.floor(h / 24)}h ${h % 24}j`;
}

export function ageHours(from: Date | string | null | undefined, now = new Date()): number {
  const d = toDate(from);
  return d ? (now.getTime() - d.getTime()) / 3600000 : 0;
}

export function fuelLabel(level: number): string {
  if (level <= 5) return "E (Kosong)";
  if (level <= 25) return "1/4";
  if (level <= 50) return "1/2";
  if (level <= 75) return "3/4";
  return "F (Penuh)";
}
