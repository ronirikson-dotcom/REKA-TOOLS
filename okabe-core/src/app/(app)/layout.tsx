import { NavLinks } from "@/components/nav-links";
import { canSeeAccounting, canSell, getSession } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/format";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile, role } = await getSession();
  const accounting = canSeeAccounting(role);

  const groups = [
    {
      items: [
        ...(accounting ? [{ href: "/", label: "Dashboard" }] : []),
        ...(canSell(role) ? [{ href: "/pos", label: "🛒 Buka Kasir" }] : []),
      ],
    },
    {
      title: "Smart POS",
      items: [
        { href: "/penjualan", label: "Penjualan" },
        { href: "/pos/checker", label: "Checker Display" },
        ...(role === "manager" || role === "admin" ? [{ href: "/otp", label: "OTP Manajer" }] : []),
        ...(role !== "cashier" ? [{ href: "/shift", label: "Shift Kasir" }] : []),
        { href: "/produk", label: "Produk & Stok" },
        { href: "/pelanggan", label: "Pelanggan (CRM)" },
        ...(role !== "cashier" ? [{ href: "/promo", label: "Promo" }] : []),
      ],
    },
    ...(accounting
      ? [
          {
            title: "Akuntansi",
            items: [
              { href: "/akun", label: "Chart of Accounts" },
              { href: "/jurnal", label: "Jurnal" },
              { href: "/periode", label: "Periode & Tutup Buku" },
            ],
          },
          {
            title: "Laporan",
            items: [
              { href: "/laporan/neraca-saldo", label: "Neraca Saldo" },
              { href: "/laporan/laba-rugi", label: "Laba / Rugi" },
              { href: "/laporan/neraca", label: "Neraca" },
              { href: "/laporan/arus-kas", label: "Arus Kas" },
              { href: "/laporan/buku-besar", label: "Buku Besar" },
            ],
          },
        ]
      : []),
    {
      title: "Sistem",
      items: [
        ...(role === "admin" || role === "accountant" || role === "manager" ? [{ href: "/audit", label: "Audit Trail" }] : []),
        ...(role === "admin" ? [{ href: "/pengaturan", label: "Pengaturan POS" }] : []),
        { href: "/pengguna", label: "Pengguna" },
      ],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-slate-900 print:hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">OK</div>
          <div>
            <div className="text-sm font-semibold text-white">OKABE CORE</div>
            <div className="text-[11px] text-slate-400">ERP · Smart POS</div>
          </div>
        </div>
        <div className="lg:flex-1 lg:overflow-y-auto">
          <NavLinks groups={groups} />
        </div>
        <div className="hidden border-t border-slate-800 px-5 py-4 lg:block">
          <div className="truncate text-sm text-white">{profile?.full_name ?? user.email}</div>
          <div className="truncate text-xs text-slate-400">
            {user.email} · {ROLE_LABEL[role]}
          </div>
          <form action={signOut} className="mt-2">
            <button className="text-xs text-slate-400 hover:text-white">Keluar →</button>
          </form>
        </div>
      </aside>
      <div className="flex-1 lg:pl-60">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-sm print:hidden lg:hidden">
          <span className="truncate text-slate-600">
            {user.email} · {ROLE_LABEL[role]}
          </span>
          <form action={signOut}>
            <button className="link">Keluar</button>
          </form>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
