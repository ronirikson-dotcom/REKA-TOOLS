"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SearchSelect } from "./pickers";

type CustomerOpt = { id: string; name: string; customerCode: string; phone: string | null };

export function CustomerPickerField({ name = "customerId", initial, placeholder = "Cari customer (nama / HP)" }: { name?: string; initial?: CustomerOpt | null; placeholder?: string }) {
  const [cust, setCust] = useState<CustomerOpt | null>(initial ?? null);
  return (
    <div>
      <input type="hidden" name={name} value={cust?.id ?? ""} />
      {cust ? (
        <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span>
            <b>{cust.name}</b> <span className="text-slate-500">· {cust.customerCode}</span>
          </span>
          <button type="button" onClick={() => setCust(null)} className="rounded p-1 hover:bg-white" aria-label="Hapus pilihan">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <SearchSelect<CustomerOpt>
          path="customers"
          placeholder={placeholder}
          onSelect={setCust}
          renderItem={(c) => (
            <span>
              <b>{c.name}</b> <span className="text-xs text-slate-500">{c.customerCode} · {c.phone ?? "-"}</span>
            </span>
          )}
        />
      )}
    </div>
  );
}
