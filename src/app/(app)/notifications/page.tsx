import Link from "next/link";
import { pageContext } from "@/server/page";
import { listNotifications } from "@/server/services/notifications";
import { markNotificationsReadAction } from "@/server/actions/admin";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/lib/status";

export const metadata = { title: "Notifikasi" };

const TYPE_TONE: Record<string, Tone> = { waiting_qc: "purple", waiting_parts: "orange", low_stock: "red", approval_pending: "blue", rework: "red", ready_handover: "green", invoice_ready: "green" };

export default async function NotificationsPage() {
  const ctx = await pageContext();
  const rows = await listNotifications(ctx, 100);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifikasi"
        subtitle="Waiting QC, Waiting Parts, approval pending, low stock, job baru"
        actions={
          <form action={markNotificationsReadAction}>
            <Button type="submit">Tandai semua dibaca</Button>
          </form>
        }
      />
      <Card bodyClassName="p-0">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Belum ada notifikasi</p>}
        <ul className="divide-y divide-slate-100">
          {rows.map((n) => (
            <li key={n.id} className={n.readAt ? "opacity-60" : "bg-brand-50/40"}>
              <Link href={n.link ?? "#"} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span>
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    {!n.readAt && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                    {n.title}
                  </span>
                  <span className="block text-sm text-slate-600">{n.message}</span>
                </span>
                <span className="shrink-0 text-right">
                  <Badge tone={TYPE_TONE[n.type] ?? "gray"}>{n.type.replace(/_/g, " ")}</Badge>
                  <span className="mt-1 block text-xs text-slate-500">{formatDateTime(n.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
