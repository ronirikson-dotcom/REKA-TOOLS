import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";

export const metadata: Metadata = { title: "Audit Trail" };

const PAGE = 50;
const ACTION_LABEL: Record<string, string> = {
  INSERT: "Tambah",
  UPDATE: "Ubah",
  DELETE: "Hapus",
  POST_JOURNAL: "Posting jurnal",
  REVERSE_JOURNAL: "Jurnal pembalik",
  AUTO_JOURNAL: "Jurnal otomatis",
  CLOSE_PERIOD: "Tutup buku",
  REQUEST_OTP: "Minta OTP",
  VERIFY_OTP: "OTP disetujui",
  VOID_SALE: "Void penjualan",
  RETURN_SALE: "Retur penjualan",
  CLOSE_SHIFT: "Tutup shift",
  RECEIVE_STOCK: "Terima stok",
  SET_SECRET: "Ubah provider OTP",
  REOPEN_PERIOD: "Buka kembali periode",
};
const TABLE_LABEL: Record<string, string> = {
  journal_entries: "Jurnal",
  journal_lines: "Baris jurnal",
  accounts: "Akun",
  fiscal_periods: "Periode",
  profiles: "Pengguna",
  products: "Produk",
  customers: "Pelanggan",
  promotions: "Promo",
  pos_sales: "Penjualan POS",
  pos_returns: "Retur POS",
  pos_shifts: "Shift kasir",
  otp_requests: "OTP",
  app_settings: "Pengaturan",
};

function summarize(log: AuditLog) {
  const d = (log.new_data ?? log.old_data ?? {}) as Record<string, unknown>;
  if (log.note) return log.note;
  if (log.table_name === "journal_entries") return `${d.entry_no ?? ""} ${d.description ?? ""} (${d.status ?? ""})`;
  if (log.table_name === "journal_lines") return `baris ${d.line_no ?? ""}: D ${d.debit ?? 0} / K ${d.credit ?? 0}`;
  if (log.table_name === "accounts") return `${d.code ?? ""} ${d.name ?? ""}`;
  if (log.table_name === "fiscal_periods") return `${d.month}/${d.year} → ${d.status}`;
  if (log.table_name === "profiles") return `${d.email ?? ""} → ${d.role ?? ""}`;
  if (log.table_name === "pos_sales") return `${d.sale_no ?? ""} total ${d.total ?? ""} (${d.status ?? ""})`;
  if (log.table_name === "products") return `${d.sku ?? ""} ${d.name ?? ""} · harga ${d.price ?? ""}`;
  if (log.table_name === "customers") return `${d.name ?? ""} ${d.phone ?? ""}`;
  if (log.table_name === "promotions") return `${d.name ?? ""} (${d.type ?? ""})`;
  if (log.table_name === "pos_shifts") return `${d.shift_no ?? ""} (${d.status ?? ""})`;
  if (log.table_name === "otp_requests") return `${d.action ?? ""} via ${d.channel ?? ""}`;
  return "";
}

function changedFields(log: AuditLog) {
  if (log.action !== "UPDATE" || !log.old_data || !log.new_data) return [];
  return Object.keys(log.new_data).filter(
    (k) => k !== "updated_at" && JSON.stringify(log.new_data![k]) !== JSON.stringify(log.old_data![k]),
  );
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role === "viewer" || role === "cashier") redirect("/");
  const page = Math.max(1, Number(sp.page) || 1);
  const record = typeof sp.record === "string" ? sp.record : "";
  const onlyEvents = sp.events === "1";

  let q = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (record) q = q.or(`record_id.eq.${record},new_data->>entry_id.eq.${record},old_data->>entry_id.eq.${record}`);
  if (onlyEvents) q = q.not("action", "in", "(INSERT,UPDATE,DELETE)");
  const { data, count, error } = await q;
  const logs = (data ?? []) as AuditLog[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => `?page=${p}${record ? `&record=${record}` : ""}${onlyEvents ? "&events=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Audit Trail"
        subtitle="Catatan permanen seluruh perubahan data: pengguna, waktu, dan alamat IP. Tidak dapat diubah atau dihapus."
        actions={
          <>
            {record && <Link className="btn" href="/audit">Tampilkan semua</Link>}
            <Link className="btn" href={onlyEvents ? "/audit" : "/audit?events=1"}>
              {onlyEvents ? "Semua aktivitas" : "Hanya aksi penting"}
            </Link>
          </>
        }
      />
      {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[860px]">
          <thead>
            <tr>
              <th>Waktu (WIB)</th>
              <th>Pengguna</th>
              <th>IP</th>
              <th>Aksi</th>
              <th>Objek</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const fields = changedFields(l);
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(l.occurred_at)}</td>
                  <td className="text-xs">{l.user_email ?? <span className="text-slate-400">sistem</span>}</td>
                  <td className="font-mono text-xs">{l.ip_address ?? "-"}</td>
                  <td className="whitespace-nowrap text-xs font-medium">{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="whitespace-nowrap text-xs">{TABLE_LABEL[l.table_name ?? ""] ?? l.table_name}</td>
                  <td className="text-xs">
                    {summarize(l)}
                    {fields.length > 0 && <div className="text-slate-500">diubah: {fields.join(", ")}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-500">{count ?? 0} catatan · halaman {page} dari {pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="btn" href={qs(page - 1)}>← Sebelumnya</Link>}
          {page < pages && <Link className="btn" href={qs(page + 1)}>Berikutnya →</Link>}
        </div>
      </div>
    </>
  );
}
