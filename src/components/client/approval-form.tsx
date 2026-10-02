"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, cn, Field, Grid, Input, Select, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/format";

type Item = { id: string; description: string; itemType: string; qty: number; total: number };

/** Rekam keputusan customer: approve penuh / sebagian / reject + evidence (URS-EST-002/003) */
export function ApprovalForm({ action, estimateId, items, customerName, taxRate }: { action: FormAction; estimateId: string; items: Item[]; customerName: string; taxRate: number }) {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>(Object.fromEntries(items.map((i) => [i.id, "approved"])));
  const [name, setName] = useState(customerName);
  const [channel, setChannel] = useState("in_person");
  const [note, setNote] = useState("");
  const approvedNet = items.filter((i) => decisions[i.id] === "approved").reduce((a, i) => a + i.total, 0);
  const approvedTotal = approvedNet * (1 + taxRate / 100);
  const setAll = (d: "approved" | "rejected") => setDecisions(Object.fromEntries(items.map((i) => [i.id, d])));
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={estimateId} />
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({ decisions: Object.entries(decisions).map(([itemId, decision]) => ({ itemId, decision })), customerName: name, channel, evidenceNote: note })}
      />
      <div className="mb-2 flex gap-2">
        <button type="button" className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setAll("approved")}>
          Setujui semua
        </button>
        <span className="text-slate-300">|</span>
        <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => setAll("rejected")}>
          Tolak semua
        </button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{i.description}</span>
              <span className="text-xs text-slate-500">
                {i.qty} × · {formatMoney(i.total)}
              </span>
            </span>
            <span className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-xs font-semibold">
              {(["approved", "rejected"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecisions((x) => ({ ...x, [i.id]: d }))}
                  className={cn(
                    "px-3 py-1.5",
                    decisions[i.id] === d ? (d === "approved" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {d === "approved" ? "Setuju" : "Tolak"}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-right text-sm">
        Total disetujui (incl. pajak): <b>{formatMoney(approvedTotal)}</b>
      </div>
      <Grid cols={2} className="mt-3">
        <Field label="Nama yang menyetujui" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Kanal persetujuan" required>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="in_person">Langsung (tanda tangan)</option>
            <option value="phone">Telepon</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </Select>
        </Field>
      </Grid>
      <Field label="Evidence / catatan" hint="Wajib isi catatan atau lampirkan bukti (foto tanda tangan / screenshot chat)" className="mt-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Disetujui via WA pukul 10.15 oleh Bpk. Budi" />
      </Field>
      <Field label="Lampiran evidence" className="mt-3">
        <Input type="file" name="evidence" accept="image/*,application/pdf" />
      </Field>
      <ActionFooter>
        <SubmitButton variant="success">Simpan keputusan customer</SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}
