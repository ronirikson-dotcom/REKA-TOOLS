"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { PartSearch, type PartOption } from "./pickers";
import { ActionFooter, cn, Field, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export type LineMode = "request" | "receive" | "opname" | "transfer" | "sale" | "po";

type Line = { key: string; part: PartOption; qty: number; unitCost: number; price: number; discount: number; countedQty: number };

const uid = () => Math.random().toString(36).slice(2);

/**
 * Editor baris part generik.
 * - request: qty | receive/po: qty + harga beli | opname: qty fisik | transfer: qty | sale: qty + harga jual + diskon
 */
export function PartLinesForm({
  action,
  mode,
  hidden = {},
  extra,
  warehouses,
  defaultWarehouseId,
  warehouseField = "warehouseId",
  submitLabel = "Simpan",
  showTotals,
  header,
  initialLines,
}: {
  action: FormAction;
  mode: LineMode;
  hidden?: Record<string, string>;
  extra?: Record<string, unknown>;
  warehouses?: { id: string; name: string; branchName?: string }[];
  defaultWarehouseId?: string;
  warehouseField?: string;
  submitLabel?: string;
  showTotals?: boolean;
  header?: (state: { set: (k: string, v: string) => void; values: Record<string, string> }) => ReactNode;
  initialLines?: { part: PartOption; qty: number; unitCost?: number }[];
}) {
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses?.[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>(
    (initialLines ?? []).map((l) => ({ key: uid(), part: l.part, qty: l.qty, unitCost: l.unitCost ?? l.part.purchasePrice, price: l.part.sellingPrice, discount: 0, countedQty: l.part.quantity })),
  );
  const add = (p: PartOption) =>
    setLines((ls) => {
      const existing = ls.find((l) => l.part.id === p.id);
      if (existing) return ls.map((l) => (l.part.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: uid(), part: p, qty: 1, unitCost: p.purchasePrice, price: p.sellingPrice, discount: 0, countedQty: p.quantity }];
    });
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const items = lines.map((l) => {
    switch (mode) {
      case "receive":
      case "po":
        return { partId: l.part.id, qty: l.qty, unitCost: l.unitCost };
      case "opname":
        return { partId: l.part.id, countedQty: l.countedQty };
      case "sale":
        return { partId: l.part.id, qty: l.qty, price: l.price, discount: l.discount };
      default:
        return { partId: l.part.id, qty: l.qty };
    }
  });
  const total = useMemo(
    () => lines.reduce((a, l) => a + (mode === "sale" ? l.qty * l.price - l.discount : mode === "receive" || mode === "po" ? l.qty * l.unitCost : 0), 0),
    [lines, mode],
  );
  const payload = JSON.stringify({ ...(extra ?? {}), ...values, ...(warehouses ? { [warehouseField]: warehouseId } : {}), items });

  return (
    <ActionForm action={action}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-3">
        {header?.({ set: (k, v) => setValues((x) => ({ ...x, [k]: v })), values })}
        <div className="grid gap-3 md:grid-cols-3">
          {warehouses && (
            <Field label="Gudang">
              <Select
                value={warehouseId}
                onChange={(e) => {
                  setWarehouseId(e.target.value);
                  setLines([]);
                }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.branchName ? ` (${w.branchName})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Tambah part" className={warehouses ? "md:col-span-2" : "md:col-span-3"}>
            <PartSearch warehouseId={warehouseId || undefined} onSelect={add} />
          </Field>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Part</th>
                {warehouseId && <th className="px-3 py-2 text-right">Stok</th>}
                {mode === "opname" ? (
                  <th className="w-32 px-3 py-2 text-right">Qty fisik</th>
                ) : (
                  <th className="w-28 px-3 py-2 text-right">Qty</th>
                )}
                {(mode === "receive" || mode === "po") && <th className="w-36 px-3 py-2 text-right">Harga beli</th>}
                {mode === "sale" && (
                  <>
                    <th className="w-36 px-3 py-2 text-right">Harga</th>
                    <th className="w-28 px-3 py-2 text-right">Diskon</th>
                  </>
                )}
                {mode === "opname" && <th className="px-3 py-2 text-right">Selisih</th>}
                {showTotals && <th className="px-3 py-2 text-right">Subtotal</th>}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Cari dan tambahkan part
                  </td>
                </tr>
              )}
              {lines.map((l) => {
                const short = (mode === "request" || mode === "transfer" || mode === "sale") && warehouseId && l.qty > l.part.quantity;
                const diff = l.countedQty - l.part.quantity;
                return (
                  <tr key={l.key}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.part.partName}</div>
                      <div className="text-xs text-slate-500">
                        {l.part.sku} · {l.part.unit}
                      </div>
                    </td>
                    {warehouseId && <td className={cn("px-3 py-2 text-right tabular-nums", short && "font-semibold text-red-600")}>{l.part.quantity}</td>}
                    <td className="px-3 py-2">
                      {mode === "opname" ? (
                        <Input type="number" min={0} step="0.01" value={l.countedQty} onChange={(e) => update(l.key, { countedQty: Number(e.target.value) })} className="text-right" />
                      ) : (
                        <Input type="number" min={0.01} step="0.01" value={l.qty} onChange={(e) => update(l.key, { qty: Number(e.target.value) })} className="text-right" />
                      )}
                    </td>
                    {(mode === "receive" || mode === "po") && (
                      <td className="px-3 py-2">
                        <Input type="number" min={0} step="100" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: Number(e.target.value) })} className="text-right" />
                      </td>
                    )}
                    {mode === "sale" && (
                      <>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} step="100" value={l.price} onChange={(e) => update(l.key, { price: Number(e.target.value) })} className="text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} step="100" value={l.discount} onChange={(e) => update(l.key, { discount: Number(e.target.value) })} className="text-right" />
                        </td>
                      </>
                    )}
                    {mode === "opname" && (
                      <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-600" : "text-slate-400")}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    )}
                    {showTotals && (
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(mode === "sale" ? l.qty * l.price - l.discount : l.qty * l.unitCost)}</td>
                    )}
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
        {showTotals && (
          <div className="text-right text-sm">
            Total: <b className="text-base">{formatMoney(total)}</b>
          </div>
        )}
      </div>
      <ActionFooter>
        <SubmitButton disabled={lines.length === 0}>{submitLabel}</SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}
