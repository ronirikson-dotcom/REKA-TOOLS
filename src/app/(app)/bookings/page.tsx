import { pageContext, params, type SP } from "@/server/page";
import { listBookings } from "@/server/services/bookings";
import { ButtonLink, EmptyRow, FilterBar, Input, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { BOOKING_SOURCE_LABEL, STATUS } from "@/lib/status";
import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/utils";

export const metadata = { title: "Booking" };

export default async function BookingsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("booking.view");
  const p = await params(searchParams);
  const from = p.get("from") ?? todayISO();
  const res = await listBookings(ctx, { q: p.q, page: p.page, status: p.get("status"), from, to: p.get("to") });
  return (
    <>
      <PageHeader
        title="Booking"
        subtitle="Jadwal kedatangan: Scheduled → Confirmed → Arrived / Cancelled / No Show"
        actions={ctx.permissions.has("booking.create") && <ButtonLink href="/bookings/new" variant="primary">+ Booking</ButtonLink>}
      />
      <FilterBar action="/bookings" q={p.q} placeholder="No. booking / customer / nomor polisi">
        <Input type="date" name="from" defaultValue={from} className="sm:w-40" aria-label="Dari" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" aria-label="Sampai" />
        <Select name="status" defaultValue={p.get("status") ?? ""} className="sm:w-40">
          <option value="">Semua status</option>
          {Object.entries(STATUS.booking).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. Booking</Th>
            <Th>Jadwal</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th>Keluhan</Th>
            <Th>Sumber</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={7} />}
          {res.rows.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/bookings/${b.id}`}>{b.bookingNumber}</RowLink>
              </Td>
              <Td>
                {formatDate(b.bookingDate)} {b.bookingTime}
              </Td>
              <Td className="font-medium">{b.plateNumber}</Td>
              <Td>{b.customerName}</Td>
              <Td className="max-w-xs truncate">{b.complaint ?? "-"}</Td>
              <Td>{BOOKING_SOURCE_LABEL[b.source]}</Td>
              <Td>
                <StatusBadge domain="booking" status={b.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/bookings" params={{ q: p.q, status: p.get("status"), from, to: p.get("to") }} />
    </>
  );
}
