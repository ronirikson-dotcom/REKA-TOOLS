export const APP_TZ = "Asia/Jakarta";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum<T>(items: T[], fn: (item: T) => number): number {
  return round2(items.reduce((acc, it) => acc + (fn(it) || 0), 0));
}

/** Bagian tanggal dalam zona waktu Asia/Jakarta */
export function jakartaParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** YYYY-MM-DD dalam zona waktu Jakarta */
export function todayISO(date: Date = new Date()): string {
  const p = jakartaParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonthISO(iso: string = todayISO()): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Awal hari (00:00 WIB) sebagai Date UTC */
export function jakartaDayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00+07:00`);
}

export function jakartaDayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999+07:00`);
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Format tampilan nomor polisi: B1234ABC -> B 1234 ABC */
export function formatPlate(plate: string): string {
  const m = normalizePlate(plate).match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  if (!m) return plate.toUpperCase();
  return [m[1], m[2], m[3]].filter(Boolean).join(" ");
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function emptyToNull<T>(v: T): T | null {
  if (v === "" || v === undefined) return null;
  return v;
}
