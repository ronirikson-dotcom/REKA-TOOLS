"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { kv } from "@/lib/pos/idb";
import { listQueue, syncQueue } from "@/lib/pos/sync";
import type { PosSettings, Product, Promotion, QueuedSale, Shift } from "@/lib/pos/types";

export interface Manager {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

export interface Catalog {
  products: Product[];
  promotions: Promotion[];
  settings: PosSettings;
  managers: Manager[];
  fetchedAt: string;
}

const DEFAULT_SETTINGS: PosSettings = {
  store_name: "OKABE Store",
  store_address: "",
  receipt_footer: "Terima kasih",
  points_per_amount: 10000,
  otp_ttl_minutes: 5,
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Katalog produk/promo: ambil dari server bila online, simpan ke IndexedDB, fallback ke cache saat offline. */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [source, setSource] = useState<"server" | "cache" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Tampilkan katalog tersimpan lebih dulu (instan & tetap jalan saat offline), lalu perbarui dari server.
    const cached = await kv.get<Catalog>("catalog");
    if (cached) {
      setCatalog(cached);
      setSource("cache");
    }
    if (!navigator.onLine) {
      if (!cached) setError("Perangkat offline dan katalog belum pernah dimuat");
      return;
    }
    const supabase = createClient();
    try {
      const [p, pr, s, m] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("name"),
        supabase.from("promotions").select("*").eq("is_active", true),
        supabase.from("app_settings").select("value").eq("key", "pos").maybeSingle(),
        supabase.from("profiles").select("id, full_name, email, role").in("role", ["manager", "admin"]),
      ]);
      const err = p.error ?? pr.error ?? s.error ?? m.error;
      if (err) throw new Error(err.message);
      const next: Catalog = {
        products: (p.data ?? []).map((x: Product) => ({ ...x, price: Number(x.price), stock_qty: Number(x.stock_qty), avg_cost: Number(x.avg_cost) })),
        promotions: (pr.data ?? []) as Promotion[],
        settings: { ...DEFAULT_SETTINGS, ...((s.data?.value as Partial<PosSettings>) ?? {}) },
        // Manajer didahulukan sebagai approver OTP default, lalu admin.
        managers: ((m.data ?? []) as Manager[]).sort((a, b) => (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1)),
        fetchedAt: new Date().toISOString(),
      };
      await kv.set("catalog", next);
      setCatalog(next);
      setSource("server");
      setError(null);
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : "Gagal memuat katalog");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronisasi dengan sistem eksternal (server/IndexedDB)
    load();
  }, [load]);

  return { catalog, source, error, reload: load };
}

/** Antrean transaksi lokal + sinkronisasi otomatis tiap 15 detik dan saat kembali online. */
export function useQueue(online: boolean) {
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => setQueue(await listQueue()), []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncQueue();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- memuat antrean dari IndexedDB
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronisasi saat kembali online
    sync();
    const t = setInterval(sync, 15000);
    return () => clearInterval(t);
  }, [online, sync]);

  return { queue, syncing, sync, refresh };
}

/** Shift kasir yang sedang terbuka (disimpan lokal agar tetap bisa bertransaksi saat offline). */
export function useShift(userId: string, online: boolean) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const cached = await kv.get<Shift>(`shift:${userId}`);
    if (!navigator.onLine) {
      setShift(cached ?? null);
      setLoaded(true);
      return;
    }
    const { data, error } = await createClient()
      .from("pos_shifts")
      .select("*")
      .eq("cashier_id", userId)
      .eq("status", "open")
      .maybeSingle();
    if (error) {
      setShift(cached ?? null);
    } else {
      setShift((data as Shift) ?? null);
      if (data) await kv.set(`shift:${userId}`, data);
      else await kv.del(`shift:${userId}`);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- memuat shift dari server/IndexedDB
    reload();
  }, [reload, online]);

  return { shift, loaded, reload };
}
