"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, Card, cn, Input, Textarea } from "@/components/ui";

type Item = { category: string; itemName: string };
const RESULTS = [
  { key: "good", label: "Good", cls: "peer-checked:bg-emerald-600 peer-checked:text-white border-emerald-300 text-emerald-700" },
  { key: "attention", label: "Attention", cls: "peer-checked:bg-amber-500 peer-checked:text-white border-amber-300 text-amber-700" },
  { key: "replace", label: "Replace", cls: "peer-checked:bg-red-600 peer-checked:text-white border-red-300 text-red-700" },
  { key: "not_checked", label: "N/C", cls: "peer-checked:bg-slate-500 peer-checked:text-white border-slate-300 text-slate-600" },
] as const;

/** Checklist inspeksi sesuai jenis kendaraan: Good / Attention / Replace / Not Checked (URS-INS-001/002) */
export function InspectionForm({ action, checkinId, items }: { action: FormAction; checkinId: string; items: Item[] }) {
  const [rows, setRows] = useState(items.map((i) => ({ ...i, result: "good", notes: "" })));
  const [notes, setNotes] = useState("");
  const groups = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const update = (idx: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  return (
    <ActionForm action={action}>
      <input type="hidden" name="checkinId" value={checkinId} />
      <input type="hidden" name="payload" value={JSON.stringify({ notes, items: rows })} />
      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g} title={g} bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {rows.map((r, idx) =>
                r.category !== g ? null : (
                  <li key={idx} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                    <span className="flex-1 text-sm font-medium text-slate-800">{r.itemName}</span>
                    <div className="flex gap-1">
                      {RESULTS.map((res) => (
                        <label key={res.key}>
                          <input type="radio" className="peer sr-only" name={`r-${idx}`} checked={r.result === res.key} onChange={() => update(idx, { result: res.key })} />
                          <span className={cn("inline-block cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold", res.cls)}>{res.label}</span>
                        </label>
                      ))}
                    </div>
                    <Input className="md:w-64" placeholder="Catatan / temuan" value={r.notes} onChange={(e) => update(idx, { notes: e.target.value })} />
                  </li>
                ),
              )}
            </ul>
          </Card>
        ))}
        <Card title="Diagnosa & rekomendasi">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ringkasan diagnosa dan rekomendasi pekerjaan" />
          <ActionFooter>
            <SubmitButton>Simpan inspeksi</SubmitButton>
          </ActionFooter>
        </Card>
      </div>
    </ActionForm>
  );
}
