"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";
import { ActionFooter, Button, Card, Checkbox, Field, Grid, Input, Textarea } from "@/components/ui";

type CompanyValues = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  taxRate: number;
  settings: {
    reminderCarDays: number;
    reminderCarKm: number;
    reminderMotorDays: number;
    reminderMotorKm: number;
    estimateValidDays: number;
    sequencePadding: number;
    numbering: Record<string, string>;
  };
};

export function CompanyForm({ action, company, docTypes }: { action: FormAction; company: CompanyValues; docTypes: Record<string, string> }) {
  const [v, setV] = useState({
    name: company.name,
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    taxId: company.taxId ?? "",
    taxRate: company.taxRate,
    ...company.settings,
  });
  const [numbering, setNumbering] = useState<Record<string, string>>({ ...company.settings.numbering });
  const set = (k: string, val: string | number) => setV((x) => ({ ...x, [k]: val }));
  const sample = (k: string) => `${numbering[k] || k}-JKT-261002-${"1".padStart(v.sequencePadding, "0")}`;
  return (
    <ActionForm action={action}>
      <input type="hidden" name="payload" value={JSON.stringify({ ...v, numbering })} />
      <div className="space-y-4">
        <Card title="Profil perusahaan">
          <Grid cols={2}>
            <Field label="Nama perusahaan" required>
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="NPWP">
              <Input value={v.taxId} onChange={(e) => set("taxId", e.target.value)} />
            </Field>
            <Field label="Telepon">
              <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={v.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </Grid>
          <Field label="Alamat" className="mt-4">
            <Textarea value={v.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </Card>
        <Card title="Pajak & estimate">
          <Grid cols={3}>
            <Field label="Tarif PPN (%)" hint="Diterapkan pada estimate & invoice baru">
              <Input type="number" step="0.01" min={0} max={100} value={v.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
            </Field>
            <Field label="Masa berlaku estimate (hari)">
              <Input type="number" min={1} value={v.estimateValidDays} onChange={(e) => set("estimateValidDays", Number(e.target.value))} />
            </Field>
          </Grid>
        </Card>
        <Card title="Interval service reminder default">
          <Grid cols={4}>
            <Field label="Mobil (hari)">
              <Input type="number" min={1} value={v.reminderCarDays} onChange={(e) => set("reminderCarDays", Number(e.target.value))} />
            </Field>
            <Field label="Mobil (km)">
              <Input type="number" min={1} value={v.reminderCarKm} onChange={(e) => set("reminderCarKm", Number(e.target.value))} />
            </Field>
            <Field label="Motor (hari)">
              <Input type="number" min={1} value={v.reminderMotorDays} onChange={(e) => set("reminderMotorDays", Number(e.target.value))} />
            </Field>
            <Field label="Motor (km)">
              <Input type="number" min={1} value={v.reminderMotorKm} onChange={(e) => set("reminderMotorKm", Number(e.target.value))} />
            </Field>
          </Grid>
        </Card>
        <Card title="Penomoran transaksi" actions={<span className="text-xs text-slate-500">Format: PREFIX-KODECABANG-YYMMDD-SEQ</span>}>
          <Field label="Jumlah digit sequence" className="mb-4 max-w-40">
            <Input type="number" min={2} max={6} value={v.sequencePadding} onChange={(e) => set("sequencePadding", Number(e.target.value))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(docTypes).map(([k, label]) => (
              <Field key={k} label={label} hint={k === "CUS" ? `${numbering[k] || k}-000001` : sample(k)}>
                <Input value={numbering[k] ?? ""} onChange={(e) => setNumbering((x) => ({ ...x, [k]: e.target.value.toUpperCase() }))} maxLength={8} />
              </Field>
            ))}
          </div>
          <ActionFooter>
            <SubmitButton>Simpan pengaturan</SubmitButton>
          </ActionFooter>
        </Card>
      </div>
    </ActionForm>
  );
}

type Perm = { code: string; module: string; description: string };

export function RoleForm({ action, role, catalog, moduleLabels }: { action: FormAction; role?: { id: string; name: string; description: string | null; permissionCodes: string[] }; catalog: Perm[]; moduleLabels: Record<string, string> }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissionCodes ?? []));
  const modules = [...new Set(catalog.map((c) => c.module))];
  const toggle = (code: string, on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });
  return (
    <ActionForm action={action}>
      {role && <input type="hidden" name="id" value={role.id} />}
      <input type="hidden" name="payload" value={JSON.stringify({ name, description, permissions: [...perms] })} />
      <Card className="mb-4">
        <Grid cols={2}>
          <Field label="Nama role" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Deskripsi / tanggung jawab">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </Grid>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const items = catalog.filter((c) => c.module === m);
          const all = items.every((i) => perms.has(i.code));
          return (
            <Card key={m} title={moduleLabels[m] ?? m} actions={<Checkbox label="Semua" checked={all} onChange={(e) => items.forEach((i) => toggle(i.code, e.target.checked))} />}>
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.code}>
                    <Checkbox
                      label={
                        <span>
                          {i.description} <code className="text-[10px] text-slate-400">{i.code}</code>
                        </span>
                      }
                      checked={perms.has(i.code)}
                      onChange={(e) => toggle(i.code, e.target.checked)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <ActionFooter>
        <span className="mr-auto text-sm text-slate-500">{perms.size} permission dipilih</span>
        <SubmitButton>Simpan role</SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}

export function TemplateItemsForm({ action, templateId, items }: { action: FormAction; templateId: string; items: { category: string; itemName: string }[] }) {
  const [rows, setRows] = useState(items.map((i) => ({ ...i, key: Math.random().toString(36) })));
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={templateId} />
      <input type="hidden" name="payload" value={JSON.stringify({ items: rows.map(({ category, itemName }) => ({ category, itemName })) })} />
      <ul className="space-y-2">
        {rows.map((r, idx) => (
          <li key={r.key} className="flex gap-2">
            <Input value={r.category} onChange={(e) => setRows((x) => x.map((y, i) => (i === idx ? { ...y, category: e.target.value } : y)))} className="w-40" placeholder="Kategori" />
            <Input value={r.itemName} onChange={(e) => setRows((x) => x.map((y, i) => (i === idx ? { ...y, itemName: e.target.value } : y)))} placeholder="Item pemeriksaan" />
            <button type="button" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setRows((x) => x.filter((_, i) => i !== idx))} aria-label="Hapus">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" className="mt-2" onClick={() => setRows((x) => [...x, { category: x[x.length - 1]?.category ?? "Umum", itemName: "", key: Math.random().toString(36) }])}>
        <Plus className="h-3.5 w-3.5" /> Tambah item
      </Button>
      <ActionFooter>
        <SubmitButton>Simpan template</SubmitButton>
      </ActionFooter>
    </ActionForm>
  );
}
