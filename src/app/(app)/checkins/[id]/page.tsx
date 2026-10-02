import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getCheckin } from "@/server/services/checkins";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/client/action-form";
import { addCheckinPhotosAction, cancelCheckinAction } from "@/server/actions/front";
import { Alert, Badge, ButtonLink, Card, DL, Grid, Input, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateTime, formatMoney, fuelLabel } from "@/lib/format";
import { statusInfo } from "@/lib/status";

export default async function CheckinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("checkin.view");
  const { id } = await params;
  const c = await load(() => getCheckin(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  const open = c.status === "open";
  const activeEstimate = c.estimates.find((e) => !e.workOrderId && ["approved", "partially_approved"].includes(e.status));
  return (
    <>
      <PageHeader
        title={c.checkinNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="checkin" status={c.status} />
            <span>
              {c.vehicle.plateNumber} · {c.customer.name} · {c.branch.name}
            </span>
          </span>
        }
        back={{ href: "/checkins", label: "Check-In" }}
        actions={
          <>
            {open && can("inspection.execute") && <ButtonLink href={`/checkins/${c.id}/inspection`}>Inspeksi & diagnosa</ButtonLink>}
            {open && can("estimate.create") && (
              <ButtonLink href={`/estimates/new?checkinId=${c.id}`} variant="primary">
                Buat estimate
              </ButtonLink>
            )}
            {c.workOrder && (
              <ButtonLink href={`/work-orders/${c.workOrder.id}`} variant="primary">
                Buka {c.workOrder.woNumber}
              </ButtonLink>
            )}
            {open && can("checkin.cancel") && <ConfirmButton action={cancelCheckinAction} fields={{ id: c.id }} label="Batalkan" variant="danger" requireReason title="Batalkan check-in?" />}
          </>
        }
      />
      {activeEstimate && !c.workOrder && (
        <div className="mb-4">
          <Alert tone="green" title="Estimate sudah disetujui customer">
            <Link className="underline" href={`/estimates/${activeEstimate.id}`}>
              Buka {activeEstimate.estimateNumber}
            </Link>{" "}
            untuk membuat Work Order.
          </Alert>
        </div>
      )}
      <Grid cols={3}>
        <Card title="Penerimaan kendaraan" className="md:col-span-2">
          <DL
            items={[
              ["Waktu masuk", formatDateTime(c.arrivalTime)],
              ["Diterima oleh", c.checkinUser?.name],
              ["Kendaraan", <Link key="v" className="text-brand-700 hover:underline" href={`/vehicles/${c.vehicleId}`}>{c.vehicle.plateNumber} · {[c.vehicle.brand?.name, c.vehicle.model?.name].filter(Boolean).join(" ")}</Link>],
              ["Customer", <Link key="c" className="text-brand-700 hover:underline" href={`/customers/${c.customerId}`}>{c.customer.name}</Link>],
              ["Odometer", `${c.odometer.toLocaleString("id-ID")} km`],
              ["Fuel level", fuelLabel(c.fuelLevel)],
              ["Booking", c.booking?.bookingNumber ?? "Walk-in"],
              ["Override odometer", c.odometerOverrideReason],
            ]}
          />
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Keluhan</div>
              <p className="mt-1 whitespace-pre-line">{c.complaint}</p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Kondisi</div>
              <p className="mt-1 whitespace-pre-line">{c.conditionNotes ?? "-"}</p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Barang ditinggalkan</div>
              <p className="mt-1 whitespace-pre-line">{c.belongings ?? "-"}</p>
            </div>
          </div>
          {c.cancelReason && <p className="mt-3 text-sm text-red-700">Dibatalkan: {c.cancelReason}</p>}
        </Card>
        <Card title={`Foto kendaraan (${c.photos.length})`}>
          <div className="grid grid-cols-3 gap-2">
            {c.photos.map((ph) => (
              <a key={ph.id} href={`/api/files/${ph.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${ph.id}`} alt={ph.fileName} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
          {c.photos.length === 0 && <p className="text-sm text-slate-400">Belum ada foto</p>}
          {can("checkin.create") && c.status !== "cancelled" && (
            <ActionForm action={addCheckinPhotosAction} className="mt-3 space-y-2" resetOnSuccess>
              <input type="hidden" name="id" value={c.id} />
              <Input type="file" name="photos" accept="image/*" capture="environment" multiple required />
              <SubmitButton variant="secondary">Upload foto</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </Grid>

      <Grid cols={2} className="mt-4">
        <Card title="Inspeksi & diagnosa">
          {c.inspections.length === 0 && <p className="text-sm text-slate-400">Belum ada inspeksi</p>}
          {c.inspections.map((ins) => {
            const flagged = ins.items.filter((i) => i.result === "attention" || i.result === "replace");
            return (
              <div key={ins.id} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {formatDateTime(ins.inspectionDate)} · {ins.inspector?.name}
                  </span>
                  <StatusBadge domain="inspection" status={ins.result} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {ins.items.filter((i) => i.result === "good").length} good · {ins.items.filter((i) => i.result === "attention").length} attention ·{" "}
                  {ins.items.filter((i) => i.result === "replace").length} replace · {ins.items.filter((i) => i.result === "not_checked").length} not checked
                </div>
                {flagged.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {flagged.map((i) => (
                      <li key={i.id} className="flex items-start gap-2">
                        <Badge tone={statusInfo("inspection", i.result).tone}>{statusInfo("inspection", i.result).label}</Badge>
                        <span>
                          {i.category} — {i.itemName}
                          {i.notes && <span className="text-slate-500"> ({i.notes})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {ins.notes && <p className="mt-2 text-sm text-slate-600">{ins.notes}</p>}
              </div>
            );
          })}
        </Card>
        <Card title="Estimate">
          {c.estimates.length === 0 && <p className="text-sm text-slate-400">Belum ada estimate</p>}
          <ul className="divide-y divide-slate-100">
            {c.estimates.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <Link className="font-medium text-brand-700 hover:underline" href={`/estimates/${e.id}`}>
                    {e.estimateNumber}
                  </Link>
                  {e.workOrderId && <Badge className="ml-2">Tambahan</Badge>}
                  <span className="ml-2 text-slate-500">{formatDateTime(e.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {formatMoney(e.grandTotal)}
                  <StatusBadge domain="estimate" status={e.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </Grid>
    </>
  );
}
