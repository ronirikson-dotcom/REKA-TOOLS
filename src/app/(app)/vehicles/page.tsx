import { pageContext, params, type SP } from "@/server/page";
import { listVehicles } from "@/server/services/vehicles";
import { ButtonLink, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/status";

export const metadata = { title: "Kendaraan" };

export default async function VehiclesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("vehicle.view");
  const p = await params(searchParams);
  const res = await listVehicles(ctx, { q: p.q, page: p.page, type: p.get("type") });
  return (
    <>
      <PageHeader
        title="Kendaraan"
        subtitle="Quick search nomor polisi, rangka, mesin atau pemilik"
        actions={ctx.permissions.has("vehicle.create") && <ButtonLink href="/vehicles/new" variant="primary">+ Kendaraan baru</ButtonLink>}
      />
      <FilterBar action="/vehicles" q={p.q} placeholder="Nomor polisi / no. rangka / nama pemilik">
        <Select name="type" defaultValue={p.get("type") ?? ""} className="sm:w-36">
          <option value="">Semua jenis</option>
          <option value="car">Mobil</option>
          <option value="motorcycle">Motor</option>
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>No. Polisi</Th>
            <Th>Kendaraan</Th>
            <Th>Jenis</Th>
            <Th>No. Rangka</Th>
            <Th>Pemilik</Th>
            <Th right>Odometer</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={6} />}
          {res.rows.map((v) => (
            <tr key={v.id} className="hover:bg-slate-50">
              <Td>
                <RowLink href={`/vehicles/${v.id}`}>{v.plateNumber}</RowLink>
              </Td>
              <Td>{[v.brand, v.model, v.year].filter(Boolean).join(" ") || "-"}</Td>
              <Td>{VEHICLE_TYPES[v.vehicleType]}</Td>
              <Td className="font-mono text-xs">{v.chassisNumber ?? "-"}</Td>
              <Td>
                <RowLink href={`/customers/${v.customerId}`}>{v.customerName}</RowLink>
              </Td>
              <Td right>{v.lastOdometer.toLocaleString("id-ID")} km</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/vehicles" params={{ q: p.q, type: p.get("type") }} />
    </>
  );
}
