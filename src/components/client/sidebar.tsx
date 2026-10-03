"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Banknote, BarChart3, BellRing, Boxes, Building2, CalendarClock, Car, Circle, ClipboardCheck, ClipboardList, Cog, CreditCard, FileText, Hammer, HardHat, History, KanbanSquare, KeyRound, LayoutDashboard, ListChecks, Menu, PackagePlus, PackageSearch, Receipt, ScanBarcode, Settings, ShieldCheck, ShoppingCart, Store, Tags, Truck, UserCog, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/components/ui";

const ICONS: Record<string, LucideIcon> = { ArrowLeftRight, Banknote, BarChart3, BellRing, Boxes, Building2, CalendarClock, Car, Circle, ClipboardCheck, ClipboardList, Cog, CreditCard, FileText, Hammer, HardHat, History, KanbanSquare, KeyRound, LayoutDashboard, ListChecks, Menu, PackagePlus, PackageSearch, Receipt, ScanBarcode, Settings, ShieldCheck, ShoppingCart, Store, Tags, Truck, UserCog, Users, Wallet, Wrench };

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return <C className={className} aria-hidden />;
}

export function Sidebar({ groups, companyName }: { groups: NavGroup[]; companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/")) return false;
    // pilih item yang paling spesifik
    return !allHrefs.some((h) => h !== href && h.startsWith(href) && (pathname === h || pathname.startsWith(h + "/")));
  };
  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    isActive(item.href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Wrench className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900">{companyName}</span>
        <span className="block text-[11px] text-slate-500">Workshop Management</span>
      </span>
    </Link>
  );
  return (
    <>
      <button type="button" className="no-print fixed left-3 top-3 z-40 rounded-md border border-slate-200 bg-white p-2 shadow-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
        <Menu className="h-5 w-5" />
      </button>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            {brand}
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
