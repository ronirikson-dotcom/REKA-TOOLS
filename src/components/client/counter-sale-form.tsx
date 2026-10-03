"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PartLinesForm } from "./part-lines";
import { SearchSelect } from "./pickers";
import type { FormAction } from "./action-form";
import { Field, Input } from "@/components/ui";

type CustomerOpt = { id: string; name: string; customerCode: string; phone: string | null };

export function CounterSaleForm({ action, warehouses, canDiscount }: { action: FormAction; warehouses: { id: string; name: string }[]; canDiscount: boolean }) {
  const [customer, setCustomer] = useState<CustomerOpt | null>(null);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Customer (opsional)" className="md:col-span-2">
          {customer ? (
            <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <span>
                <b>{customer.name}</b> · {customer.customerCode}
              </span>
              <button type="button" onClick={() => setCustomer(null)} aria-label="Hapus customer">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <SearchSelect<CustomerOpt>
              path="customers"
              placeholder="Walk-in / cari customer"
              onSelect={setCustomer}
              renderItem={(c) => (
                <span>
                  <b>{c.name}</b> <span className="text-xs text-slate-500">{c.phone}</span>
                </span>
              )}
            />
          )}
        </Field>
        {canDiscount && (
          <Field label="Diskon tambahan (Rp)">
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </Field>
        )}
      </div>
      <Field label="Catatan">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <PartLinesForm
        action={action}
        mode="sale"
        warehouses={warehouses}
        showTotals
        extra={{ customerId: customer?.id ?? null, notes, additionalDiscount: discount }}
        submitLabel="Buat invoice penjualan"
      />
    </div>
  );
}
