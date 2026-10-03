import { load, pageContext, params, type SP } from "@/server/page";
import { defaultReportFilters, runReport, type ColumnType } from "@/server/services/reports";
import { accessibleBranches } from "@/server/services/settings";
import { Button, ButtonLink, EmptyRow, Field, Input, PageHeader, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { PrintButton } from "@/components/client/print-button";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/status";

function fmt(v: unknown, type: ColumnType | undefined): string {
  if (v === null || v === undefined || v === "") return "-";
  switch (type) {
    case "money":
      return formatMoney(Number(v));
    case "number":
      return formatNumber(Number(v));
    case "hours":
      return formatNumber(Number(v), 1);
    case "percent":
      return `${formatNumber(Number(v), 1)}%`;
    case "date":
      return formatDate(String(v));
    case "datetime":
      return formatDateTime(v as string);
    default:
      return MOVEMENT_LABEL[String(v)] ?? String(v);
  }
}

const NUMERIC: ColumnType[] = ["money", "number", "hours", "percent"];

export default async function ReportPage({ params: rp, searchParams }: { params: Promise<{ key: string }>; searchParams: SP }) {
  const ctx = await pageContext();
  const { key } = await rp;
  const p = await params(searchParams);
  const def = defaultReportFilters();
  const filters = { from: p.get("from") ?? def.from, to: p.get("to") ?? def.to, branchId: p.get("branchId") ?? null, q: p.q || null };
  const [{ meta, rows }, branches] = await Promise.all([load(() => runReport(ctx, key, filters)), accessibleBranches(ctx)]);
  const qs = new URLSearchParams(Object.entries({ from: filters.from, to: filters.to, branchId: filters.branchId ?? "", q: filters.q ?? "" }).filter(([, v]) => v) as [string, string][]);
  const totals = meta.columns.map((c) => (c.type === "money" || (c.type === "number" && !/odometer|due_km|minimum/.test(c.key)) ? rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) : null));
  return (
    <>
      <PageHeader
        title={meta.title}
        subtitle={`${meta.group} · ${meta.description}`}
        back={{ href: "/reports", label: "Laporan" }}
        actions={
          <>
            <ButtonLink href={`/api/reports/${key}/export?${qs.toString()}`} prefetch={false}>
              Export Excel (CSV)
            </ButtonLink>
            <PrintButton label="PDF / Cetak" />
          </>
        }
      />
      <form className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end" action={`/reports/${key}`}>
        <Field label="Dari">
          <Input type="date" name="from" defaultValue={filters.from} />
        </Field>
        <Field label="Sampai">
          <Input type="date" name="to" defaultValue={filters.to} />
        </Field>
        <Field label="Cabang">
          <Select name="branchId" defaultValue={filters.branchId ?? ""}>
            <option value="">{ctx.activeBranchId ? "Cabang aktif" : "Semua cabang (sesuai akses)"}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        {meta.search && (
          <Field label={meta.search}>
            <Input name="q" defaultValue={filters.q ?? ""} />
          </Field>
        )}
        <Button type="submit" variant="primary">
          Tampilkan
        </Button>
      </form>
      <div className="mb-2 hidden print:block">
        <h1 className="text-lg font-bold">{meta.title}</h1>
        <p className="text-sm">
          Periode {formatDate(filters.from)} – {formatDate(filters.to)}
        </p>
      </div>
      <Table className="print-area">
        <THead>
          <tr>
            {meta.columns.map((c) => (
              <Th key={c.key} right={NUMERIC.includes(c.type ?? "text")}>
                {c.label}
              </Th>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={meta.columns.length}>Tidak ada data pada periode ini</EmptyRow>}
          {rows.map((r, i) => (
            <tr key={i}>
              {meta.columns.map((c) => (
                <Td key={c.key} right={NUMERIC.includes(c.type ?? "text")}>
                  {fmt(r[c.key], c.type)}
                </Td>
              ))}
            </tr>
          ))}
          {rows.length > 1 && totals.some((t) => t !== null) && (
            <tr className="bg-slate-50 font-semibold">
              {meta.columns.map((c, i) => (
                <Td key={c.key} right={NUMERIC.includes(c.type ?? "text")}>
                  {i === 0 ? "Total" : totals[i] !== null ? fmt(totals[i], c.type) : ""}
                </Td>
              ))}
            </tr>
          )}
        </TBody>
      </Table>
      <p className="mt-2 text-xs text-slate-500">{rows.length} baris</p>
    </>
  );
}
