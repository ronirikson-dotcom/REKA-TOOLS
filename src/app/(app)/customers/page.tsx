import { pageContext, params, type SP } from "@/server/page";
import { listCustomers } from "@/server/services/customers";
import { Badge, ButtonLink, EmptyRow, FilterBar, PageHeader, Pagination, RowLink, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { CUSTOMER_TYPES } from "@/lib/status";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Customer" };

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("customer.view");
  const p = await params(searchParams);
  const res = await listCustomers(ctx, { q: p.q, page: p.page, type: p.get("type") });
  return (
    <>
      <PageHeader
        title="Customer"
        subtitle="Master customer retail, corporate & fleet"
        actions={ctx.permissions.has("customer.create") && <ButtonLink href="/customers/new" variant="primary">+ Customer baru</ButtonLink>}
      />
      <FilterBar action="/customers" q={p.q} placeholder="Cari nama, HP, WhatsApp, kode atau nomor polisi">
        <Select name="type" defaultValue={p.get("type") ?? ""} className="sm:w-40">
          <option value="">Semua tipe</option>
          {Object.entries(CUSTOMER_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>Kode</Th>
            <Th>Nama</Th>
            <Th>HP / WhatsApp</Th>
            <Th>Tipe</Th>
            <Th right>Kendaraan</Th>
            <Th>Kunjungan terakhir</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={6} />}
          {res.rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">{c.customerCode}</Td>
              <Td>
                <RowLink href={`/customers/${c.id}`}>{c.name}</RowLink>
                {c.companyName && <div className="text-xs text-slate-500">{c.companyName}</div>}
              </Td>
              <Td>
                {c.phone ?? "-"}
                {c.whatsapp && c.whatsapp !== c.phone && <div className="text-xs text-slate-500">WA {c.whatsapp}</div>}
              </Td>
              <Td>
                <Badge tone={c.customerType === "retail" ? "gray" : "indigo"}>{CUSTOMER_TYPES[c.customerType]}</Badge>
              </Td>
              <Td right>{c.vehicleCount}</Td>
              <Td>{formatDate(c.lastVisit)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/customers" params={{ q: p.q, type: p.get("type") }} />
    </>
  );
}
