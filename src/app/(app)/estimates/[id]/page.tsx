import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getEstimate } from "@/server/services/estimates";
import { usersWithPermission } from "@/server/services/settings";
import { ActionForm, ConfirmButton, InlineAction, SubmitButton } from "@/components/client/action-form";
import { ApprovalForm } from "@/components/client/approval-form";
import { approveEstimateAction, cancelEstimateAction, sendEstimateAction } from "@/server/actions/front";
import { createWorkOrderAction } from "@/server/actions/workshop";
import { Alert, Badge, ButtonLink, Card, DL, Field, Grid, Input, PageHeader, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { CHANNEL_LABEL, ITEM_TYPE_LABEL } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { waLink, WA_TEMPLATES } from "@/lib/whatsapp";
import { PrintButton } from "@/components/client/print-button";

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("estimate.view");
  const { id } = await params;
  const e = await load(() => getEstimate(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  const editable = ["draft", "sent"].includes(e.status);
  const decided = ["approved", "partially_approved"].includes(e.status);
  const canCreateWo = decided && !e.workOrderId && !e.createdWorkOrder && can("workorder.create");
  const supervisors = canCreateWo ? await usersWithPermission(ctx, "workorder.assign", e.branchId) : [];
  const wa = waLink(
    e.customer.whatsapp ?? e.customer.phone,
    WA_TEMPLATES.estimateApproval({ name: e.customer.name, plate: e.vehicle.plateNumber, number: e.estimateNumber, total: formatMoney(e.grandTotal) }) +
      "\n\n" +
      e.items.map((i) => `- ${i.description} (${formatQty(i.qty)}): ${formatMoney(i.total)}`).join("\n"),
  );
  const approvedItems = e.items.filter((i) => i.approvalStatus === "approved");
  const approvedNet = approvedItems.reduce((a, i) => a + i.total, 0);
  return (
    <>
      <PageHeader
        title={e.estimateNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="estimate" status={e.status} />
            {e.workOrderId && <Badge tone="purple">Estimate tambahan · {e.workOrder?.woNumber}</Badge>}
            <span>
              {e.vehicle.plateNumber} · {e.customer.name}
            </span>
          </span>
        }
        back={e.workOrderId ? { href: `/work-orders/${e.workOrderId}`, label: e.workOrder?.woNumber ?? "WO" } : { href: `/checkins/${e.checkinId}`, label: e.checkin.checkinNumber }}
        actions={
          <>
            {wa && editable && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Kirim via WhatsApp
              </a>
            )}
            {e.status === "draft" && can("estimate.create") && (
              <InlineAction action={sendEstimateAction} fields={{ id: e.id }} size="md">
                Tandai terkirim
              </InlineAction>
            )}
            {editable && can("estimate.create") && <ButtonLink href={`/estimates/${e.id}/edit`}>Ubah</ButtonLink>}
            <PrintButton />
            {!e.createdWorkOrder && !["cancelled"].includes(e.status) && can("estimate.cancel") && !(e.workOrderId && decided) && (
              <ConfirmButton action={cancelEstimateAction} fields={{ id: e.id }} label="Batalkan" variant="danger" requireReason title="Batalkan estimate?" />
            )}
          </>
        }
      />
      {e.createdWorkOrder && (
        <div className="mb-4">
          <Alert tone="green">
            Work Order{" "}
            <Link className="font-semibold underline" href={`/work-orders/${e.createdWorkOrder.id}`}>
              {e.createdWorkOrder.woNumber}
            </Link>{" "}
            sudah dibuat dari estimate ini.
          </Alert>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card bodyClassName="p-0" className="print-area">
            <div className="hidden p-4 print:block">
              <h2 className="text-lg font-semibold">ESTIMATE {e.estimateNumber}</h2>
              <p className="text-sm">
                {e.customer.name} · {e.vehicle.plateNumber} · {formatDate(e.createdAt)}
              </p>
            </div>
            <Table className="rounded-none border-0 shadow-none">
              <THead>
                <tr>
                  <Th>Tipe</Th>
                  <Th>Deskripsi</Th>
                  <Th right>Qty</Th>
                  <Th right>Harga</Th>
                  <Th right>Diskon</Th>
                  <Th right>Total</Th>
                  <Th>Keputusan</Th>
                </tr>
              </THead>
              <TBody>
                {e.items.map((i) => (
                  <tr key={i.id} className={i.approvalStatus === "rejected" ? "bg-red-50/40 text-slate-400 line-through" : undefined}>
                    <Td>{ITEM_TYPE_LABEL[i.itemType]}</Td>
                    <Td>
                      {i.description}
                      {i.part && <div className="text-xs text-slate-500">{i.part.sku}</div>}
                    </Td>
                    <Td right>{formatQty(i.qty)}</Td>
                    <Td right>{formatMoney(i.price)}</Td>
                    <Td right>{i.discount ? formatMoney(i.discount) : "-"}</Td>
                    <Td right>{formatMoney(i.total)}</Td>
                    <Td>
                      <StatusBadge domain="estimateItem" status={i.approvalStatus} />
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            <div className="flex justify-end border-t border-slate-100 p-4">
              <dl className="w-72 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(e.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Diskon</dt>
                  <dd>-{formatMoney(e.discount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Pajak ({e.taxRate}%)</dt>
                  <dd>{formatMoney(e.tax)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <dt>Grand total</dt>
                  <dd>{formatMoney(e.grandTotal)}</dd>
                </div>
                {decided && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Disetujui (incl. pajak)</dt>
                    <dd>{formatMoney(approvedNet * (1 + e.taxRate / 100))}</dd>
                  </div>
                )}
              </dl>
            </div>
          </Card>
          {e.notes && (
            <Card title="Catatan">
              <p className="whitespace-pre-line text-sm">{e.notes}</p>
            </Card>
          )}
          {e.approvals.length > 0 && (
            <Card title="Evidence persetujuan customer">
              <ul className="space-y-3 text-sm">
                {e.approvals.map((a) => (
                  <li key={a.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge domain="estimate" status={a.decision} />
                      <span className="text-xs text-slate-500">
                        {formatDateTime(a.approvedAt)} · dicatat oleh {a.recorder?.name}
                      </span>
                    </div>
                    <div className="mt-1">
                      Oleh <b>{a.customerName}</b> via {CHANNEL_LABEL[a.channel]} · {formatMoney(a.approvedTotal)}
                    </div>
                    {a.evidenceNote && <div className="mt-1 text-slate-600">{a.evidenceNote}</div>}
                    {a.attachmentId && (
                      <a className="mt-1 inline-block text-brand-700 hover:underline" href={`/api/files/${a.attachmentId}`} target="_blank" rel="noreferrer">
                        Lihat lampiran evidence
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Info">
            <DL
              cols={2}
              items={[
                ["Dibuat", formatDateTime(e.createdAt)],
                ["Berlaku s/d", formatDate(e.validUntil)],
                ["Dikirim", formatDateTime(e.sentAt)],
                ["Diputuskan", formatDateTime(e.decidedAt)],
              ]}
            />
            {e.cancelReason && <p className="mt-2 text-sm text-red-700">Batal: {e.cancelReason}</p>}
          </Card>
          {editable && can("estimate.approve") && (
            <Card title="Persetujuan customer">
              <ApprovalForm
                action={approveEstimateAction}
                estimateId={e.id}
                customerName={e.customer.name}
                taxRate={e.taxRate}
                items={e.items.map((i) => ({ id: i.id, description: i.description, itemType: i.itemType, qty: i.qty, total: i.total }))}
              />
            </Card>
          )}
          {canCreateWo && (
            <Card title="Buat Work Order">
              {!approvedItems.some((i) => i.itemType === "service") ? (
                <Alert tone="amber">Tidak ada jasa yang disetujui — Work Order membutuhkan minimal 1 jasa.</Alert>
              ) : (
                <ActionForm action={createWorkOrderAction} className="space-y-3">
                  <input type="hidden" name="estimateId" value={e.id} />
                  <Grid cols={2}>
                    <Field label="Prioritas">
                      <Select name="priority" defaultValue="normal">
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </Select>
                    </Field>
                    <Field label="Bay / stall">
                      <Input name="bay" placeholder="Bay 1" />
                    </Field>
                  </Grid>
                  <Field label="Supervisor">
                    <Select name="supervisorId" defaultValue="">
                      <option value="">-</option>
                      {supervisors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Estimasi selesai">
                    <Input type="datetime-local" name="estimatedFinishAt" />
                  </Field>
                  <SubmitButton className="w-full">Buat Work Order</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
