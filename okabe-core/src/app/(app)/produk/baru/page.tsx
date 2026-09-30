import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canManagePos, canWrite, getSession } from "@/lib/data";
import { ProductForm } from "../product-form";
import { saveProduct } from "../actions";

export const metadata: Metadata = { title: "Produk Baru" };

export default async function NewProductPage() {
  const { supabase, role } = await getSession();
  if (!canManagePos(role) && !canWrite(role)) redirect("/produk");
  const { data } = await supabase.from("products").select("category");
  const cats = [...new Set((data ?? []).map((d) => d.category).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader title="Produk Baru" subtitle="Stok awal diisi lewat menu Terima stok agar tercatat di jurnal." />
      <ProductForm categories={cats} action={saveProduct.bind(null, null)} />
    </>
  );
}
