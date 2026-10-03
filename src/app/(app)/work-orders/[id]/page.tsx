import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getWorkOrder, mechanicOptions } from "@/server/services/workorders";
import { previewWorkOrderInvoice } from "@/server/services/invoices";
import { handoverReadiness } from "@/server/services/handover";
import { usersWithPermission } from "@/server/services/settings";
import { warehouseOptions } from "@/server/services/inventory";
import { db } from "@/server/db";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/client/action-form";
import { JobButtons, JobTimer } from "@/components/client/job-controls";
import { PartLinesForm } from "@/components/client/part-lines";
import {
  assignMechanicAction,
  cancelPartRequestAction,
  cancelWorkOrderAction,
  createPartRequestAction,
  handoverAction,
  jobActionAction,
  overrideJobPriceAction,
  returnPartAction,
  updateWorkOrderAction,
  waitingPartsAction,
} from "@/server/actions/workshop";
import { createInvoiceAction } from "@/server/actions/cashier";
import { Alert, Badge, ButtonLink, Card, DL, Field, Grid, Input, PageHeader, Select, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime, formatDuration, formatMoney, formatQty } from "@/lib/format";
import { statusInfo } from "@/lib/status";
import { waLink, WA_TEMPLATES } from "@/lib/whatsapp";
import { PrintButton } from "@/components/client/print-button";

