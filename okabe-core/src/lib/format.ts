import type { AccountType, CashFlowCategory, AppRole } from "./types";

const idr = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Angka akuntansi: negatif ditampilkan dalam kurung. */
export function money(value: number | string | null | undefined, opts: { blankZero?: boolean } = {}) {
  const n = Number(value ?? 0);
  if (opts.blankZero && Math.abs(n) < 0.005) return "";
  if (n < 0) return `(${idr.format(Math.abs(n))})`;
  return idr.format(n);
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value.length === 10 ? value + "T00:00:00" : value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function periodLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
};

export const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

export const CASH_FLOW_LABEL: Record<CashFlowCategory, string> = {
  operating: "Aktivitas Operasi",
  investing: "Aktivitas Investasi",
  financing: "Aktivitas Pendanaan",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  accountant: "Akuntan",
  viewer: "Viewer",
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Jurnal Umum",
  reversal: "Jurnal Pembalik",
  pos: "Smart POS",
  receive_item: "Receive Item",
  purchase_invoice: "Purchase Invoice",
  delivery_order: "Delivery Order",
  sales_invoice: "Sales Invoice",
  asset_depreciation: "Penyusutan Aset",
  asset_maintenance: "Pemeliharaan Aset",
};

export function sourceLabel(source: string) {
  return SOURCE_LABEL[source] ?? source;
}

/** Saldo normal debit untuk aset & beban; kredit untuk lainnya. */
export function isDebitNormal(type: AccountType) {
  return type === "asset" || type === "expense";
}

export function todayISO() {
  // Tanggal kerja dalam zona waktu Asia/Jakarta.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}
