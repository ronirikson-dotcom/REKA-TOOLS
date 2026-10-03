import { pageContext } from "@/server/page";
import { qcQueue } from "@/server/services/qc";
import { ButtonLink, EmptyRow, PageHeader, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatAge } from "@/lib/format";

export const metadata = { title: "Quality Control" };

export default async function QcQueuePage() {
  const ctx = await pageContext("qc.view");
  const rows = await qcQueue(ctx);
  return (
    <>
      <PageHeader title="Quality Control" subtitle="QC adalah gate sebelum invoice dan serah terima" />
      <Table>
        <THead>
          <tr>
            <Th>WO</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th>Prioritas</Th>
            <Th>Menunggu</Th>
            <Th>QC ke-</Th>
            <Th />
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7}>Tidak ada antrian QC</EmptyRow>}
          {rows.map((w) => (
            <tr key={w.id}>
              <Td className="font-medium">{w.woNumber}</Td>
              <Td>{w.plateNumber}</Td>
              <Td>{w.customerName}</Td>
              <Td>
                <StatusBadge domain="priority" status={w.priority} />
              </Td>
              <Td>{formatAge(w.updatedAt)}</Td>
              <Td>{w.qcCount + 1}</Td>
              <Td right>{ctx.permissions.has("qc.execute") && <ButtonLink href={`/qc/${w.id}`} size="sm" variant="primary">Periksa</ButtonLink>}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
