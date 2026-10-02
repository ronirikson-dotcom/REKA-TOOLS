"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, Card, Checkbox, cn, Field, Textarea } from "@/components/ui";

export function QcForm({ action, woId, checklist, jobs }: { action: FormAction; woId: string; checklist: string[]; jobs: { id: string; description: string; mechanic: string | null }[] }) {
  const [checks, setChecks] = useState(checklist.map((item) => ({ item, ok: true })));
  const [result, setResult] = useState<"pass" | "fail" | "rework">("pass");
  const [notes, setNotes] = useState("");
  const [rework, setRework] = useState<string[]>([]);
  const allOk = checks.every((c) => c.ok);
  return (
    <ActionForm action={action}>
      <input type="hidden" name="woId" value={woId} />
      <input type="hidden" name="payload" value={JSON.stringify({ result, notes, checklist: checks, reworkJobIds: result === "pass" ? [] : rework })} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Checklist QC">
          <ul className="space-y-2">
            {checks.map((c, i) => (
              <li key={c.item}>
                <Checkbox label={c.item} checked={c.ok} onChange={(e) => setChecks((x) => x.map((y, j) => (j === i ? { ...y, ok: e.target.checked } : y)))} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Hasil QC">
          <div className="grid grid-cols-3 gap-2">
            {(["pass", "rework", "fail"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResult(r)}
                className={cn(
                  "rounded-md border px-3 py-3 text-sm font-semibold",
                  result === r
                    ? r === "pass"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : r === "rework"
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-red-600 bg-red-600 text-white"
                    : "border-slate-300 bg-white text-slate-700",
                )}
              >
                {r === "pass" ? "PASS" : r === "rework" ? "REWORK" : "FAIL"}
              </button>
            ))}
          </div>
          {result === "pass" && !allOk && <p className="mt-2 text-xs text-amber-700">Ada checklist yang belum OK — pertimbangkan Rework.</p>}
          {result !== "pass" && (
            <Field label="Job yang dikerjakan ulang" hint="Kosongkan untuk mengembalikan semua job" className="mt-3">
              <ul className="space-y-1">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Checkbox
                      label={`${j.description}${j.mechanic ? ` (${j.mechanic})` : ""}`}
                      checked={rework.includes(j.id)}
                      onChange={(e) => setRework((x) => (e.target.checked ? [...x, j.id] : x.filter((y) => y !== j.id)))}
                    />
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label={result === "pass" ? "Catatan" : "Catatan koreksi (wajib)"} className="mt-3" required={result !== "pass"}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} required={result !== "pass"} />
          </Field>
          <ActionFooter>
            <SubmitButton variant={result === "pass" ? "success" : "danger"}>Simpan hasil QC</SubmitButton>
          </ActionFooter>
        </Card>
      </div>
    </ActionForm>
  );
}
