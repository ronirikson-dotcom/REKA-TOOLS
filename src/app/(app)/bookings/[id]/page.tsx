import { load, pageContext } from "@/server/page";
import { getBooking } from "@/server/services/bookings";
import { ActionForm, ConfirmButton, InlineAction, SubmitButton } from "@/components/client/action-form";
import { cancelBookingAction, confirmBookingAction, rescheduleBookingAction } from "@/server/actions/front";
import { ButtonLink, Card, DL, Field, Grid, Input, PageHeader, StatusBadge } from "@/components/ui";
import { BOOKING_SOURCE_LABEL } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { waLink, WA_TEMPLATES } from "@/lib/whatsapp";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("booking.view");
  const { id } = await params;
  const b = await load(() => getBooking(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  const active = ["scheduled", "confirmed"].includes(b.status);
  const wa = waLink(
    b.customer.whatsapp ?? b.customer.phone,
    WA_TEMPLATES.bookingConfirmation({ name: b.customer.name, plate: b.vehicle.plateNumber, date: formatDate(b.bookingDate), time: b.bookingTime, branch: b.branch.name }),
  );
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={b.bookingNumber}
        subtitle={<StatusBadge domain="booking" status={b.status} />}
        back={{ href: "/bookings", label: "Booking" }}
        actions={
          <>
            {wa && active && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Kirim konfirmasi WA
              </a>
            )}
            {active && can("checkin.create") && (
              <ButtonLink variant="primary" href={`/checkins/new?bookingId=${b.id}&vehicleId=${b.vehicleId}`}>
                Kendaraan datang → Check-in
              </ButtonLink>
            )}
            {b.status === "scheduled" && can("booking.edit") && (
              <InlineAction action={confirmBookingAction} fields={{ id: b.id }} size="md">
                Konfirmasi
              </InlineAction>
            )}
            {active && can("booking.cancel") && (
              <>
                <ConfirmButton action={cancelBookingAction} fields={{ id: b.id, noShow: "1" }} label="No Show" requireReason title="Tandai No Show?" />
                <ConfirmButton action={cancelBookingAction} fields={{ id: b.id }} label="Batalkan" variant="danger" requireReason title="Batalkan booking?" />
              </>
            )}
          </>
        }
      />
      <Grid cols={2}>
        <Card title="Detail booking">
          <DL
            items={[
              ["Jadwal", `${formatDate(b.bookingDate)} ${b.bookingTime}`],
              ["Cabang", b.branch.name],
              ["Sumber", BOOKING_SOURCE_LABEL[b.source]],
              ["Dibuat", formatDateTime(b.createdAt)],
              ["Kendaraan", b.vehicle.plateNumber],
              ["Customer", b.customer.name],
              ["Keluhan", b.complaint],
              ["Alasan batal", b.cancelReason],
            ]}
          />
          {b.checkinId && (
            <ButtonLink href={`/checkins/${b.checkinId}`} className="mt-4" size="sm">
              Lihat check-in
            </ButtonLink>
          )}
        </Card>
        {active && can("booking.edit") && (
          <Card title="Reschedule">
            <ActionForm action={rescheduleBookingAction} className="space-y-3">
              <input type="hidden" name="id" value={b.id} />
              <Grid cols={2}>
                <Field label="Tanggal">
                  <Input type="date" name="bookingDate" defaultValue={b.bookingDate} required />
                </Field>
                <Field label="Jam">
                  <Input type="time" name="bookingTime" defaultValue={b.bookingTime} required />
                </Field>
              </Grid>
              <Field label="Catatan">
                <Input name="notes" defaultValue={b.notes ?? ""} />
              </Field>
              <SubmitButton variant="secondary">Simpan jadwal baru</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </Grid>
    </div>
  );
}
