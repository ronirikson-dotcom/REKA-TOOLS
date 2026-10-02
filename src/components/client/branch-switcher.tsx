"use client";

import { useRef } from "react";
import { switchBranchAction } from "@/server/actions/auth";

export function BranchSwitcher({ branches, active, canSwitch }: { branches: { id: string; name: string }[]; active: string | null; canSwitch: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  if (!canSwitch) {
    return <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700">{branches.find((b) => b.id === active)?.name ?? "-"}</span>;
  }
  return (
    <form ref={ref} action={switchBranchAction}>
      <select
        name="branchId"
        defaultValue={active ?? ""}
        onChange={() => ref.current?.requestSubmit()}
        className="rounded-md border border-slate-300 bg-white py-1.5 pl-2 pr-7 text-xs font-medium text-slate-700 shadow-sm"
        aria-label="Cabang aktif"
      >
        <option value="">Semua Cabang</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