function toLocalInput(d: Date | null) {
  if (!d) return "";
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  return t.toISOString().slice(0, 16);
}

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("workorder.view", "job.execute", "qc.view", "invoice.view", "inventory.issue");
  const { id } = await params;
  const wo = await load(() => getWorkOrder(ctx, id));
  const can = (p: string) => ctx.permissions.has(p);
  const active = !["completed", "cancelled"].includes(wo.status);
  const jobActive = ["waiting", "assigned", "in_progress", "paused", "waiting_parts", "rework"].includes(wo.status);
  const [mechanics, supervisors, warehouses, preview, readiness] = await Promise.all([
    can("workorder.assign") && jobActive ? mechanicOptions(ctx, wo.branchId) : Promise.resolve([]),
    can("workorder.edit") && active ? usersWithPermission(ctx, "workorder.assign", wo.branchId) : Promise.resolve([]),
    can("partrequest.create") && jobActive ? warehouseOptions(ctx) : Promise.resolve([]),
    wo.status === "completed" && !wo.invoice && can("invoice.view") ? previewWorkOrderInvoice(ctx, id) : Promise.resolve(null),
    wo.status !== "cancelled" && !wo.handoverAt ? handoverReadiness(db, wo) : Promise.resolve(null),
  ]);
  const branchWarehouses = warehouses.filter((w) => w.branchId === wo.branchId);
  const isAssigned = (job: (typeof wo.jobs)[number]) => job.mechanics.some((m) => m.isActive && m.mechanicId === ctx.userId);
  const unapproved = wo.allowance.filter((a) => a.unapprovedQty > 0);
  const wa = waLink(
    wo.customer.whatsapp ?? wo.customer.phone,
    wo.status === "completed"
      ? WA_TEMPLATES.completion({ name: wo.customer.name, plate: wo.vehicle.plateNumber, total: wo.invoice ? formatMoney(wo.invoice.grandTotal) : "-" })
      : WA_TEMPLATES.serviceProgress({ name: wo.customer.name, plate: wo.vehicle.plateNumber, status: statusInfo("workorder", wo.status).label }),
  );

  return (
    <>
      <PageHeader
        title={wo.woNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="workorder" status={wo.status} />
            <StatusBadge domain="priority" status={wo.priority} />
            {wo.handoverAt && <Badge tone="green">Sudah diserahkan</Badge>}
            <span>
              {wo.vehicle.plateNumber} · {wo.customer.name} · {wo.branch.name}
            </span>
          </span>
        }
        back={{ href: can("workorder.view") ? "/work-orders" : "/mechanic", label: can("workorder.view") ? "Work Order" : "Pekerjaan Saya" }}
        actions={
          <>
            {wa && can("workorder.view") && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Update WA
              </a>
            )}
            {wo.status === "qc" && can("qc.execute") && (
              <ButtonLink href={`/qc/${wo.id}`} variant="primary">
                Lakukan QC
              </ButtonLink>
            )}
            {(jobActive || (wo.status === "completed" && !wo.invoice && !wo.handoverAt)) && can("estimate.create") && (
              <ButtonLink href={`/estimates/new?workOrderId=${wo.id}`}>+ Estimate tambahan</ButtonLink>
            )}
            {jobActive && wo.status !== "waiting_parts" && (can("workorder.edit") || can("job.execute")) && (
              <ConfirmButton action={waitingPartsAction} fields={{ id: wo.id, waiting: "1" }} label="Waiting Parts" variant="warning" requireReason reasonLabel="Part yang ditunggu" title="Set status Waiting Parts?" />
            )}
            {wo.status === "waiting_parts" && (can("workorder.edit") || can("job.execute")) && (
              <ConfirmButton action={waitingPartsAction} fields={{ id: wo.id, waiting: "0" }} label="Part tersedia" title="Lanjutkan pekerjaan?" />
            )}
            <PrintButton label="Cetak job sheet" />
            {active && can("workorder.cancel") && (
              <ConfirmButton action={cancelWorkOrderAction} fields={{ id: wo.id }} label="Batalkan WO" variant="danger" requireReason title="Batalkan Work Order?" description="Part yang sudah keluar harus diretur terlebih dahulu." />
            )}
          </>
        }
      />

      {unapproved.length > 0 && (
        <div className="mb-4">
          <Alert tone="amber" title="Part terpakai melebihi persetujuan customer (BR-006)">
            {unapproved.map((u) => `${u.description}: +${formatQty(u.unapprovedQty)}`).join(", ")}. Buat estimate tambahan atau retur part sebelum invoice.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title={`Pekerjaan (${wo.jobs.length})`} bodyClassName="p-0">
            <Table className="rounded-none border-0 shadow-none">
              <THead>
                <tr>
                  <Th>Job</Th>
                  <Th>Mekanik</Th>
                  <Th>Status</Th>
                  <Th right>Std / Aktual</Th>
                  <Th right>Harga</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {wo.jobs.map((j) => {
                  const assigned = j.mechanics.find((m) => m.isActive);
                  return (
                    <tr key={j.id}>
                      <Td className="min-w-40">
                        <div className="font-medium">{j.description}</div>
                        {j.reworkCount > 0 && <Badge tone="red">Rework ×{j.reworkCount}</Badge>}
                        {j.notes && <div className="mt-1 text-xs text-slate-500">📝 {j.notes}</div>}
                      </Td>
                      <Td>
                        {can("workorder.assign") && jobActive && !["completed", "cancelled", "in_progress"].includes(j.status) ? (
                          <ActionForm action={assignMechanicAction} className="flex gap-1" showSuccess={false}>
                            <input type="hidden" name="woId" value={wo.id} />
                            <input type="hidden" name="jobId" value={j.id} />
                            <Select name="mechanicId" defaultValue={assigned?.mechanicId ?? ""} className="w-32 py-1 text-xs">
                              <option value="">- pilih -</option>
                              {mechanics.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </Select>
                            <SubmitButton variant="secondary" className="px-2 py-1 text-xs">
                              Set
                            </SubmitButton>
                          </ActionForm>
                        ) : (
                          (assigned?.mechanic.name ?? <span className="text-slate-400">belum ditugaskan</span>)
                        )}
                      </Td>
                      <Td>
                        <StatusBadge domain="job" status={j.status} />
                      </Td>
                      <Td right>
                        {j.standardHour}j / <JobTimer actualMinutes={j.actualMinutes} runningSince={j.runningSince?.toISOString() ?? null} />
                      </Td>
                      <Td right>
                        {formatMoney(j.price - j.discount)}
                        {can("workorder.price_override") && !wo.invoice && j.status !== "cancelled" && (
                          <details className="mt-1 text-left">
                            <summary className="cursor-pointer text-xs text-brand-700">Ubah harga</summary>
                            <ActionForm action={overrideJobPriceAction} className="mt-1 w-56 space-y-1">
                              <input type="hidden" name="jobId" value={j.id} />
                              <Input name="price" type="number" defaultValue={j.price} className="py-1 text-xs" aria-label="Harga" />
                              <Input name="discount" type="number" defaultValue={j.discount} className="py-1 text-xs" aria-label="Diskon" />
                              <Input name="reason" placeholder="Alasan (wajib)" required className="py-1 text-xs" />
                              <SubmitButton variant="secondary" className="px-2 py-1 text-xs">
                                Simpan (audit)
                              </SubmitButton>
                            </ActionForm>
                          </details>
                        )}
                      </Td>
                      <Td right className="whitespace-nowrap">{jobActive && can("job.execute") && (isAssigned(j) || can("workorder.assign")) && assigned && <JobButtons action={jobActionAction} jobId={j.id} status={j.status} />}</Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card title="Spare part & material" bodyClassName="p-0">
            <Table className="rounded-none border-0 shadow-none">
              <THead>
                <tr>
                  <Th>Part</Th>
                  <Th right>Disetujui</Th>
                  <Th right>Terpakai</Th>
                  <Th right>Menunggu issue</Th>
                  <Th right>Harga</Th>
                </tr>
              </THead>
              <TBody>
                {wo.allowance.length === 0 && (
                  <tr>
                    <Td colSpan={5} className="text-center text-slate-400">
                      Tidak ada part pada estimate
                    </Td>
                  </tr>
                )}
                {wo.allowance.map((a) => (
                  <tr key={a.partId}>
                    <Td>{a.description}</Td>
                    <Td right>{formatQty(a.approvedQty)}</Td>
                    <Td right className={a.unapprovedQty > 0 ? "font-semibold text-red-600" : undefined}>
                      {formatQty(a.netIssued)}
                    </Td>
                    <Td right>{a.pendingRequest ? formatQty(a.pendingRequest) : "-"}</Td>
                    <Td right>{formatMoney(a.price)}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            {wo.partRequests.length > 0 && (
              <div className="border-t border-slate-100 p-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Permintaan part</div>
                <ul className="space-y-3">
                  {wo.partRequests.map((pr) => (
                    <li key={pr.id} className="rounded-md border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {can("partrequest.view") || can("inventory.issue") ? (
                            <Link className="font-medium text-brand-700 hover:underline" href={`/part-requests/${pr.id}`}>
                              {pr.requestNumber}
                            </Link>
                          ) : (
                            pr.requestNumber
                          )}{" "}
                          <span className="text-slate-500">
                            · {formatDateTime(pr.requestDate)} · {pr.mechanic?.name} · {pr.warehouse.name}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusBadge domain="partRequest" status={pr.status} />
                          {["requested", "partially_issued"].includes(pr.status) && (can("partrequest.create") || can("inventory.issue")) && (
                            <ConfirmButton action={cancelPartRequestAction} fields={{ id: pr.id }} label="Batal" size="sm" requireReason title="Batalkan permintaan part?" />
                          )}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {pr.items.map((it) => (
                          <li key={it.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {it.part.partName} — diminta {formatQty(it.qtyRequested)}, keluar {formatQty(it.qtyIssued)}
                              {it.qtyReturned > 0 && `, retur ${formatQty(it.qtyReturned)}`}
                            </span>
                            {can("inventory.issue") && it.qtyIssued - it.qtyReturned > 0 && !wo.invoice && (
                              <ConfirmButton
                                action={returnPartAction}
                                fields={{ itemId: it.id }}
                                label="Retur"
                                size="sm"
                                requireReason
                                title={`Retur ${it.part.partName}`}
                                extra={
                                  <Field label="Qty retur">
                                    <Input name="qty" type="number" min={0.01} step="0.01" max={it.qtyIssued - it.qtyReturned} defaultValue={it.qtyIssued - it.qtyReturned} required />
                                  </Field>
                                }
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {jobActive && can("partrequest.create") && branchWarehouses.length > 0 && (
              <div className="border-t border-slate-100 p-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Minta part ke gudang</div>
                <PartLinesForm
                  action={createPartRequestAction}
                  mode="request"
                  hidden={{ woId: wo.id }}
                  warehouses={branchWarehouses.map((w) => ({ id: w.id, name: w.name }))}
                  submitLabel="Kirim permintaan part"
                />
              </div>
            )}
          </Card>

          {wo.status === "completed" && !wo.invoice && preview && (
            <Card title="Draft invoice (dari pekerjaan & part aktual)">
              {preview.blockers.length > 0 ? (
                <Alert tone="red" title="Invoice belum dapat dibuat">
                  <ul className="list-disc pl-4">
                    {preview.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {preview.items.map((i, idx) => (
                      <li key={idx} className="flex justify-between py-1.5">
                        <span>
                          {i.description} <span className="text-slate-500">× {formatQty(i.qty)}</span>
                        </span>
                        <span className="tabular-nums">{formatMoney(i.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-right text-sm">
                    Subtotal {formatMoney(preview.totals.subtotal)} · Diskon {formatMoney(preview.totals.discount)} · Pajak {formatMoney(preview.totals.tax)} ·{" "}
                    <b>Total {formatMoney(preview.totals.grandTotal)}</b>
                  </div>
                  {can("invoice.create") && (
                    <ActionForm action={createInvoiceAction} className="mt-3 flex flex-wrap items-end justify-end gap-2">
                      <input type="hidden" name="woId" value={wo.id} />
                      {can("invoice.discount") && (
                        <Field label="Diskon tambahan (Rp)">
                          <Input name="additionalDiscount" type="number" min={0} defaultValue={0} className="w-40" />
                        </Field>
                      )}
                      <SubmitButton>Terbitkan invoice</SubmitButton>
                    </ActionForm>
                  )}
                </>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Detail">
            <DL
              items={[
                ["Customer", <Link key="c" className="text-brand-700 hover:underline" href={`/customers/${wo.customerId}`}>{wo.customer.name}</Link>],
                ["Kendaraan", <Link key="v" className="text-brand-700 hover:underline" href={`/vehicles/${wo.vehicleId}`}>{wo.vehicle.plateNumber}</Link>],
                ["Odometer", wo.odometer ? `${wo.odometer.toLocaleString("id-ID")} km` : "-"],
                ["Bay", wo.bay],
                ["Service Advisor", wo.serviceAdvisor?.name],
                ["Supervisor", wo.supervisor?.name],
                ["Dibuat", formatDateTime(wo.createdAt)],
                ["Estimasi selesai", formatDateTime(wo.estimatedFinishAt)],
                ["Mulai", formatDateTime(wo.startedAt)],
                ["Selesai (QC)", formatDateTime(wo.completedAt)],
              ]}
            />
            <div className="mt-3 text-sm">
              <div className="text-xs font-semibold uppercase text-slate-500">Keluhan</div>
              <p>{wo.complaint}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link className="text-brand-700 hover:underline" href={`/checkins/${wo.checkinId}`}>
                {wo.checkin.checkinNumber}
              </Link>
              {wo.estimateId && (
                <Link className="text-brand-700 hover:underline" href={`/estimates/${wo.estimateId}`}>
                  Estimate awal
                </Link>
              )}
              {wo.additionalEstimates.map((e) => (
                <Link key={e.id} className="text-brand-700 hover:underline" href={`/estimates/${e.id}`}>
                  {e.estimateNumber} ({statusInfo("estimate", e.status).label})
                </Link>
              ))}
            </div>
            {wo.cancelReason && <p className="mt-2 text-sm text-red-700">Dibatalkan: {wo.cancelReason}</p>}
            {active && can("workorder.edit") && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Ubah prioritas / bay / supervisor</summary>
                <ActionForm action={updateWorkOrderAction} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={wo.id} />
                  <Grid cols={2}>
                    <Field label="Prioritas">
                      <Select name="priority" defaultValue={wo.priority}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </Select>
                    </Field>
                    <Field label="Bay">
                      <Input name="bay" defaultValue={wo.bay ?? ""} />
                    </Field>
                  </Grid>
                  <Field label="Supervisor">
                    <Select name="supervisorId" defaultValue={wo.supervisorId ?? ""}>
                      <option value="">-</option>
                      {supervisors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Estimasi selesai (WIB)">
                    <Input type="datetime-local" name="estimatedFinishAt" defaultValue={toLocalInput(wo.estimatedFinishAt)} />
                  </Field>
                  <SubmitButton variant="secondary">Simpan</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>

          {(wo.invoice || wo.status === "completed") && (
            <Card title="Invoice & serah terima">
              {wo.invoice ? (
                <div className="flex items-center justify-between text-sm">
                  <Link className="font-medium text-brand-700 hover:underline" href={`/invoices/${wo.invoice.id}`}>
                    {wo.invoice.invoiceNumber}
                  </Link>
                  <span className="flex items-center gap-2">
                    {formatMoney(wo.invoice.grandTotal)} <StatusBadge domain="payment" status={wo.invoice.paymentStatus} />
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Invoice belum diterbitkan.</p>
              )}
              {wo.handoverAt ? (
                <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
                  Diserahkan {formatDateTime(wo.handoverAt)} kepada <b>{wo.handoverReceivedBy}</b> oleh {wo.handoverByName}
                  {wo.handoverOverrideReason && <div className="mt-1 text-amber-800">Override: {wo.handoverOverrideReason}</div>}
                  {wo.handoverNotes && <div className="mt-1">{wo.handoverNotes}</div>}
                </div>
              ) : (
                readiness &&
                can("handover.execute") && (
                  <ActionForm action={handoverAction} className="mt-3 space-y-2">
                    <input type="hidden" name="woId" value={wo.id} />
                    {!readiness.ready && (
                      <Alert tone="amber" title="Syarat serah terima belum terpenuhi">
                        <ul className="list-disc pl-4">
                          {readiness.unmet.map((u) => (
                            <li key={u}>{u}</li>
                          ))}
                        </ul>
                      </Alert>
                    )}
                    <Field label="Diterima oleh" required>
                      <Input name="receivedBy" defaultValue={wo.customer.name} required />
                    </Field>
                    <Field label="Catatan">
                      <Input name="notes" />
                    </Field>
                    {!readiness.ready && can("handover.override") && (
                      <Field label="Alasan override (BR-008)" required>
                        <Input name="overrideReason" required minLength={3} />
                      </Field>
                    )}
                    <SubmitButton variant={readiness.ready ? "success" : "warning"} disabled={!readiness.ready && !can("handover.override")}>
                      {readiness.ready ? "Serahkan kendaraan" : "Override & serahkan"}
                    </SubmitButton>
                  </ActionForm>
                )
              )}
            </Card>
          )}

          {wo.qualityControls.length > 0 && (
            <Card title="Quality control">
              <ul className="space-y-2 text-sm">
                {wo.qualityControls.map((q) => (
                  <li key={q.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-center justify-between">
                      <StatusBadge domain="qc" status={q.result} />
                      <span className="text-xs text-slate-500">
                        {formatDateTime(q.qcDate)} · {q.qcUser.name}
                      </span>
                    </div>
                    {q.notes && <p className="mt-1">{q.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Histori status">
            <ol className="space-y-2 text-sm">
              {wo.statusHistory.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-2">
                  <span>
                    <StatusBadge domain="workorder" status={h.toStatus} />
                    {h.note && <span className="ml-1 text-slate-600">{h.note}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    {formatDateTime(h.changedAt)}
                    <br />
                    {h.changedByName}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-500">Total waktu kerja: {formatDuration(wo.jobs.reduce((a, j) => a + j.actualMinutes, 0))}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
