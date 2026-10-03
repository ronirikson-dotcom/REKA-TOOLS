import { pageContext, params, type SP } from "@/server/page";
import { listSuppliers } from "@/server/services/masters";
import { ButtonLink, EmptyRow, FilterBar, PageHeader, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";

export const metadata = { title: "Supplier" };

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("supplier.manage");
  const p = await params(searchParams);
  const rows = await listSuppliers(ctx, { q: p.q });
  return (
    <>
      <PageHeader title="Supplier" actions={<ButtonLink href="/master/suppliers/new" variant="primary">+ Supplier</ButtonLink>} />
      <FilterBar action="/master/suppliers" q={p.q} placeholder="Nama / kode" />
      <Table>
        <THead>
          <tr>
            <Th>Kode</Th>
            <Th>Nama</Th>
            <Th>Kontak</Th>
            <Th>Telepon</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={5} />}
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-mono text-xs">{s.code}</Td>
              <Td>
                <RowLink href={`/master/suppliers/${s.id}`}>{s.name}</RowLink>
              </Td>
              <Td>{s.contactName ?? "-"}</Td>
              <Td>{s.phone ?? "-"}</Td>
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
