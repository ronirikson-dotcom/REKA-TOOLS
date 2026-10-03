import Link from "next/link";
import { load, pageContext } from "@/server/page";
import { getInvoice, paymentMethodOptions } from "@/server/services/invoices";
import { ConfirmButton } from "@/components/client/action-form";
import { PaymentForm } from "@/components/client/payment-form";
import { PrintButton } from "@/components/client/print-button";
import { authorizeReceivableAction, receivePaymentAction, refundAction, voidInvoiceAction, voidPaymentAction } from "@/server/actions/cashier";
import { Alert, Badge, Card, Field, Input, PageHeader, Select, StatusBadge } from "@/components/ui";
import { ITEM_TYPE_LABEL } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { addDaysISO, todayISO } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("invoice.view");
  const { id } = await params;
  const inv = await load(() => getInvoice(ctx, id));
  const methods = await paymentMethodOptions(ctx);
  const can = (p: string) => ctx.permissions.has(p);
  const isVoid = inv.status === "void";
  const posted = inv.payments.filter((p) => p.status === "posted");
  const wa = inv.customer
    ? waLink(
        inv.customer.whatsapp ?? inv.customer.phone,
        `Halo ${inv.customer.name}, berikut tagihan ${inv.invoiceNumber}${inv.vehicle ? ` untuk ${inv.vehicle.plateNumber}` : ""}: ${formatMoney(inv.grandTotal)}. Sisa: ${formatMoney(inv.outstanding)}. Terima kasih.`,
      )
    : null;
  return (
    <>
      <PageHeader
        title={inv.invoiceNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {isVoid ? <StatusBadge domain="invoice" status="void" /> : <StatusBadge domain="payment" status={inv.paymentStatus} />}
            {inv.invoiceType === "counter" && <Badge>Penjualan counter</Badge>}
            {inv.arAuthorizedAt && <Badge tone="purple">Piutang s/d {formatDate(inv.arDueDate)}</Badge>}
          </span>
        }
        back={{ href: "/invoices", label: "Invoice" }}
        actions={
          <>
            {wa && !isVoid && (
              <a href={wa} target="_blank" rel="noreferrer" className="no-print inline-flex items-center rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Kirim WA
              </a>
            )}
            <PrintButton label="Cetak invoice / receipt" />
            {!isVoid && inv.outstanding > 0 && !inv.arAuthorizedAt && can("payment.receivable") && (
              <ConfirmButton
                action={authorizeReceivableAction}
                fields={{ id: inv.id }}
                label="Otorisasi piutang"
                requireReason
                reasonLabel="Catatan otorisasi"
                title="Otorisasi piutang (tempo)"
                description={`Sisa tagihan ${formatMoney(inv.outstanding)} dicatat sebagai piutang. Kendaraan dapat diserahkan sebelum lunas.`}
                extra={
                  <Field label="Jatuh tempo" required>
                    <Input type="date" name="dueDate" defaultValue={addDaysISO(todayISO(), 30)} min={todayISO()} required />
                  </Field>
                }
              />
            )}
            {!isVoid && inv.paidAmount > 0 && can("payment.refund") && (
              <ConfirmButton
                action={refundAction}
                fields={{ invoiceId: inv.id }}
                label="Refund"
                variant="warning"
                requireReason
                title="Refund pembayaran"
                extra={
                  <>
                    <Field label="Metode refund">
                      <Select name="paymentMethodId">
                        {methods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nominal">
                      <Input name="amount" type="number" min={1} max={inv.paidAmount} defaultValue={inv.paidAmount} required />
                    </Field>
                    <Field label="Referensi">
                      <Input name="referenceNumber" />
                    </Field>
                  </>
                }
              />
            )}
            {!isVoid && inv.paidAmount === 0 && can("invoice.void") && (
              <ConfirmButton action={voidInvoiceAction} fields={{ id: inv.id }} label="Void invoice" variant="danger" requireReason title="Void invoice?" description="Invoice tidak dihapus, statusnya menjadi VOID dan tercatat di audit (BR-016)." />
            )}
          </>
        }
      />
      {isVoid && (
        <div className="mb-4">
          <Alert tone="red">
            Invoice di-void {formatDateTime(inv.voidedAt)}: {inv.voidReason}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="print-area xl:col-span-2">
          <div className="flex flex-wrap justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="text-lg font-bold text-slate-900">{inv.company.name}</div>
              <div className="text-xs text-slate-500">{inv.branch.name}</div>
              <div className="text-xs text-slate-500">{inv.branch.address ?? inv.company.address}</div>
              <div className="text-xs text-slate-500">{inv.branch.phone ?? inv.company.phone}</div>
              {inv.company.taxId && <div className="text-xs text-slate-500">NPWP {inv.company.taxId}</div>}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide text-slate-800">INVOICE</div>
              <div className="font-mono text-sm">{inv.invoiceNumber}</div>
              <div className="text-xs text-slate-500">{formatDateTime(inv.invoiceDate)}</div>
            </div>
          </div>
          <div className="grid gap-4 py-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-slate-500">Ditagihkan kepada</div>
              <div className="font-semibold">{inv.customer?.name ?? "Walk-in customer"}</div>
              {inv.customer?.companyName && <div>{inv.customer.companyName}</div>}
              <div className="text-slate-600">{inv.customer?.phone}</div>
            </div>
            {inv.vehicle && (
              <div>
                <div className="text-xs uppercase text-slate-500">Kendaraan</div>
                <div className="font-semibold">{inv.vehicle.plateNumber}</div>
                <div className="text-slate-600">{[inv.vehicle.brand?.name, inv.vehicle.model?.name, inv.vehicle.year].filter(Boolean).join(" ")}</div>
                {inv.workOrder && (
                  <div className="text-slate-600">
                    WO{" "}
                    <Link href={`/work-orders/${inv.workOrder.id}`} className="text-brand-700 hover:underline">
                      {inv.workOrder.woNumber}
                    </Link>{" "}
                    · {inv.workOrder.odometer?.toLocaleString("id-ID")} km
                  </div>
                )}
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="border-y border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Harga</th>
                <th className="py-2 text-right">Diskon</th>
                <th className="py-2 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2">
                    {it.description} <span className="text-xs text-slate-400">({ITEM_TYPE_LABEL[it.itemType]})</span>
                  </td>
                  <td className="py-2 text-right">{formatQty(it.qty)}</td>
                  <td className="py-2 text-right">{formatMoney(it.price)}</td>
                  <td className="py-2 text-right">{it.discount ? formatMoney(it.discount) : "-"}</td>
                  <td className="py-2 text-right">{formatMoney(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <dl className="w-72 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(inv.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Diskon item</dt>
                <dd>-{formatMoney(inv.itemDiscount)}</dd>
              </div>
              {inv.additionalDiscount > 0 && (
                <div className="flex justify-between">
                  <dt>Diskon tambahan</dt>
                  <dd>-{formatMoney(inv.additionalDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>PPN ({inv.taxRate}%)</dt>
                <dd>{formatMoney(inv.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatMoney(inv.grandTotal)}</dd>
              </div>
              <div className="flex justify-between text-emerald-700">
                <dt>Dibayar</dt>
                <dd>{formatMoney(inv.paidAmount)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Sisa</dt>
                <dd>{formatMoney(inv.outstanding)}</dd>
              </div>
            </dl>
          </div>
          {posted.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Receipt pembayaran</div>
              <ul className="space-y-1 text-sm">
                {posted.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {p.paymentNumber} · {formatDateTime(p.paymentDate)} · {p.method.name}
                      {p.referenceNumber ? ` (${p.referenceNumber})` : ""}
                      {p.changeAmount ? ` · kembali ${formatMoney(p.changeAmount)}` : ""}
                    </span>
                    <span className={p.type === "refund" ? "text-red-600" : undefined}>
                      {p.type === "refund" ? "-" : ""}
                      {formatMoney(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-6 text-center text-xs text-slate-400">Terima kasih atas kepercayaan Anda.</p>
        </Card>
        <div className="no-print space-y-4">
          {!isVoid && inv.outstanding > 0 && can("payment.receive") && (
            <Card title={`Terima pembayaran · sisa ${formatMoney(inv.outstanding)}`}>
              <PaymentForm action={receivePaymentAction} invoiceId={inv.id} outstanding={inv.outstanding} methods={methods.map((m) => ({ id: m.id, name: m.name, type: m.type, requiresReference: m.requiresReference }))} />
            </Card>
          )}
          {inv.arAuthorizedAt && (
            <Card title="Otorisasi piutang">
              <p className="text-sm">
                Oleh <b>{inv.arAuthorizedByName}</b> pada {formatDateTime(inv.arAuthorizedAt)}. Jatuh tempo {formatDate(inv.arDueDate)}.
              </p>
              {inv.arNote && <p className="mt-1 text-sm text-slate-600">{inv.arNote}</p>}
            </Card>
          )}
          <Card title="Riwayat pembayaran">
            {inv.payments.length === 0 && <p className="text-sm text-slate-400">Belum ada pembayaran</p>}
            <ul className="space-y-2 text-sm">
              {inv.payments.map((p) => (
                <li key={p.id} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.paymentNumber}</span>
                    <span className="flex items-center gap-1">
                      {p.type === "refund" && <Badge tone="purple">Refund</Badge>}
                      <StatusBadge domain="paymentLine" status={p.status} />
                    </span>
                  </div>
                  <div className="text-slate-600">
                    {p.method.name} · {formatMoney(p.amount)} · {p.receiver?.name}
                  </div>
                  {p.voidReason && <div className="text-xs text-red-700">Void: {p.voidReason}</div>}
                  {p.notes && p.type === "refund" && <div className="text-xs text-slate-500">{p.notes}</div>}
                  {p.status === "posted" && can("payment.void") && (
                    <div className="mt-1">
                      <ConfirmButton action={voidPaymentAction} fields={{ id: p.id }} label="Void" size="sm" variant="danger" requireReason title={`Void ${p.paymentNumber}?`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
