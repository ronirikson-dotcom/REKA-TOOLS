import { pageContext, params, type SP } from "@/server/page";
import { listServices } from "@/server/services/masters";
import { ButtonLink, EmptyRow, FilterBar, PageHeader, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { VEHICLE_TYPES } from "@/lib/status";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Master Jasa" };

export default async function ServicesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("service.manage");
  const p = await params(searchParams);
  const res = await listServices(ctx, { q: p.q, pageSize: 200 });
  return (
    <>
      <PageHeader title="Master Jasa" subtitle="Harga jasa, standard hour & interval reminder" actions={<ButtonLink href="/master/services/new" variant="primary">+ Jasa baru</ButtonLink>} />
      <FilterBar action="/master/services" q={p.q} placeholder="Kode / nama / kategori" />
      <Table>
        <THead>
          <tr>
            <Th>Kode</Th>
            <Th>Nama jasa</Th>
            <Th>Kategori</Th>
            <Th>Kendaraan</Th>
            <Th right>Std hour</Th>
            <Th right>Harga</Th>
            <Th>Reminder</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={8} />}
          {res.rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-mono text-xs">{s.serviceCode}</Td>
              <Td>
                <RowLink href={`/master/services/${s.id}`}>{s.serviceName}</RowLink>
              </Td>
              <Td>{s.category ?? "-"}</Td>
              <Td>{VEHICLE_TYPES[s.vehicleType]}</Td>
              <Td right>{s.standardHour}</Td>
              <Td right>{formatMoney(s.sellingPrice)}</Td>
              <Td>{[s.reminderDays && `${s.reminderDays} hari`, s.reminderKm && `${s.reminderKm.toLocaleString("id-ID")} km`].filter(Boolean).join(" / ") || "-"}</Td>
              <Td>
                <StatusBadge domain="active" status={s.status} />
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
