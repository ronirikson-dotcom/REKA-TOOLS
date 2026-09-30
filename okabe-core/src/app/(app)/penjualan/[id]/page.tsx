import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { canSell, getSession } from "@/lib/data";
import { METHOD_LABEL, fmtDateTime, money } from "@/lib/format";
import { SaleActions } from "./sale-actions";

export const metadata: Metadata = { title: "Detail Penjualan" };

interface Item {
  id: string;
  line_no: number;
  product_name: string;
  qty: number;
  unit_price: number;
  gross: number;
  promo_name: string | null;
  promo_discount: number;
  net: number;
  unit_cost: number;
  returned_qty: number;
}

export default async function SaleDetailPage({ params }: PageProps<"/penjualan/[id]">) {
  const { id } = await params;
  const { supabase, role } = await getSession();
  const { data: sale } = await supabase
    .from("pos_sales")
    .select("*, customers(id, name, phone), pos_sale_items(*), pos_shifts(shift_no)")
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();

  const [{ data: returns }, { data: people }, { data: journals }] = await Promise.all([
    supabase.from("pos_returns").select("*, pos_return_items(qty, refund_amount, sale_item_id)").eq("sale_id", id).order("created_at"),
    supabase.from("profiles").select("id, full_name, email, role"),
    supabase.from("journal_entries").select("id, entry_no").in("id", [sale.journal_entry_id, sale.void_journal_id].filter(Boolean)),
  ]);
  const who = (uid: string | null) => {
    const p = people?.find((x) => x.id === uid);
    return p?.full_name ?? p?.email ?? "-";
  };
  const jno = (jid: string | null) => journals?.find((j) => j.id === jid)?.entry_no;
  const items = ([...(sale.pos_sale_items as Item[])]).sort((a, b) => a.line_no - b.line_no);
  const approvers = (people ?? [])
    .filter((p) => p.role === "manager" || p.role === "admin")
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1));
  const margin = Number(sale.total) - Number(sale.cogs_total);

  return (
    <>
      <PageHeader
        title={sale.sale_no}
        subtitle={`${fmtDateTime(sale.sold_at)} · kasir ${who(sale.cashier_id)} · ${sale.pos_shifts?.shift_no ?? ""}`}
        actions={<Link href="/penjualan" className="btn">← Penjualan</Link>}
      />

      {sale.status === "voided" && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Dibatalkan (void) oleh {who(sale.voided_by)} pada {fmtDateTime(sale.voided_at)}: {sale.void_reason}.{" "}
          {sale.void_journal_id && <Link className="link" href={`/jurnal/${sale.void_journal_id}`}>Jurnal pembalik {jno(sale.void_journal_id)}</Link>}
        </p>
      )}
      {sale.price_mismatch && (
        <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Total di perangkat kasir (Rp {money(sale.client_total)}) berbeda dengan hitungan server (Rp {money(sale.total)}). Server yang dipakai.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="tbl">
            <thead>
              <tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Harga</th><th className="text-right">Diskon</th><th className="text-right">Neto</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.product_name}
                    {i.promo_name && <div className="text-xs text-green-700">🏷 {i.promo_name}</div>}
                    {Number(i.returned_qty) > 0 && <div className="text-xs text-amber-700">Diretur {Number(i.returned_qty)}</div>}
                  </td>
                  <td className="num">{Number(i.qty)}</td>
                  <td className="num">{money(i.unit_price)}</td>
                  <td className="num">{money(i.promo_discount, { blankZero: true })}</td>
                  <td className="num">{money(i.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <Row label="Subtotal" value={money(sale.subtotal)} />
          <Row label="Diskon promo" value={`−${money(sale.promo_discount)}`} />
          <Row label="Diskon manual (OTP)" value={`−${money(sale.manual_discount)}`} />
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
            <span>Total</span><span className="font-mono">{money(sale.total)}</span>
          </div>
          <Row label={`Dibayar (${METHOD_LABEL[sale.payment_method]})`} value={money(sale.paid_amount)} />
          <Row label="Kembalian" value={money(sale.change_amount)} />
          <div className="pt-2" />
          <Row label="HPP" value={money(sale.cogs_total)} />
          <Row label="Margin kotor" value={money(margin)} />
          <Row label="Pelanggan" value={sale.customers ? `${sale.customers.name}` : "-"} />
          <Row label="Poin didapat" value={String(sale.points_earned)} />
          <Row label="Mode" value={sale.offline ? "Offline → tersinkron " + fmtDateTime(sale.synced_at) : "Online"} />
          <div className="pt-2">
            {sale.journal_entry_id && (
              <Link className="link" href={`/jurnal/${sale.journal_entry_id}`}>Lihat jurnal otomatis {jno(sale.journal_entry_id)} →</Link>
            )}
          </div>
        </div>
      </div>

      {(returns ?? []).length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <div className="border-b border-slate-200 px-4 py-2 font-semibold">Retur</div>
          <table className="tbl">
            <thead><tr><th>No retur</th><th>Waktu</th><th>Oleh</th><th>Alasan</th><th>Refund</th><th className="text-right">Nilai</th><th /></tr></thead>
            <tbody>
              {(returns ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="font-mono">{r.return_no}</td>
                  <td className="text-xs">{fmtDateTime(r.created_at)}</td>
                  <td className="text-xs">{who(r.created_by)}</td>
                  <td className="text-xs">{r.reason}</td>
                  <td className="text-xs">{METHOD_LABEL[r.refund_method]}</td>
                  <td className="num">{money(r.refund_amount)}</td>
                  <td>{r.journal_entry_id && <Link className="link text-xs" href={`/jurnal/${r.journal_entry_id}`}>Jurnal</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canSell(role) && sale.status === "completed" && (
        <SaleActions
          saleId={sale.id}
          saleNo={sale.sale_no}
          total={Number(sale.total)}
          method={sale.payment_method}
          hasReturns={(returns ?? []).length > 0}
          approvers={approvers}
          items={items.map((i) => ({ id: i.id, name: i.product_name, qty: Number(i.qty), returned: Number(i.returned_qty) }))}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono">{value}</span>
    </div>
  );
}
