"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Field, Grid, Input, Select, Textarea } from "@/components/ui";
import { SearchSelect } from "./pickers";

type Brand = { id: string; name: string; vehicleType: string; models: { id: string; name: string }[] };
type CustomerOpt = { id: string; name: string; customerCode: string; phone: string | null };

export function VehicleFields({
  brands,
  initial,
  customer,
  lockCustomer,
}: {
  brands: Brand[];
  initial?: Partial<{
    plateNumber: string;
    vehicleType: string;
    brandId: string | null;
    modelId: string | null;
    year: number | null;
    color: string | null;
    chassisNumber: string | null;
    engineNumber: string | null;
    transmission: string | null;
    fuelType: string | null;
    lastOdometer: number;
    notes: string | null;
  }>;
  customer?: CustomerOpt | null;
  lockCustomer?: boolean;
}) {
  const [type, setType] = useState(initial?.vehicleType ?? "car");
  const [brandId, setBrandId] = useState(initial?.brandId ?? "");
  const [cust, setCust] = useState<CustomerOpt | null>(customer ?? null);
  const brandList = brands.filter((b) => b.vehicleType === type);
  const models = brands.find((b) => b.id === brandId)?.models ?? [];
  return (
    <div className="space-y-4">
      {!lockCustomer && (
        <Field label="Pemilik (customer)" required>
          <input type="hidden" name="customerId" value={cust?.id ?? ""} />
          {cust ? (
            <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <span>
                <b>{cust.name}</b> <span className="text-slate-500">· {cust.customerCode}</span>
              </span>
              <button type="button" onClick={() => setCust(null)} className="rounded p-1 hover:bg-white" aria-label="Ganti customer">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <SearchSelect<CustomerOpt>
              path="customers"
              placeholder="Cari customer (nama / HP)"
              onSelect={setCust}
              renderItem={(c) => (
                <span>
                  <b>{c.name}</b> <span className="text-xs text-slate-500">{c.customerCode} · {c.phone ?? "-"}</span>
                </span>
              )}
            />
          )}
        </Field>
      )}
      {lockCustomer && cust && <input type="hidden" name="customerId" value={cust.id} />}
      <Grid cols={3}>
        <Field label="Nomor polisi" required>
          <Input name="plateNumber" defaultValue={initial?.plateNumber} required placeholder="B 1234 ABC" className="uppercase" />
        </Field>
        <Field label="Jenis" required>
          <Select
            name="vehicleType"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setBrandId("");
            }}
          >
            <option value="car">Mobil</option>
            <option value="motorcycle">Motor</option>
          </Select>
        </Field>
        <Field label="Odometer terakhir (km)">
          <Input name="lastOdometer" type="number" min={0} defaultValue={initial?.lastOdometer ?? 0} />
        </Field>
        <Field label="Merk">
          <Select name="brandId" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">- Pilih merk -</option>
            {brandList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model">
          <Select name="modelId" defaultValue={initial?.modelId ?? ""} key={brandId}>
            <option value="">- Pilih model -</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tahun">
          <Input name="year" type="number" min={1950} max={2100} defaultValue={initial?.year ?? ""} />
        </Field>
        <Field label="Warna">
          <Input name="color" defaultValue={initial?.color ?? ""} />
        </Field>
        <Field label="No. rangka (VIN)">
          <Input name="chassisNumber" defaultValue={initial?.chassisNumber ?? ""} className="uppercase" />
        </Field>
        <Field label="No. mesin">
          <Input name="engineNumber" defaultValue={initial?.engineNumber ?? ""} className="uppercase" />
        </Field>
        <Field label="Transmisi">
          <Select name="transmission" defaultValue={initial?.transmission ?? ""}>
            <option value="">-</option>
            <option value="manual">Manual</option>
            <option value="automatic">Automatic / CVT</option>
          </Select>
        </Field>
        <Field label="Bahan bakar">
          <Select name="fuelType" defaultValue={initial?.fuelType ?? ""}>
            <option value="">-</option>
            <option value="bensin">Bensin</option>
            <option value="diesel">Diesel</option>
            <option value="hybrid">Hybrid</option>
            <option value="listrik">Listrik</option>
          </Select>
        </Field>
      </Grid>
      <Field label="Catatan">
        <Textarea name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
    </div>
  );
}
