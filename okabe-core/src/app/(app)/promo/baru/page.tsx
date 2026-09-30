import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canManagePos, getSession } from "@/lib/data";
import type { Product } from "@/lib/pos/types";
import { PromoForm } from "../promo-form";

export const metadata: Metadata = { title: "Promo Baru" };

export default async function NewPromoPage() {
  const { supabase, role } = await getSession();
  if (!canManagePos(role)) redirect("/promo");
  const { data } = await supabase.from("products").select("*").eq("is_active", true).order("name");
  const products = (data ?? []) as Product[];
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader title="Promo Baru" />
      <PromoForm products={products} categories={categories} />
    </>
  );
}
