import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getPartRequest } from "@/server/services/inventory";
import { IssueForm } from "@/components/client/issue-form";
import { ConfirmButton } from "@/components/client/action-form";
import { cancelPartRequestAction, issuePartRequestAction } from "@/server/actions/workshop";
import { Card, DL, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function PartRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("partrequest.view", "inventory.issue");
  const { id } = await params;
  const pr = await load(() => getPartRequest(ctx, id));
  const open = ["requested", "partially_issued"].includes(pr.status);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={pr.requestNumber}
        subtitle={<StatusBadge domain="partRequest" status={pr.status} />}
        back={{ href: "/part-requests", label: "Permintaan Part" }}
        actions={
          open && (
            <ConfirmButton action={cancelPartRequestAction} fields={{ id: pr.id }} label="Batalkan sisa permintaan" variant="danger" requireReason title="Batalkan permintaan part?" />
          )
        }
      />
      <Card className="mb-4">
        <DL
          cols={3}
          items={[
            ["Work Order", <Link key="w" className="text-brand-700 hover:underline" href={`/work-orders/${pr.workOrderId}`}>{pr.workOrder.woNumber}</Link>],
            ["Kendaraan", pr.workOrder.vehicle.plateNumber],
            ["Customer", pr.workOrder.customer.name],
            ["Diminta oleh", pr.mechanic?.name],
            ["Waktu", formatDateTime(pr.requestDate)],
            ["Gudang", pr.warehouse.name],
          ]}
        />
        {pr.notes && <p className="mt-3 text-sm">{pr.notes}</p>}
        {pr.cancelReason && <p className="mt-3 text-sm text-red-700">Dibatalkan: {pr.cancelReason}</p>}
      </Card>
      <Card title="Item">
        {open && ctx.permissions.has("inventory.issue") ? (
          <IssueForm
            action={issuePartRequestAction}
            requestId={pr.id}
            items={pr.items.map((i) => ({ id: i.id, partName: i.part.partName, sku: i.part.sku, qtyRequested: i.qtyRequested, qtyIssued: i.qtyIssued, available: i.available }))}
          />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {pr.items.map((i) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>
                  {i.part.partName} <span className="text-xs text-slate-500">{i.part.sku}</span>
                </span>
                <span>
                  diminta {i.qtyRequested} · keluar {i.qtyIssued}
                  {i.qtyReturned > 0 && ` · retur ${i.qtyReturned}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
