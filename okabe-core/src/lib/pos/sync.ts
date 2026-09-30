import { createClient } from "@/lib/supabase/client";
import { queueStore } from "./idb";
import type { QueuedSale } from "./types";

export async function listQueue() {
  const all = await queueStore.all<QueuedSale>();
  return all.sort((a, b) => a.sold_at.localeCompare(b.sold_at));
}

export function isNetworkError(message: string | undefined) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /fetch|network|load failed|timeout/i.test(message ?? "");
}

/** Hanya field yang dikirim ke server (tanpa status lokal & data struk). */
function toPayload(s: QueuedSale) {
  return {
    client_uuid: s.client_uuid,
    sold_at: s.sold_at,
    shift_id: s.shift_id,
    customer_id: s.customer_id,
    payment_method: s.payment_method,
    paid_amount: s.paid_amount,
    items: s.items,
    manual_discount: s.manual_discount,
    manual_discount_otp: s.manual_discount_otp,
    client_total: s.client_total,
    offline: s.offline,
    note: s.note,
  };
}

let running: Promise<{ synced: number; failed: number }> | null = null;

/**
 * Kirim transaksi yang tertunda ke server berurutan menurut waktu transaksi.
 * Server idempoten per client_uuid sehingga aman diulang. Berhenti saat jaringan putus;
 * transaksi yang ditolak server (mis. periode ditutup) ditandai error agar ditangani manajer.
 */
export function syncQueue() {
  if (running) return running;
  running = (async () => {
    const supabase = createClient();
    let synced = 0;
    let failed = 0;
    for (const sale of await listQueue()) {
      if (sale.state === "synced") continue;
      const { data, error } = await supabase.rpc("pos_submit_sale", { p_sale: toPayload(sale) });
      if (error) {
        if (isNetworkError(error.message)) break;
        failed++;
        await queueStore.put({ ...sale, state: "error", error: error.message, attempts: sale.attempts + 1 });
        continue;
      }
      synced++;
      await queueStore.put({ ...sale, state: "synced", error: undefined, sale_no: (data as { sale_no: string }).sale_no });
    }
    // Simpan maksimal 30 transaksi tersinkron terakhir untuk cetak ulang struk.
    const done = (await listQueue()).filter((s) => s.state === "synced");
    for (const s of done.slice(0, Math.max(0, done.length - 30))) await queueStore.del(s.client_uuid);
    return { synced, failed };
  })().finally(() => {
    running = null;
  });
  return running;
}
