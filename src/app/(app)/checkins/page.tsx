import { pageContext, params, type SP } from "@/server/page";
import { listCheckins } from "@/server/services/checkins";
import { ButtonLink, EmptyRow, FilterBar, Input, PageHeader, Pagination, RowLink, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS, VEHICLE_TYPES } from "@/lib/status";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Check-In" };

export default async function CheckinsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("checkin.view");
  const p = await params(searchParams);
  const res = await listCheckins(ctx, { q: p.q, page: p.page, status: p.get("status"), from: p.get("from"), to: p.get("to") });
  return (
    <>
      <PageHeader title="Vehicle Check-In" subtitle="Penerimaan kendaraan" actions={ctx.permissions.has("checkin.create") && <ButtonLink href="/checkins/new" variant="primary">+ Check-in walk-in</ButtonLink>} />
      <FilterBar action="/checkins" q={p.q} placeholder="No. check-in / customer / nomor polisi">
        <Input type="date" name="from" defaultValue={p.get("from") ?? ""} className="sm:w-40" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" />
        <Select name="status" defaultValue={p.get("status") ?? ""} className="sm:w-40">
          <option value="">Semua status</option>
          {Object.entries(STATUS.checkin).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. Check-In</Th>
            <Th>Masuk</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th>Keluhan</Th>
            <Th>WO</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={7} />}
          {res.rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/checkins/${c.id}`}>{c.checkinNumber}</RowLink>
              </Td>
              <Td>{formatDateTime(c.arrivalTime)}</Td>
              <Td>
                <span className="font-medium">{c.plateNumber}</span>
                <div className="text-xs text-slate-500">
                  {VEHICLE_TYPES[c.vehicleType]} · {c.odometer.toLocaleString("id-ID")} km
                </div>
              </Td>
              <Td>{c.customerName}</Td>
              <Td className="max-w-xs truncate">{c.complaint}</Td>
              <Td>{c.woNumber ?? "-"}</Td>
              <Td>
                <StatusBadge domain="checkin" status={c.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/checkins" params={{ q: p.q, status: p.get("status"), from: p.get("from"), to: p.get("to") }} />
    </>
  );
}
