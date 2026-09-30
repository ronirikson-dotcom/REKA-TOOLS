import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { canManagePos, getSession } from "@/lib/data";
import type { Product, Promotion } from "@/lib/pos/types";
import { deletePromo } from "../actions";
import { PromoForm } from "../promo-form";

export const metadata: Metadata = { title: "Ubah Promo" };

export default async function EditPromoPage({ params }: PageProps<"/promo/[id]">) {
  const { id } = await params;
  const { supabase, role } = await getSession();
  if (!canManagePos(role)) redirect("/promo");
  const [{ data: promo }, { data }] = await Promise.all([
    supabase.from("promotions").select("*").eq("id", id).maybeSingle(),
    supabase.from("products").select("*").order("name"),
  ]);
  if (!promo) notFound();
  const products = (data ?? []) as Product[];
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader
        title={promo.name}
        actions={<ActionButton action={deletePromo.bind(null, id)} label="Hapus promo" className="btn btn-danger" confirm="Hapus promo ini?" />}
      />
      <PromoForm promo={promo as Promotion} products={products} categories={categories} />
    </>
  );
}
