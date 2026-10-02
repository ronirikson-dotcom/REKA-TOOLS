"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, Button, cn, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";

type Method = { id: string; name: string; type: string; requiresReference: boolean };
type Line = { key: string; paymentMethodId: string; amount: number; referenceNumber: string; tenderedAmount: number | "" };
const uid = () => Math.random().toString(36).slice(2);

/** Pembayaran tunggal / split (Cash, QRIS, Debit, Kartu Kredit, Transfer, E-Wallet) — URS-CAS-002 */
export function PaymentForm({ action, invoiceId, outstanding, methods }: { action: FormAction; invoiceId: string; outstanding: number; methods: Method[] }) {
  const [idempotencyKey, setKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid() + uid()));
  const [lines, setLines] = useState<Line[]>([{ key: uid(), paymentMethodId: methods[0]?.id ?? "", amount: outstanding, referenceNumber: "", tenderedAmount: outstanding }]);
  const total = useMemo(() => lines.reduce((a, l) => a + (Number(l.amount) || 0), 0), [lines]);
  const rest = Math.round((outstanding - total) * 100) / 100;
  const update = (key: string, patch: Partial<Line>) => setLines((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const payload = JSON.stringify({
    idempotencyKey,
    lines: lines.map((l) => ({ paymentMethodId: l.paymentMethodId, amount: l.amount, referenceNumber: l.referenceNumber || null, tenderedAmount: l.tenderedAmount === "" ? null : l.tenderedAmount })),
  });
  return (
    <ActionForm action={action} onSuccess={() => setKey(uid() + uid())}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-3">
        {lines.map((l, idx) => {
          const m = methods.find((x) => x.id === l.paymentMethodId);
          const isCash = m?.type === "cash";
          const change = isCash && l.tenderedAmount !== "" ? Number(l.tenderedAmount) - Number(l.amount) : 0;
          return (
            <div key={l.key} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Pembayaran {idx + 1}</span>
                {lines.length > 1 && (
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} aria-label="Hapus baris">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Select value={l.paymentMethodId} onChange={(e) => update(l.key, { paymentMethodId: e.target.value })} aria-label="Metode">
                  {methods.map((mm) => (
                    <option key={mm.id} value={mm.id}>
                      {mm.name}
                    </option>
                  ))}
                </Select>
                <Input type="number" min={1} step="1" value={l.amount} onChange={(e) => update(l.key, { amount: Number(e.target.value) })} aria-label="Nominal" placeholder="Nominal" />
                {isCash ? (
                  <>
                    <Input type="number" min={0} step="1000" value={l.tenderedAmount} onChange={(e) => update(l.key, { tenderedAmount: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="Uang diterima" aria-label="Uang diterima" />
                    <div className={cn("flex items-center rounded-md px-3 text-sm", change < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
                      Kembalian: <b className="ml-1">{formatMoney(Math.max(0, change))}</b>
                    </div>
                  </>
                ) : (
                  <Input
                    value={l.referenceNumber}
                    onChange={(e) => update(l.key, { referenceNumber: e.target.value })}
                    placeholder={m?.requiresReference ? "No. referensi / approval (wajib)" : "No. referensi"}
                    required={m?.requiresReference}
                    className="sm:col-span-2"
                    aria-label="Referensi"
                  />
                )}
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          onClick={() => setLines((x) => [...x, { key: uid(), paymentMethodId: methods.find((m) => m.type !== "cash")?.id ?? methods[0].id, amount: Math.max(0, rest), referenceNumber: "", tenderedAmount: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Split payment
        </Button>
        <div className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span>Total dibayar</span>
          <b className={cn(total > outstanding + 0.001 && "text-red-600")}>{formatMoney(total)}</b>
        </div>
        <div className="flex justify-between px-3 text-sm">
          <span>Sisa setelah pembayaran</span>
          <b className={rest < 0 ? "text-red-600" : rest > 0 ? "text-amber-700" : "text-emerald-700"}>{formatMoney(rest)}</b>
        </div>
        {total > outstanding + 0.001 && <p className="text-xs text-red-600">Total pembayaran melebihi sisa tagihan (AC-006).</p>}
      </div>
      <ActionFooter>
        <SubmitButton variant="success" disabled={total <= 0 || total > outstanding + 0.001}>
          Terima pembayaran
        </SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}
