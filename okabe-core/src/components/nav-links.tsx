"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Group = { title?: string; items: Item[] };

export function NavLinks({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
      {groups.map((g, i) => (
        <div key={i} className="flex gap-1 lg:flex-col">
          {g.title && (
            <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">
              {g.title}
            </div>
          )}
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
                isActive(it.href)
                  ? "bg-brand-600 font-medium text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
