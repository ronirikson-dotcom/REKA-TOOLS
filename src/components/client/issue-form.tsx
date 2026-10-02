"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, cn, Input } from "@/components/ui";

type Item = { id: string; partName: string; sku: string; qtyRequested: number; qtyIssued: number; available: number };

/** Issue part penuh / sebagian (URS-INV-006) */
export function IssueForm({ action, requestId, items }: { action: FormAction; requestId: string; items: Item[] }) {
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, Math.max(0, Math.min(i.qtyRequested - i.qtyIssued, i.available))])),
  );
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="payload" value={JSON.stringify({ items: Object.entries(qty).map(([itemId, q]) => ({ itemId, qty: q })) })} />
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Part</th>
              <th className="px-3 py-2 text-right">Diminta</th>
              <th className="px-3 py-2 text-right">Sudah keluar</th>
              <th className="px-3 py-2 text-right">Stok gudang</th>
              <th className="w-32 px-3 py-2 text-right">Issue sekarang</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i) => {
              const remaining = i.qtyRequested - i.qtyIssued;
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.partName}</div>
                    <div className="text-xs text-slate-500">{i.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{i.qtyRequested}</td>
                  <td className="px-3 py-2 text-right">{i.qtyIssued}</td>
                  <td className={cn("px-3 py-2 text-right font-medium", i.available < remaining ? "text-red-600" : "text-emerald-700")}>{i.available}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={remaining}
                      step="0.01"
                      value={qty[i.id] ?? 0}
                      disabled={remaining <= 0}
                      onChange={(e) => setQty((x) => ({ ...x, [i.id]: Number(e.target.value) }))}
                      className="text-right"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ActionFooter>
        <SubmitButton>Keluarkan part (kurangi stok)</SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}
