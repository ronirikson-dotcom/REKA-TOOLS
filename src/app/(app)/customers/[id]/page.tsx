import { load, pageContext } from "@/server/page";
import { customerHistory, getCustomer } from "@/server/services/customers";
import { ConfirmButton } from "@/components/client/action-form";
import { deactivateCustomerAction } from "@/server/actions/front";
import { Badge, ButtonLink, Card, DL, EmptyRow, Grid, PageHeader, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { CUSTOMER_TYPES, VEHICLE_TYPES } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("customer.view");
  const { id } = await params;
  const [c, history] = await Promise.all([load(() => getCustomer(ctx, id)), customerHistory(ctx, id)]);
  const can = (p: string) => ctx.permissions.has(p);
  const wa = waLink(c.whatsapp ?? c.phone, `Halo ${c.name}, `);
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">{c.customerCode}</span>
            <Badge tone="indigo">{CUSTOMER_TYPES[c.customerType]}</Badge>
            {c.deletedAt && <Badge tone="red">Nonaktif</Badge>}
          </span>
        }
        back={{ href: "/customers", label: "Customer" }}
        actions={
          <>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                WhatsApp
              </a>
            )}
            {can("vehicle.create") && <ButtonLink href={`/vehicles/new?customerId=${c.id}`}>+ Kendaraan</ButtonLink>}
            {can("customer.edit") && <ButtonLink href={`/customers/${c.id}/edit`}>Ubah</ButtonLink>}
            {can("customer.delete") && !c.deletedAt && (
              <ConfirmButton action={deactivateCustomerAction} fields={{ id: c.id }} label="Nonaktifkan" variant="danger" requireReason title="Nonaktifkan customer?" description="Data histori tetap tersimpan (soft delete)." />
            )}
          </>
        }
      />
      <Grid cols={3}>
        <Card title="Profil" className="md:col-span-1">
          <DL
            cols={2}
            items={[
              ["HP", c.phone],
              ["WhatsApp", c.whatsapp],
              ["Email", c.email],
              ["Perusahaan", c.companyName],
              ["NPWP", c.taxId],
              ["Terdaftar", formatDate(c.createdAt)],
            ]}
          />
          {c.address && <p className="mt-3 text-sm text-slate-600">{c.address}</p>}
          {c.notes && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900">{c.notes}</p>}
        </Card>
        <Card title={`Kendaraan (${c.vehicles.length})`} className="md:col-span-2" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>No. Polisi</Th>
                <Th>Kendaraan</Th>
                <Th>Jenis</Th>
                <Th right>Odometer</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {c.vehicles.length === 0 && <EmptyRow colSpan={5}>Belum ada kendaraan</EmptyRow>}
              {c.vehicles.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <RowLink href={`/vehicles/${v.id}`}>{v.plateNumber}</RowLink>
                  </Td>
                  <Td>{[v.brand, v.model, v.year].filter(Boolean).join(" ") || "-"}</Td>
                  <Td>{VEHICLE_TYPES[v.vehicleType]}</Td>
                  <Td right>{v.lastOdometer.toLocaleString("id-ID")} km</Td>
                  <Td right>
                    {can("checkin.create") && (
                      <ButtonLink size="sm" href={`/checkins/new?vehicleId=${v.id}`}>
                        Check-in
                      </ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Grid>
      <Grid cols={2} className="mt-4">
        <Card title="Histori Work Order" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>WO</Th>
                <Th>Tanggal</Th>
                <Th>Kendaraan</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {history.workOrders.length === 0 && <EmptyRow colSpan={4} />}
              {history.workOrders.map((w) => (
                <tr key={w.id}>
                  <Td>{can("workorder.view") ? <RowLink href={`/work-orders/${w.id}`}>{w.woNumber}</RowLink> : w.woNumber}</Td>
                  <Td>{formatDateTime(w.createdAt)}</Td>
                  <Td>{w.plateNumber}</Td>
                  <Td>
                    <StatusBadge domain="workorder" status={w.status} />
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card title="Histori Transaksi" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Invoice</Th>
                <Th>Tanggal</Th>
                <Th right>Total</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {history.invoices.length === 0 && <EmptyRow colSpan={4} />}
              {history.invoices.map((i) => (
                <tr key={i.id}>
                  <Td>{can("invoice.view") ? <RowLink href={`/invoices/${i.id}`}>{i.invoiceNumber}</RowLink> : i.invoiceNumber}</Td>
                  <Td>{formatDate(i.invoiceDate)}</Td>
                  <Td right>{formatMoney(i.grandTotal)}</Td>
                  <Td>{i.status === "void" ? <StatusBadge domain="invoice" status="void" /> : <StatusBadge domain="payment" status={i.paymentStatus} />}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Grid>
    </>
  );
}
