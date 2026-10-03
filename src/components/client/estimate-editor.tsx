"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { PartSearch, type PartOption } from "./pickers";
import { ActionFooter, Badge, Button, Card, cn, Field, Input, Select, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/format";

type Service = { id: string; serviceCode: string; serviceName: string; sellingPrice: number; standardHour: number; category: string | null };
export type EstimateLine = {
  key: string;
  itemType: "service" | "part" | "material";
  serviceId: string | null;
  partId: string | null;
  description: string;
  qty: number;
  price: number;
  discount: number;
};

const uid = () => Math.random().toString(36).slice(2);

export function EstimateEditor({
  action,
  hidden,
  services,
  taxRate,
  initialItems = [],
  initialNotes = "",
  findings = [],
  submitLabel = "Simpan estimate",
}: {
  action: FormAction;
  hidden: Record<string, string>;
  services: Service[];
  taxRate: number;
  initialItems?: Omit<EstimateLine, "key">[];
  initialNotes?: string;
  findings?: { category: string; itemName: string; result: string; notes: string | null }[];
  submitLabel?: string;
}) {
  const [lines, setLines] = useState<EstimateLine[]>(initialItems.map((i) => ({ ...i, key: uid() })));
  const [notes, setNotes] = useState(initialNotes);
  const [svcId, setSvcId] = useState("");

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const discount = lines.reduce((a, l) => a + (l.discount || 0), 0);
    const tax = Math.round(((subtotal - discount) * taxRate) / 100 * 100) / 100;
    return { subtotal, discount, tax, grand: subtotal - discount + tax };
  }, [lines, taxRate]);

  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    setLines((l) => [...l, { key: uid(), itemType: "service", serviceId: s.id, partId: null, description: s.serviceName, qty: 1, price: s.sellingPrice, discount: 0 }]);
    setSvcId("");
  };
  const addPart = (p: PartOption) =>
    setLines((l) => [...l, { key: uid(), itemType: p.itemType === "material" ? "material" : "part", serviceId: null, partId: p.id, description: p.partName, qty: 1, price: p.sellingPrice, discount: 0 }]);
  const update = (key: string, patch: Partial<EstimateLine>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const payload = JSON.stringify({
    ...hidden,
    notes,
    items: lines.map(({ key: _k, ...rest }) => rest),
  });

  return (
    <ActionForm action={action}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Tambah item">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Jasa">
                <Select value={svcId} onChange={(e) => addService(e.target.value)}>
                  <option value="">+ Pilih jasa...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.serviceCode} · {s.serviceName} ({formatMoney(s.sellingPrice)})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Spare part / material">
                <PartSearch onSelect={addPart} />
              </Field>
            </div>
          </Card>
          <Card title={`Item estimate (${lines.length})`} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Tipe</th>
                    <th className="px-3 py-2">Deskripsi</th>
                    <th className="w-20 px-3 py-2 text-right">Qty</th>
                    <th className="w-32 px-3 py-2 text-right">Harga</th>
                    <th className="w-28 px-3 py-2 text-right">Diskon</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        Tambahkan jasa atau part
                      </td>
                    </tr>
                  )}
                  {lines.map((l) => {
                    const total = l.qty * l.price - (l.discount || 0);
                    return (
                      <tr key={l.key}>
                        <td className="px-3 py-2">
                          <Badge tone={l.itemType === "service" ? "blue" : l.itemType === "part" ? "indigo" : "teal"}>{l.itemType === "service" ? "Jasa" : l.itemType === "part" ? "Part" : "Material"}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="min-w-56" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0.01} step="0.01" value={l.qty} onChange={(e) => update(l.key, { qty: Number(e.target.value) })} className="min-w-[4.5rem] px-2 text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} step="100" value={l.price} onChange={(e) => update(l.key, { price: Number(e.target.value) })} className="min-w-[7.5rem] px-2 text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} step="100" value={l.discount} onChange={(e) => update(l.key, { discount: Number(e.target.value) })} className="min-w-[6.5rem] px-2 text-right" />
                        </td>
                        <td className={cn("px-3 py-2 text-right font-medium tabular-nums", total < 0 && "text-red-600")}>{formatMoney(total)}</td>
                        <td className="px-2 py-2">
                          <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} aria-label="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Catatan untuk customer">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Ringkasan">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Diskon</dt>
                <dd className="tabular-nums text-red-600">-{formatMoney(totals.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pajak ({taxRate}%)</dt>
                <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <dt>Grand total</dt>
                <dd className="tabular-nums">{formatMoney(totals.grand)}</dd>
              </div>
            </dl>
            <ActionFooter>
              <SubmitButton disabled={lines.length === 0}>{submitLabel}</SubmitButton>
            </ActionFooter>
          </Card>
          {findings.length > 0 && (
            <Card title="Temuan inspeksi">
              <ul className="space-y-2 text-sm">
                {findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge tone={f.result === "replace" ? "red" : "amber"}>{f.result === "replace" ? "Replace" : "Attention"}</Badge>
                    <span>
                      {f.itemName}
                      {f.notes && <span className="text-slate-500"> — {f.notes}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Gunakan temuan sebagai dasar rekomendasi estimate.</p>
            </Card>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines([])}>
            Kosongkan item
          </Button>
        </div>
      </div>
    </ActionForm>
  );
}
