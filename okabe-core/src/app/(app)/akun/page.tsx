import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EPOCH, canWrite, closingDebit, flattenTree, getAccounts, getActivity, getSession, normalBalance, rollup } from "@/lib/data";
import { ACCOUNT_TYPE_LABEL, CASH_FLOW_LABEL, money, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Chart of Accounts" };

export default async function AccountsPage() {
  const { role } = await getSession();
  const [accounts, activity] = await Promise.all([getAccounts(), getActivity(EPOCH, todayISO())]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const totals = rollup(accounts, (a) => closingDebit(activity.get(a.id)));
  const rows = flattenTree(accounts);

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Struktur akun hierarkis (parent–child). Saldo per hari ini, hanya jurnal Posted."
        actions={canWrite(role) && <Link href="/akun/baru" className="btn btn-primary">+ Akun baru</Link>}
      />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama akun</th>
              <th>Tipe</th>
              <th>Arus kas</th>
              <th className="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account: a, depth }) => {
              const root = (() => {
                let cur = a;
                while (cur.parent_id && byId.get(cur.parent_id)) cur = byId.get(cur.parent_id)!;
                return cur;
              })();
              const bal = normalBalance(root, totals.get(a.id) ?? 0);
              return (
                <tr key={a.id} className={a.is_postable ? "" : "bg-slate-50/60 font-semibold"}>
                  <td className="font-mono">{a.code}</td>
                  <td>
                    <span style={{ paddingLeft: depth * 18 }} className="inline-flex flex-wrap items-center gap-2">
                      <Link href={canWrite(role) ? `/akun/${a.id}` : `/laporan/buku-besar?akun=${a.id}`} className="hover:underline">
                        {a.name}
                      </Link>
                      {a.is_cash && <span className="badge bg-emerald-100 text-emerald-800">Kas/Bank</span>}
                      {!a.is_postable && <span className="badge bg-slate-200 text-slate-600">Header</span>}
                      {!a.is_active && <span className="badge bg-red-100 text-red-700">Nonaktif</span>}
                    </span>
                  </td>
                  <td>{ACCOUNT_TYPE_LABEL[a.type]}</td>
                  <td className="text-xs text-slate-500">{a.is_postable ? CASH_FLOW_LABEL[a.cash_flow_category].replace("Aktivitas ", "") : ""}</td>
                  <td className="num">
                    {a.is_postable ? (
                      <Link href={`/laporan/buku-besar?akun=${a.id}`} className="hover:underline">{money(bal)}</Link>
                    ) : (
                      money(bal)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
