import Link from "next/link";
import { flattenTree } from "@/lib/data";
import { money } from "@/lib/format";
import type { Account, AccountType } from "@/lib/types";

export function DateRangeForm({
  from,
  to,
  single,
  children,
}: {
  from?: string;
  to: string;
  single?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <form className="card mb-4 flex flex-wrap items-end gap-3 p-4 print:hidden">
      {children}
      {!single && (
        <div>
          <label className="label" htmlFor="dari">Dari</label>
          <input id="dari" className="input" type="date" name="dari" defaultValue={from} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="sampai">{single ? "Per tanggal" : "Sampai"}</label>
        <input id="sampai" className="input" type="date" name="sampai" defaultValue={to} />
      </div>
      <button className="btn btn-primary">Tampilkan</button>
    </form>
  );
}

/** Pohon akun untuk satu tipe beserta nilai (sudah dalam arah saldo normal). */
export function AccountTreeRows({
  accounts,
  types,
  values,
  ledgerQuery,
}: {
  accounts: Account[];
  types: AccountType[];
  values: Map<string, number>;
  ledgerQuery: string;
}) {
  const rows = flattenTree(accounts.filter((a) => types.includes(a.type))).filter(
    ({ account }) => Math.abs(values.get(account.id) ?? 0) >= 0.005,
  );
  return (
    <>
      {rows.map(({ account: a, depth }) => (
        <tr key={a.id} className={a.is_postable ? "" : "font-semibold"}>
          <td>
            <span style={{ paddingLeft: depth * 18 }}>
              <span className="mr-2 font-mono text-xs text-slate-400">{a.code}</span>
              {a.name}
            </span>
          </td>
          <td className="num">
            {a.is_postable ? (
              <Link className="hover:underline" href={`/laporan/buku-besar?akun=${a.id}&${ledgerQuery}`}>
                {money(values.get(a.id))}
              </Link>
            ) : (
              money(values.get(a.id))
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-slate-100 text-base font-bold" : "bg-slate-50 font-semibold"}>
      <td className="px-3 py-2">{label}</td>
      <td className="num px-3 py-2">{money(value)}</td>
    </tr>
  );
}

export function SectionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="bg-white pt-5 text-xs font-bold uppercase tracking-wider text-brand-700">
        {label}
      </td>
    </tr>
  );
}

export function readRange(sp: Record<string, string | string[] | undefined>, today: string) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const to = typeof sp.sampai === "string" && iso.test(sp.sampai) ? sp.sampai : today;
  const from = typeof sp.dari === "string" && iso.test(sp.dari) ? sp.dari : `${to.slice(0, 7)}-01`;
  return { from, to };
}
