import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import type { AppRole, Profile } from "@/lib/types";
import { setPhone, setRole } from "./actions";

export const metadata: Metadata = { title: "Pengguna" };

const ROLE_DESC: Record<AppRole, string> = {
  admin: "Semua akses: peran pengguna, pengaturan, buka kembali periode",
  manager: "Menyetujui OTP (void, retur, diskon), kelola produk & promo, bisa berjualan",
  accountant: "Kelola akun, jurnal, posting, pembalik, tutup buku",
  cashier: "Layar kasir, pelanggan, checker display",
  viewer: "Hanya melihat laporan dan jurnal",
};
const ORDER: AppRole[] = ["admin", "manager", "accountant", "cashier", "viewer"];

export default async function UsersPage() {
  const { supabase, user, role } = await getSession();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader title="Pengguna & Peran" subtitle="Pengguna baru mendaftar lewat halaman login dan otomatis berperan Viewer." />
      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        {ORDER.map((r) => (
          <div key={r} className="card p-3 text-xs">
            <div className="text-sm font-semibold">{ROLE_LABEL[r]}</div>
            <div className="text-slate-500">{ROLE_DESC[r]}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[860px]">
          <thead>
            <tr><th>Nama</th><th>Email</th><th>WhatsApp (OTP)</th><th>Terdaftar</th><th>Peran</th>{role === "admin" && <th>Ubah peran</th>}</tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}{u.id === user.id && <span className="ml-1 text-xs text-slate-400">(Anda)</span>}</td>
                <td className="text-xs">{u.email}</td>
                <td className="text-xs">
                  <span className="font-mono">{u.phone ?? "-"}</span>
                  {(role === "admin" || u.id === user.id) && (
                    <ActionButton action={setPhone.bind(null, u.id)} label="ubah" className="btn btn-ghost ml-1 px-1 py-0 text-xs"
                      prompt="Nomor WhatsApp (mis. 0812…) — dipakai untuk menerima OTP:" />
                  )}
                </td>
                <td className="text-xs">{fmtDate(u.created_at)}</td>
                <td className="font-medium">{ROLE_LABEL[u.role]}</td>
                {role === "admin" && (
                  <td className="text-xs">
                    {u.id !== user.id &&
                      ORDER.filter((r) => r !== u.role).map((r) => (
                        <ActionButton key={r} action={setRole.bind(null, u.id, r)} label={ROLE_LABEL[r]} className="btn btn-ghost px-1.5 py-0.5 text-xs" />
                      ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
