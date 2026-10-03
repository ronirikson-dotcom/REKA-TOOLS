"use client";

import { useState } from "react";
import { PartLinesForm } from "./part-lines";
import type { FormAction } from "./action-form";
import type { PartOption } from "./pickers";
import { Field, Grid, Input, Select } from "@/components/ui";
import { todayISO } from "@/lib/utils";

type Wh = { id: string; name: string; branchName?: string };
type Opt = { id: string; name: string };

export function ReceivingForm({
  action,
  warehouses,
  suppliers,
  po,
}: {
  action: FormAction;
  warehouses: Wh[];
  suppliers: Opt[];
  po?: { id: string; poNumber: string; supplierId: string; warehouseId: string; lines: { part: PartOption; qty: number; unitCost: number }[] } | null;
}) {
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3">
      <Grid cols={3}>
        <Field label="Supplier">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!po}>
            <option value="">-</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="No. faktur / surat jalan supplier">
          <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Grid>
      <PartLinesForm
        action={action}
        mode="receive"
        warehouses={po ? warehouses.filter((w) => w.id === po.warehouseId) : warehouses}
        defaultWarehouseId={po?.warehouseId}
        extra={{ supplierId: supplierId || null, supplierInvoiceNo: invoiceNo, notes, purchaseOrderId: po?.id ?? null }}
        initialLines={po?.lines}
        showTotals
        submitLabel={po ? `Terima barang ${po.poNumber}` : "Simpan penerimaan"}
      />
    </div>
  );
}

export function AdjustmentForm({ action, warehouses }: { action: FormAction; warehouses: Wh[] }) {
  const [type, setType] = useState<"opname" | "adjustment">("opname");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3">
      <Grid cols={2}>
        <Field label="Jenis">
          <Select value={type} onChange={(e) => setType(e.target.value as "opname" | "adjustment")}>
            <option value="opname">Stock opname (hitung fisik)</option>
            <option value="adjustment">Adjustment (koreksi)</option>
          </Select>
        </Field>
        <Field label="Alasan / keterangan" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Stock opname bulanan Oktober" required />
        </Field>
      </Grid>
      <p className="text-xs text-slate-500">Isi qty fisik hasil hitung. Sistem mencatat selisih sebagai stock movement adjustment (+/-).</p>
      <PartLinesForm action={action} mode="opname" warehouses={warehouses} extra={{ adjustmentType: type, reason }} submitLabel="Posting opname / adjustment" />
    </div>
  );
}

export function TransferForm({ action, from, to }: { action: FormAction; from: Wh[]; to: Wh[] }) {
  const [toId, setToId] = useState(to.find((w) => w.id !== from[0]?.id)?.id ?? "");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3">
      <Grid cols={2}>
        <Field label="Gudang tujuan" required>
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            {to.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.branchName ? ` (${w.branchName})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Grid>
      <PartLinesForm action={action} mode="transfer" warehouses={from} warehouseField="fromWarehouseId" extra={{ toWarehouseId: toId, notes }} submitLabel="Posting transfer" />
    </div>
  );
}

export function PurchaseOrderForm({ action, warehouses, suppliers, initialLines }: { action: FormAction; warehouses: Wh[]; suppliers: Opt[]; initialLines?: { part: PartOption; qty: number; unitCost: number }[] }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3">
      <Grid cols={2}>
        <Field label="Supplier" required>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Tanggal PO">
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label="Estimasi datang">
          <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
      </Grid>
      <PartLinesForm action={action} mode="po" warehouses={warehouses} extra={{ supplierId, orderDate, expectedDate: expected || null, notes }} initialLines={initialLines} showTotals submitLabel="Simpan PO (draft)" />
    </div>
  );
}
