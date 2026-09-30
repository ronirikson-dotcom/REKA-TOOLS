export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    posted: "bg-green-100 text-green-800",
    draft: "bg-amber-100 text-amber-800",
    open: "bg-blue-100 text-blue-800",
    closed: "bg-slate-200 text-slate-700",
    reversed: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    posted: "Posted",
    draft: "Draft",
    open: "Open",
    closed: "Closed",
    reversed: "Dibalik",
  };
  return <span className={`badge ${map[status] ?? "bg-slate-100 text-slate-700"}`}>{label[status] ?? status}</span>;
}
