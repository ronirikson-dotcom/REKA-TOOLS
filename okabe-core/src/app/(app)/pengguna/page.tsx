import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/data";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import type { AppRole, Profile } from "@/lib/types";
import { setRole } from "./actions";

export const metadata: Metadata = { title: "Pengguna" };

const ROLE_DESC: Record<AppRole, string> = {
  admin: "Semua akses, termasuk mengatur peran dan membuka kembali periode",
  accountant: "Kelola akun, jurnal, posting, pembalik, dan tutup buku",
  viewer: "Hanya melihat laporan dan jurnal",
};

export default async function UsersPage() {
  const { supabase, user, role } = await getSession();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader title="Pengguna & Peran" subtitle="Pengguna baru mendaftar lewat halaman login dan otomatis berperan Viewer." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_DESC) as AppRole[]).map((r) => (
          <div key={r} className="card p-3 text-sm">
            <div className="font-semibold">{ROLE_LABEL[r]}</div>
            <div className="text-slate-500">{ROLE_DESC[r]}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Terdaftar</th>
              <th>Peran</th>
              {role === "admin" && <th />}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}{u.id === user.id && <span className="ml-1 text-xs text-slate-400">(Anda)</span>}</td>
                <td>{u.email}</td>
                <td>{fmtDate(u.created_at)}</td>
                <td className="font-medium">{ROLE_LABEL[u.role]}</td>
                {role === "admin" && (
                  <td className="whitespace-nowrap text-right">
                    {u.id !== user.id &&
                      (Object.keys(ROLE_LABEL) as AppRole[])
                        .filter((r) => r !== u.role)
                        .map((r) => (
                          <ActionButton key={r} action={setRole.bind(null, u.id, r)} label={`Jadikan ${ROLE_LABEL[r]}`} className="btn btn-ghost text-xs" />
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
