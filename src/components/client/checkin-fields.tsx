"use client";

import { useState } from "react";
import { Alert, Field, Grid, Input, Select, Textarea } from "@/components/ui";
import { VehiclePicker, type VehicleOption } from "./pickers";

export function CheckinFields({ initial, canOverride }: { initial: VehicleOption | null; canOverride: boolean }) {
  const [vehicle, setVehicle] = useState<VehicleOption | null>(initial);
  const [odo, setOdo] = useState<string>(initial ? String(initial.lastOdometer) : "");
  const lower = vehicle && odo !== "" && Number(odo) < vehicle.lastOdometer;
  return (
    <div className="space-y-4">
      <Field label="Kendaraan & customer" required>
        <VehiclePicker initial={initial} onChange={(v) => { setVehicle(v); if (v) setOdo(String(v.lastOdometer)); }} required />
      </Field>
      <Grid cols={3}>
        <Field label="Odometer (km)" required hint={vehicle ? `Histori terakhir: ${vehicle.lastOdometer.toLocaleString("id-ID")} km` : undefined}>
          <Input type="number" name="odometer" min={0} value={odo} onChange={(e) => setOdo(e.target.value)} required />
        </Field>
        <Field label="Fuel level" required>
          <Select name="fuelLevel" defaultValue="50">
            <option value="0">E (Kosong)</option>
            <option value="25">1/4</option>
            <option value="50">1/2</option>
            <option value="75">3/4</option>
            <option value="100">F (Penuh)</option>
          </Select>
        </Field>
        <Field label="Foto kendaraan" hint="JPG/PNG maks. 5MB per file">
          <Input type="file" name="photos" accept="image/*" capture="environment" multiple />
        </Field>
      </Grid>
      {lower && (
        <Alert tone={canOverride ? "amber" : "red"} title="Odometer lebih kecil dari histori (BR-015)">
          {canOverride ? (
            <Field label="Alasan override odometer" required className="mt-2">
              <Input name="odometerOverrideReason" required minLength={3} placeholder="mis. panel odometer diganti" />
            </Field>
          ) : (
            "Anda tidak memiliki otorisasi override. Minta Branch Manager melakukan check-in atau periksa kembali angka odometer."
          )}
        </Alert>
      )}
      <Field label="Keluhan customer" required>
        <Textarea name="complaint" required />
      </Field>
      <Grid cols={2}>
        <Field label="Kondisi kendaraan" hint="Baret, penyok, lampu, dll.">
          <Textarea name="conditionNotes" />
        </Field>
        <Field label="Barang yang ditinggalkan">
          <Textarea name="belongings" placeholder="STNK, payung, dashcam..." />
        </Field>
      </Grid>
    </div>
  );
}
