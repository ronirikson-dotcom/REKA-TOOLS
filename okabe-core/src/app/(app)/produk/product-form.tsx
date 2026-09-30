"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Product } from "@/lib/pos/types";
import type { FormState } from "./actions";

export function ProductForm({
  product,
  categories,
  action,
  readOnly,
}: {
  product?: Product;
  categories: string[];
  action: (s: FormState, f: FormData) => Promise<FormState>;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card grid gap-4 p-5 sm:grid-cols-3">
      <fieldset disabled={readOnly} className="contents">
        <Field label="SKU" name="sku" defaultValue={product?.sku} required mono />
        <Field label="Barcode" name="barcode" defaultValue={product?.barcode ?? ""} mono />
        <Field label="Satuan" name="unit" defaultValue={product?.unit ?? "pcs"} />
        <div className="sm:col-span-2">
          <Field label="Nama produk" name="name" defaultValue={product?.name} required />
        </div>
        <div>
          <label className="label" htmlFor="category">Kategori</label>
          <input id="category" name="category" list="cats" className="input" defaultValue={product?.category ?? ""} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <Field label="Harga jual (Rp)" name="price" defaultValue={product ? String(Number(product.price)) : ""} required mono />
        <label className="flex items-center gap-2 text-sm sm:col-span-2 sm:mt-6">
          <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} /> Aktif (tampil di kasir)
        </label>
      </fieldset>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-3">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-3">
        {!readOnly && <button className="btn btn-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>}
        <Link href="/produk" className="btn">Kembali</Link>
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue, required, mono }: { label: string; name: string; defaultValue?: string; required?: boolean; mono?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className={`input ${mono ? "font-mono" : ""}`} defaultValue={defaultValue} required={required} />
    </div>
  );
}
