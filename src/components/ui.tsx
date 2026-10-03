import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { statusInfo, type Tone } from "@/lib/status";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "danger" | "ghost" | "success" | "warning";
type Size = "sm" | "md";

export function buttonClass(variant: Variant = "secondary", size: Size = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm",
    variant === "danger" && "bg-red-600 text-white hover:bg-red-700 shadow-sm",
    variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    variant === "warning" && "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100",
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={cn(buttonClass(variant, size), className)} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={cn(buttonClass(variant, size), className)} />;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={cn(inputClass, "pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cn(inputClass, className)} />;
}

export function Field({ label, hint, required, children, className }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-brand-700 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Grid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols === 2 && "md:grid-cols-2", cols === 3 && "md:grid-cols-3", cols === 4 && "sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function DL({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 text-sm", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words font-medium text-slate-800">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>;
}

// ---------------------------------------------------------------------------
// Badge & status
// ---------------------------------------------------------------------------
const toneClass: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneClass[tone], className)}>{children}</span>;
}

export function StatusBadge({ domain, status }: { domain: string; status: string | null | undefined }) {
  const info = statusInfo(domain, status);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cn("whitespace-nowrap px-3 py-2.5", right && "text-right", className)}>{children}</th>;
}

export function Td({ children, className, right, colSpan }: { children?: ReactNode; className?: string; right?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5 align-top text-slate-700", right && "text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function EmptyRow({ colSpan, children = "Belum ada data" }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-700 hover:underline">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "amber" | "red" | "green"; title?: ReactNode; children?: ReactNode }) {
  const cls = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", cls)}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "slate", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "slate" | "blue" | "green" | "amber" | "red" | "purple"; href?: string }) {
  const accent = { slate: "border-l-slate-300", blue: "border-l-brand-500", green: "border-l-emerald-500", amber: "border-l-amber-500", red: "border-l-red-500", purple: "border-l-purple-500" }[tone];
  const body = (
    <div className={cn("h-full rounded-lg border border-slate-200 border-l-4 bg-white p-4 shadow-sm", accent, href && "transition hover:shadow-md")}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, baseHref, params }: { page: number; pageSize: number; total: number; baseHref: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <div className="mt-3 text-xs text-slate-500">{total} data</div>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${baseHref}?${sp.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span className="text-xs">
        Hal. {page} dari {pages} · {total} data
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink size="sm" href={href(page - 1)}>
            ← Sebelumnya
          </ButtonLink>
        )}
        {page < pages && (
          <ButtonLink size="sm" href={href(page + 1)}>
            Berikutnya →
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/** Filter bar berbasis GET (search + filter tambahan) */
export function FilterBar({ action, q, placeholder = "Cari...", children }: { action: string; q?: string; placeholder?: string; children?: ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex-1 sm:min-w-64">
        <Input name="q" defaultValue={q} placeholder={placeholder} />
      </div>
      {children}
      <Button type="submit" variant="secondary">
        Terapkan
      </Button>
    </form>
  );
}

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{value === null || value === undefined ? "-" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)}</span>;
}
