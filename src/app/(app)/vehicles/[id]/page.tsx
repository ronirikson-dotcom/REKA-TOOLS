import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getVehicle, vehicleTimeline } from "@/server/services/vehicles";
import { vehicleReminders } from "@/server/services/reminders";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { transferVehicleAction } from "@/server/actions/front";
import { Badge, ButtonLink, Card, DL, Field, Grid, Input, PageHeader, StatusBadge } from "@/components/ui";
import { CustomerPickerField } from "@/components/client/customer-picker-field";
import { VEHICLE_TYPES } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("vehicle.view");
  const { id } = await params;
  const v = await load(() => getVehicle(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  const [timeline, reminders] = await Promise.all([vehicleTimeline(ctx, id), can("reminder.view") ? vehicleReminders(ctx, id) : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title={v.plateNumber}
        subtitle={`${[v.brand?.name, v.model?.name, v.year].filter(Boolean).join(" ") || VEHICLE_TYPES[v.vehicleType]} · ${v.lastOdometer.toLocaleString("id-ID")} km`}
        back={{ href: "/vehicles", label: "Kendaraan" }}
        actions={
          <>
            {can("checkin.create") && (
              <ButtonLink href={`/checkins/new?vehicleId=${v.id}`} variant="primary">
                Check-in
              </ButtonLink>
            )}
            {can("booking.create") && <ButtonLink href={`/bookings/new?vehicleId=${v.id}`}>Booking</ButtonLink>}
            {can("vehicle.edit") && <ButtonLink href={`/vehicles/${v.id}/edit`}>Ubah</ButtonLink>}
          </>
        }
      />
      <Grid cols={3}>
        <Card title="Data kendaraan">
          <DL
            items={[
              ["Jenis", VEHICLE_TYPES[v.vehicleType]],
              ["Warna", v.color],
              ["No. rangka", <span key="c" className="font-mono text-xs">{v.chassisNumber ?? "-"}</span>],
              ["No. mesin", <span key="e" className="font-mono text-xs">{v.engineNumber ?? "-"}</span>],
              ["Transmisi", v.transmission],
              ["Bahan bakar", v.fuelType],
            ]}
          />
        </Card>
        <Card title="Pemilik">
          <Link href={`/customers/${v.customer.id}`} className="font-semibold text-brand-700 hover:underline">
            {v.customer.name}
          </Link>
          <div className="text-sm text-slate-600">{v.customer.phone}</div>
          <div className="mt-3 text-xs font-semibold uppercase text-slate-500">Histori kepemilikan</div>
          <ul className="mt-1 space-y-1 text-sm">
            {v.ownerships.map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span>{o.customer.name}</span>
                <span className="text-xs text-slate-500">
                  {formatDate(o.startDate)} – {o.endDate ? formatDate(o.endDate) : "sekarang"}
                </span>
              </li>
            ))}
          </ul>
          {can("vehicle.transfer") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">Pindah kepemilikan</summary>
              <ActionForm action={transferVehicleAction} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={v.id} />
                <CustomerPickerField name="newCustomerId" />
                <Field label="Catatan">
                  <Input name="notes" placeholder="mis. dijual ke ..." />
                </Field>
                <SubmitButton variant="secondary">Pindahkan</SubmitButton>
              </ActionForm>
            </details>
          )}
        </Card>
        <Card title="Service reminder">
          {reminders.length === 0 && <p className="text-sm text-slate-400">Belum ada reminder</p>}
          <ul className="space-y-2 text-sm">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2">
                <span>
                  {r.description}
                  <span className="block text-xs text-slate-500">
                    {r.dueDate ? formatDate(r.dueDate) : ""} {r.dueOdometer ? `· ${r.dueOdometer.toLocaleString("id-ID")} km` : ""}
                  </span>
                </span>
                <StatusBadge domain="reminder" status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      </Grid>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-800">Vehicle service timeline</h2>
      {timeline.length === 0 && <Card><p className="text-sm text-slate-400">Belum ada kunjungan di cabang yang dapat Anda akses</p></Card>}
      <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
        {timeline.map((t) => (
          <li key={t.checkinId} className="relative">
            <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-900">{formatDateTime(t.arrivalTime)}</span>
                  <span className="text-sm text-slate-500"> · {t.branchName} · {t.odometer.toLocaleString("id-ID")} km</span>
                </div>
                <div className="flex items-center gap-2">
                  {can("checkin.view") && (
                    <Link className="text-xs text-brand-700 hover:underline" href={`/checkins/${t.checkinId}`}>
                      {t.checkinNumber}
                    </Link>
                  )}
                  {t.woId && can("workorder.view") && (
                    <Link className="text-xs text-brand-700 hover:underline" href={`/work-orders/${t.woId}`}>
                      {t.woNumber}
                    </Link>
                  )}
                  {t.woStatus ? <StatusBadge domain="workorder" status={t.woStatus} /> : <StatusBadge domain="checkin" status={t.checkinStatus} />}
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">Keluhan: {t.complaint}</p>
              <div className="mt-2 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Pekerjaan</div>
                  {t.jobs.length ? t.jobs.map((j, i) => <div key={i}>• {j.description}</div>) : <div className="text-slate-400">-</div>}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Part / material</div>
                  {t.parts.length ? (
                    t.parts.map((p, i) => (
                      <div key={i}>
                        • {p.partName} <span className="text-slate-500">× {formatQty(p.qty)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">-</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Invoice</div>
                  {t.invoice ? (
                    <div className="flex items-center gap-2">
                      {can("invoice.view") ? (
                        <Link href={`/invoices/${t.invoice.id}`} className="text-brand-700 hover:underline">
                          {t.invoice.invoiceNumber}
                        </Link>
                      ) : (
                        t.invoice.invoiceNumber
                      )}
                      <span>{formatMoney(t.invoice.grandTotal)}</span>
                      <StatusBadge domain="payment" status={t.invoice.paymentStatus} />
                    </div>
                  ) : (
                    <div className="text-slate-400">-</div>
                  )}
                </div>
              </div>
              {t.handoverAt && <Badge tone="green" className="mt-2">Diserahkan {formatDateTime(t.handoverAt)}</Badge>}
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
