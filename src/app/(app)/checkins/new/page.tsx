import { pageContext, params, type SP } from "@/server/page";
import { vehicleOption } from "@/server/view";
import { getBooking } from "@/server/services/bookings";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { CheckinFields } from "@/components/client/checkin-fields";
import { ActionFooter, Alert, Card, PageHeader } from "@/components/ui";
import { createCheckinAction } from "@/server/actions/front";

export const metadata = { title: "Check-In Kendaraan" };

export default async function NewCheckinPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("checkin.create");
  const p = await params(searchParams);
  const booking = p.get("bookingId") ? await getBooking(ctx, p.get("bookingId")!).catch(() => null) : null;
  const initial = await vehicleOption(ctx, booking?.vehicleId ?? p.get("vehicleId"));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Vehicle check-in" subtitle={booking ? `Dari booking ${booking.bookingNumber}` : "Walk-in"} back={{ href: "/checkins", label: "Check-In" }} />
      {!ctx.activeBranchId && (
        <div className="mb-4">
          <Alert tone="amber">Pilih cabang aktif di bagian atas sebelum melakukan check-in.</Alert>
        </div>
      )}
      <ActionForm action={createCheckinAction}>
        {booking && <input type="hidden" name="bookingId" value={booking.id} />}
        <Card>
          <CheckinFields initial={initial} canOverride={ctx.permissions.has("checkin.override_odometer")} />
          <ActionFooter>
            <SubmitButton>Simpan check-in</SubmitButton>
          </ActionFooter>
        </Card>
      </ActionForm>
    </div>
  );
}
