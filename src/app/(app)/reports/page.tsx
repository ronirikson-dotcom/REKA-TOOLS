import Link from "next/link";
import { pageContext } from "@/server/page";
import { availableReports } from "@/server/services/reports";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Laporan" };

export default async function ReportsPage() {
  const ctx = await pageContext("report.operational.view", "report.sales.view", "report.inventory.view", "report.customer.view", "report.finance.view");
  const reports = availableReports(ctx);
  const groups = [...new Set(reports.map((r) => r.group))];
  return (
    <>
      <PageHeader title="Laporan" subtitle="Filter tanggal, cabang, customer/kendaraan/mekanik · export Excel (CSV) & PDF (cetak)" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={g} title={g}>
            <ul className="space-y-2">
              {reports
                .filter((r) => r.group === g)
                .map((r) => (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <span className="font-medium text-brand-700">{r.title}</span>
                      <span className="block text-xs text-slate-500">{r.description}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
