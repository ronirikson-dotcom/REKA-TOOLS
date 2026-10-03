"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn, inputClass } from "@/components/ui";

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export async function lookup<T>(path: string, params: Record<string, string | null | undefined>): Promise<T[]> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const res = await fetch(`/api/lookup/${path}?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: T[] };
  return json.data ?? [];
}

/** Combobox pencarian generik */
export function SearchSelect<T>({
  path,
  params,
  placeholder,
  renderItem,
  onSelect,
  minChars = 1,
  autoFocus,
  className,
}: {
  path: string;
  params?: Record<string, string | null | undefined>;
  placeholder: string;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  minChars?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q);
  const wrap = useRef<HTMLDivElement>(null);
  const paramsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    let cancelled = false;
    if (dq.trim().length < minChars) {
      setItems([]);
      return;
    }
    lookup<T>(path, { ...(params ?? {}), q: dq }).then((r) => {
      if (!cancelled) {
        setItems(r);
        setActive(0);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, path, paramsKey, minChars]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const choose = (it: T) => {
    onSelect(it);
    setQ("");
    setItems([]);
    setOpen(false);
  };
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <input
        className={cn(inputClass, "pl-8")}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && items[active]) {
              e.preventDefault();
              choose(items[active]);
            }
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className={cn("block w-full px-3 py-2 text-left", i === active ? "bg-brand-50" : "hover:bg-slate-50")}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it)}
              >
                {renderItem(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && dq.trim().length >= minChars && items.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 shadow">Tidak ditemukan</div>
      )}
    </div>
  );
}

export type VehicleOption = {
  id: string;
  plateNumber: string;
  vehicleType: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  lastOdometer: number;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
};

/** Pilih kendaraan via nomor polisi / nama customer (quick search URS-VEH-002) */
export function VehiclePicker({ initial, onChange, required }: { initial?: VehicleOption | null; onChange?: (v: VehicleOption | null) => void; required?: boolean }) {
  const [value, setValue] = useState<VehicleOption | null>(initial ?? null);
  const set = (v: VehicleOption | null) => {
    setValue(v);
    onChange?.(v);
  };
  return (
    <div>
      <input type="hidden" name="vehicleId" value={value?.id ?? ""} required={required} />
      <input type="hidden" name="customerId" value={value?.customerId ?? ""} />
      {value ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2">
          <div className="text-sm">
            <div className="font-semibold text-slate-900">{value.plateNumber}</div>
            <div className="text-slate-600">
              {[value.brand, value.model, value.year].filter(Boolean).join(" ") || (value.vehicleType === "car" ? "Mobil" : "Motor")} · Odometer{" "}
              {value.lastOdometer.toLocaleString("id-ID")} km
            </div>
            <div className="text-slate-600">
              {value.customerName}
              {value.customerPhone ? ` · ${value.customerPhone}` : ""}
            </div>
          </div>
          <button type="button" className="rounded p-1 text-slate-500 hover:bg-white" onClick={() => set(null)} aria-label="Ganti kendaraan">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <SearchSelect<VehicleOption>
          path="vehicles"
          placeholder="Ketik nomor polisi / nama customer / no. rangka"
          onSelect={set}
          renderItem={(v) => (
            <div>
              <span className="font-semibold">{v.plateNumber}</span>
              <span className="text-slate-500"> · {[v.brand, v.model].filter(Boolean).join(" ")}</span>
              <div className="text-xs text-slate-500">{v.customerName}</div>
            </div>
          )}
        />
      )}
    </div>
  );
}

export type PartOption = {
  id: string;
  sku: string;
  barcode: string | null;
  partName: string;
  itemType: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  quantity: number;
};

export function PartSearch({ warehouseId, onSelect, placeholder = "Cari part: nama / SKU / scan barcode" }: { warehouseId?: string | null; onSelect: (p: PartOption) => void; placeholder?: string }) {
  return (
    <SearchSelect<PartOption>
      path="parts"
      params={{ warehouseId }}
      placeholder={placeholder}
      onSelect={onSelect}
      renderItem={(p) => (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">{p.partName}</div>
            <div className="text-xs text-slate-500">
              {p.sku}
              {p.barcode ? ` · ${p.barcode}` : ""}
            </div>
          </div>
          {warehouseId && <span className={cn("text-xs font-medium", p.quantity > 0 ? "text-emerald-700" : "text-red-600")}>Stok {p.quantity}</span>}
        </div>
      )}
    />
  );
}
