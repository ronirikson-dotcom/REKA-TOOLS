import Link from "next/link";
import { pageContext, params, type SP } from "@/server/page";
import { listReminders } from "@/server/services/reminders";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { followUpReminderAction, createReminderAction } from "@/server/actions/admin";
import { VehiclePicker } from "@/components/client/pickers";
import { Badge, Card, EmptyRow, Field, FilterBar, Grid, Input, PageHeader, Pagination, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { waLink, WA_TEMPLATES } from "@/lib/whatsapp";

export const metadata = { title: "Service Reminder" };

/** CRM: due reminder & status follow-up (URS-CRM-001/002) */
export default async function RemindersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("reminder.view");
  const p = await params(searchParams);
  const window = Number(p.get("window") ?? 14);
  const status = p.get("status") ?? "";
  const res = await listReminders(ctx, { q: p.q, page: p.page, status: status || null, window, dueOnly: p.get("all") !== "1" });
  const canManage = ctx.permissions.has("reminder.manage");
  return (
    <>
      <PageHeader title="Service Reminder" subtitle="Reminder berbasis tanggal & odometer — fondasi CRM dan retensi customer" />
      <FilterBar action="/reminders" q={p.q} placeholder="Customer / nomor polisi">
        <Select name="window" defaultValue={String(window)} className="sm:w-48">
          <option value="0">Sudah jatuh tempo</option>
          <option value="7">Jatuh tempo ≤ 7 hari</option>
          <option value="14">Jatuh tempo ≤ 14 hari</option>
          <option value="30">Jatuh tempo ≤ 30 hari</option>
          <option value="90">Jatuh tempo ≤ 90 hari</option>
        </Select>
        <Select name="status" defaultValue={status} className="sm:w-44">
          <option value="">Pending &amp; dihubungi</option>
          {Object.entries(STATUS.reminder).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Select name="all" defaultValue={p.get("all") ?? ""} className="sm:w-44">
          <option value="">Hanya yang due</option>
          <option value="1">Semua jadwal</option>
        </Select>
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>Jatuh tempo</Th>
            <Th>Kendaraan</Th>
            <Th>Customer</Th>
            <Th>Reminder</Th>
            <Th>Status</Th>
            <Th>Follow-up</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={6}>Tidak ada reminder jatuh tempo</EmptyRow>}
          {res.rows.map((r) => {
            const wa = waLink(
              r.whatsapp ?? r.phone,
              WA_TEMPLATES.reminder({ name: r.customerName, plate: r.plateNumber, description: r.description, due: r.dueDate ? formatDate(r.dueDate) : `${r.dueOdometer?.toLocaleString("id-ID")} km` }),
            );
            return (
              <tr key={r.id} className="align-top">
                <Td>
                  {r.dueDate ? formatDate(r.dueDate) : "-"}
                  {r.dueOdometer && <div className="text-xs text-slate-500">{r.dueOdometer.toLocaleString("id-ID")} km</div>}
                  {r.overdue && <Badge tone="red">Overdue</Badge>}
                </Td>
                <Td>
                  <Link className="font-medium text-brand-700 hover:underline" href={`/vehicles/${r.vehicleId}`}>
                    {r.plateNumber}
                  </Link>
                  <div className="text-xs text-slate-500">Odo terakhir {r.lastOdometer.toLocaleString("id-ID")} km</div>
                </Td>
                <Td>
                  <Link className="hover:underline" href={`/customers/${r.customerId}`}>
                    {r.customerName}
                  </Link>
                  <div className="text-xs text-slate-500">{r.whatsapp ?? r.phone ?? "-"}</div>
                </Td>
                <Td>{r.description}</Td>
                <Td>
                  <StatusBadge domain="reminder" status={r.status} />
                  {r.lastContactedAt && <div className="text-xs text-slate-500">{formatDateTime(r.lastContactedAt)}</div>}
                </Td>
                <Td className="min-w-72">
                  <div className="flex flex-wrap gap-2">
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                        WhatsApp
                      </a>
                    )}
                    {ctx.permissions.has("booking.create") && (
                      <Link className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50" href={`/bookings/new?vehicleId=${r.vehicleId}`}>
                        Buat booking
                      </Link>
                    )}
                  </div>
                  {canManage && (
                    <ActionForm action={followUpReminderAction} className="mt-2 flex gap-1" showSuccess={false}>
                      <input type="hidden" name="id" value={r.id} />
                      <Select name="status" defaultValue={r.status === "pending" ? "contacted" : r.status} className="w-32 py-1 text-xs">
                        {Object.entries(STATUS.reminder).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                      <Input name="notes" placeholder="Catatan" className="py-1 text-xs" />
                      <SubmitButton variant="secondary" className="px-2 py-1 text-xs">
                        Simpan
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {r.followUpNotes && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{r.followUpNotes}</p>}
                </Td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/reminders" params={{ q: p.q, window: String(window), status, all: p.get("all") }} />
      {canManage && (
        <Card title="Tambah reminder manual" className="mt-6 max-w-3xl">
          <ActionForm action={createReminderAction} className="space-y-3" resetOnSuccess>
            <Field label="Kendaraan" required>
              <VehiclePicker required />
            </Field>
            <Grid cols={3}>
              <Field label="Deskripsi" required>
                <Input name="description" required placeholder="mis. Ganti aki" />
              </Field>
              <Field label="Tanggal jatuh tempo">
                <Input type="date" name="dueDate" />
              </Field>
              <Field label="Odometer jatuh tempo">
                <Input type="number" name="dueOdometer" min={0} />
              </Field>
            </Grid>
            <SubmitButton variant="secondary">Tambah reminder</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
