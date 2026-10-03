import Link from "next/link";
import { pageContext, params, type SP } from "@/server/page";
import { vehicleOption } from "@/server/view";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { VehiclePicker } from "@/components/client/pickers";
import { ActionFooter, Alert, Card, Field, Grid, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createBookingAction } from "@/server/actions/front";
import { BOOKING_SOURCE_LABEL } from "@/lib/status";
import { todayISO } from "@/lib/utils";

export const metadata = { title: "Booking Baru" };

export default async function NewBookingPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("booking.create");
  const p = await params(searchParams);
  const initial = await vehicleOption(ctx, p.get("vehicleId"));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Booking baru" back={{ href: "/bookings", label: "Booking" }} />
      {!ctx.activeBranchId && (
        <div className="mb-4">
          <Alert tone="amber">Pilih cabang aktif di bagian atas sebelum membuat booking.</Alert>
        </div>
      )}
      <ActionForm action={createBookingAction}>
        <Card>
          <Field label="Kendaraan & customer" required hint={<Link className="text-brand-700 hover:underline" href="/vehicles/new?returnTo=/bookings/new">Kendaraan belum terdaftar? Tambah di sini</Link>}>
            <VehiclePicker initial={initial} required />
          </Field>
          <Grid cols={3} className="mt-4">
            <Field label="Tanggal" required>
              <Input type="date" name="bookingDate" defaultValue={todayISO()} min={todayISO()} required />
            </Field>
            <Field label="Jam" required>
              <Input type="time" name="bookingTime" defaultValue="09:00" required />
            </Field>
            <Field label="Sumber">
              <Select name="source" defaultValue="phone">
                {Object.entries(BOOKING_SOURCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </Grid>
          <Field label="Keluhan / kebutuhan servis" className="mt-4">
            <Textarea name="complaint" />
          </Field>
          <Field label="Catatan internal" className="mt-4">
            <Input name="notes" />
          </Field>
          <ActionFooter>
            <SubmitButton>Simpan booking</SubmitButton>
          </ActionFooter>
        </Card>
      </ActionForm>
    </div>
  );
}
