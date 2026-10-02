import Link from "next/link";
import { Bell, LogOut, Search, UserCircle } from "lucide-react";
import { requireContext } from "@/server/auth/session";
import { accessibleBranches, getCompany } from "@/server/services/settings";
import { countUnread } from "@/server/services/notifications";
import { navFor } from "@/lib/nav";
import { Sidebar } from "@/components/client/sidebar";
import { BranchSwitcher } from "@/components/client/branch-switcher";
import { logoutAction } from "@/server/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const [company, branches, unread] = await Promise.all([getCompany(ctx), accessibleBranches(ctx), countUnread(ctx)]);
  return (
    <div className="min-h-screen">
      <Sidebar groups={navFor(ctx.permissions)} companyName={company.name} />
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-2 py-2.5 pl-14 pr-3 sm:gap-3 lg:px-6">
            <form action="/search" className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                name="q"
                placeholder="Cari no. polisi, customer, HP, WO, invoice, SKU..."
                className="w-full rounded-md border border-slate-300 bg-slate-50 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
              />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <BranchSwitcher branches={branches.map((b) => ({ id: b.id, name: b.name }))} active={ctx.activeBranchId} canSwitch={ctx.allBranches} />
              <Link href="/notifications" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifikasi">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
              <Link href="/account" className="hidden items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100 md:flex">
                <UserCircle className="h-6 w-6 text-slate-400" />
                <span className="text-left leading-tight">
                  <span className="block text-xs font-semibold text-slate-800">{ctx.userName}</span>
                  <span className="block text-[11px] text-slate-500">{ctx.roleName}</span>
                </span>
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600" aria-label="Logout" title="Logout">
                  <LogOut className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
