import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { canManagePos, getSession } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import type { Promotion } from "@/lib/pos/types";
import { togglePromo } from "./actions";
import { PROMO_LABEL } from "@/lib/pos/labels";

export const metadata: Metadata = { title: "Promo" };

export default async function PromosPage() {
  const { supabase, role } = await getSession();
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("promotions").select("*").order("priority").order("created_at"),
    supabase.from("products").select("id, name"),
  ]);
  const name = (id: string) => products?.find((p) => p.id === id)?.name ?? "?";
  const manage = canManagePos(role);

  const describe = (p: Promotion) => {
    const r = p.rules;
    const target = [...(r.product_ids ?? []).map(name), ...(r.categories ?? []).map((c) => `kategori ${c}`)].join(", ") || "semua produk";
    switch (p.type) {
      case "buy_x_get_y": return `Beli ${r.buy_qty} gratis ${r.free_qty} · ${target}`;
      case "bundle": return `${(r.items ?? []).map((i) => `${i.qty}× ${name(i.product_id)}`).join(" + ")} = Rp ${r.price?.toLocaleString("id-ID")}`;
      case "happy_hour": return `${r.start}–${r.end} (hari ${(r.days ?? []).join(",")}) diskon ${r.discount_pct}% · ${target}`;
      case "volume_tier": return `${(r.tiers ?? []).map((t) => `≥${t.min_qty}: ${t.discount_pct}%`).join(", ")} · ${target}`;
    }
  };

  return (
    <>
      <PageHeader
        title="Promo Engine"
        subtitle="Aturan promo disimpan sebagai JSON dan dihitung otomatis di kasir (juga saat offline). Satu item hanya mendapat satu promo, diproses berdasarkan prioritas."
        actions={manage && <Link className="btn btn-primary" href="/promo/baru">+ Promo baru</Link>}
      />
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead><tr><th>Prioritas</th><th>Nama</th><th>Tipe</th><th>Aturan</th><th>Periode</th><th>Status</th></tr></thead>
          <tbody>
            {((data ?? []) as Promotion[]).map((p) => (
              <tr key={p.id} className={p.is_active ? "" : "text-slate-400"}>
                <td className="num">{p.priority}</td>
                <td>{manage ? <Link className="link" href={`/promo/${p.id}`}>{p.name}</Link> : p.name}</td>
                <td className="text-xs">{PROMO_LABEL[p.type]}</td>
                <td className="text-xs">{describe(p)}</td>
                <td className="whitespace-nowrap text-xs">{p.starts_on || p.ends_on ? `${p.starts_on ? fmtDate(p.starts_on) : "…"} – ${p.ends_on ? fmtDate(p.ends_on) : "…"}` : "Selalu"}</td>
                <td>
                  {manage ? (
                    <ActionButton action={togglePromo.bind(null, p.id, !p.is_active)} label={p.is_active ? "Aktif ✓" : "Nonaktif"}
                      className={`badge cursor-pointer ${p.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`} />
                  ) : (
                    <span className="badge bg-slate-100">{p.is_active ? "Aktif" : "Nonaktif"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
