import type { PricedCart, PricedLine, Product, Promotion, PromoRules } from "./types";

/**
 * Cermin dari fungsi database `pos_price_cart` (supabase/migrations/..._smart_pos.sql).
 * Dipakai agar kasir tetap bisa menghitung promo saat offline. Server tetap menghitung ulang
 * dan menandai `price_mismatch` bila hasilnya berbeda. Ubah keduanya bersamaan.
 *
 * Aturan: satu baris hanya mendapat satu promo; promo diproses berdasarkan prioritas
 * (angka kecil lebih dulu), lalu created_at, lalu id.
 */

/** Pembulatan seperti PostgreSQL round(numeric): setengah menjauhi nol. */
export function pgRound(value: number, digits = 0) {
  const f = 10 ** digits;
  const v = Math.abs(value) * f;
  return (Math.sign(value) * Math.round(v + 1e-9)) / f;
}

function jakartaParts(at: Date) {
  const local = new Date(at.getTime() + 7 * 3600 * 1000);
  const day = local.getUTCDay();
  return {
    date: local.toISOString().slice(0, 10),
    hm: local.toISOString().slice(11, 16),
    isodow: day === 0 ? 7 : day,
  };
}

function applies(r: PromoRules, productId: string, category: string | null) {
  const ids = r.product_ids ?? [];
  const cats = r.categories ?? [];
  if (ids.length === 0 && cats.length === 0) return true;
  return ids.includes(productId) || (category !== null && cats.includes(category));
}

interface WorkLine extends PricedLine {
  category: string | null;
}

export function priceCart(
  items: { product_id: string; qty: number }[],
  products: Map<string, Product>,
  promotions: Promotion[],
  at: Date = new Date(),
): PricedCart {
  if (items.some((i) => !(i.qty > 0))) throw new Error("Qty setiap item harus lebih dari 0");

  // Gabungkan item dengan produk yang sama, urut sesuai kemunculan pertama.
  const order: string[] = [];
  const qty = new Map<string, number>();
  for (const i of items) {
    if (!qty.has(i.product_id)) order.push(i.product_id);
    qty.set(i.product_id, (qty.get(i.product_id) ?? 0) + i.qty);
  }
  const lines: WorkLine[] = order.map((id, idx) => {
    const p = products.get(id);
    if (!p || !p.is_active) throw new Error("Ada produk yang tidak ditemukan atau tidak aktif");
    const q = qty.get(id)!;
    const gross = pgRound(p.price * q, 2);
    return {
      line_no: idx + 1,
      product_id: id,
      name: p.name,
      category: p.category,
      qty: q,
      unit_price: p.price,
      gross,
      promo_id: null,
      promo_name: null,
      promo_discount: 0,
      net: gross,
    };
  });

  const { date, hm, isodow } = jakartaParts(at);
  const active = promotions
    .filter((p) => p.is_active && (!p.starts_on || p.starts_on <= date) && (!p.ends_on || p.ends_on >= date))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const give = (l: WorkLine, pr: Promotion, amount: number) => {
    l.promo_id = pr.id;
    l.promo_name = pr.name;
    l.promo_discount = Math.min(l.gross, amount);
  };

  for (const pr of active) {
    const r = pr.rules;
    const free = lines.filter((l) => l.promo_id === null);

    if (pr.type === "buy_x_get_y") {
      const buy = Number(r.buy_qty);
      const get = Number(r.free_qty);
      if (!(buy > 0 && get > 0)) continue;
      for (const l of free) {
        const sets = Math.floor(l.qty / (buy + get));
        if (sets > 0 && applies(r, l.product_id, l.category)) give(l, pr, pgRound(sets * get * l.unit_price, 2));
      }
    } else if (pr.type === "volume_tier") {
      for (const l of free) {
        if (!applies(r, l.product_id, l.category)) continue;
        const pcts = (r.tiers ?? []).filter((t) => l.qty >= Number(t.min_qty)).map((t) => Number(t.discount_pct));
        const pct = pcts.length ? Math.max(...pcts) : 0;
        if (pct > 0) give(l, pr, pgRound((l.gross * pct) / 100));
      }
    } else if (pr.type === "happy_hour") {
      const days = r.days ?? [1, 2, 3, 4, 5, 6, 7];
      if (!days.map(Number).includes(isodow)) continue;
      if (!(r.start && r.end && hm >= r.start && hm < r.end)) continue;
      const pct = Number(r.discount_pct);
      for (const l of free) {
        if (applies(r, l.product_id, l.category)) give(l, pr, pgRound((l.gross * pct) / 100));
      }
    } else if (pr.type === "bundle") {
      const req = r.items ?? [];
      if (req.length === 0) continue;
      const matched = req.map((x) => ({ x, line: free.find((l) => l.product_id === x.product_id) }));
      if (!matched.every((m) => m.line && m.line.qty >= Number(m.x.qty))) continue;
      const n = Math.min(...matched.map((m) => Math.floor(m.line!.qty / Number(m.x.qty))));
      if (n < 1) continue;
      const normal = matched.reduce((s, m) => s + m.line!.unit_price * Number(m.x.qty), 0);
      const disc = pgRound(n * (normal - Number(r.price)));
      if (disc <= 0) continue;
      const parts = [...matched].sort((a, b) => a.line!.line_no - b.line!.line_no);
      let given = 0;
      parts.forEach((m, i) => {
        const alloc =
          i === parts.length - 1 ? disc - given : pgRound((disc * m.line!.unit_price * Number(m.x.qty)) / normal);
        given += alloc;
        give(m.line!, pr, alloc);
      });
    }
  }

  const out: PricedLine[] = lines.map((l) => ({
    line_no: l.line_no,
    product_id: l.product_id,
    name: l.name,
    qty: l.qty,
    unit_price: l.unit_price,
    gross: l.gross,
    promo_id: l.promo_id,
    promo_name: l.promo_name,
    promo_discount: l.promo_discount,
    net: pgRound(l.gross - l.promo_discount, 2),
  }));
  return {
    lines: out,
    subtotal: pgRound(out.reduce((s, l) => s + l.gross, 0), 2),
    promo_discount: pgRound(out.reduce((s, l) => s + l.promo_discount, 0), 2),
  };
}
