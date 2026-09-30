import { execFileSync } from "node:child_process";
import { priceCart } from "../src/lib/pos/pricing.ts";
// Uji kesetaraan mesin promo TypeScript (offline) dengan fungsi database pos_price_cart.
// Jalankan terhadap database uji yang sudah berisi migrasi + seed:
//   DATABASE_URL=postgres://... node --experimental-strip-types scripts/pricing-parity.mts
const psql = (sql: string) =>
  execFileSync("psql", [process.env.DATABASE_URL ?? "", "-Atq", "-c", sql], { maxBuffer: 1 << 26 }).toString().trim();
const products = JSON.parse(psql("select json_agg(p) from products p"));
const promos = JSON.parse(psql("select json_agg(p) from promotions p"));
const pmap = new Map(products.map((p: any) => [p.id, { ...p, price: Number(p.price) }]));
const ids = [...pmap.keys()];
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const cases: any[] = [];
for (let i = 0; i < 400; i++) {
  const n = 1 + Math.floor(rnd() * 5);
  const items = Array.from({ length: n }, () => ({ product_id: ids[Math.floor(rnd() * ids.length)], qty: 1 + Math.floor(rnd() * (rnd() < 0.2 ? 30 : 4)) }));
  const day = 21 + Math.floor(rnd() * 10); const hour = 8 + Math.floor(rnd() * 13); const min = Math.floor(rnd() * 60);
  const at = `2026-09-${day}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+07:00`;
  cases.push({ items, at });
}
const sql = `select json_agg(pos_price_cart(c->'items', (c->>'at')::timestamptz) order by ord) from json_array_elements('${JSON.stringify(cases)}'::json) with ordinality x(c, ord)`.replace(/json_array_elements\('(.*)'::json\)/, (_m, j) => `jsonb_array_elements('${j}'::jsonb)`);
const server = JSON.parse(psql(sql));
let mismatch = 0, promoHits = new Map<string, number>();
cases.forEach((c, i) => {
  const client = priceCart(c.items, pmap as any, promos.map((p: any) => ({ ...p })), new Date(c.at));
  const s = server[i];
  const same = Number(s.subtotal) === client.subtotal && Number(s.promo_discount) === client.promo_discount &&
    s.lines.every((l: any, k: number) => Number(l.promo_discount) === client.lines[k].promo_discount && (l.promo_id ?? null) === client.lines[k].promo_id);
  client.lines.forEach((l) => l.promo_name && promoHits.set(l.promo_name, (promoHits.get(l.promo_name) ?? 0) + 1));
  if (!same) { mismatch++; if (mismatch < 4) console.log("MISMATCH", c.at, JSON.stringify(s), JSON.stringify(client)); }
});
console.log(`kasus: ${cases.length}, selisih: ${mismatch}`);
console.log("promo terpakai:", Object.fromEntries(promoHits));
if (mismatch > 0) process.exit(1);
