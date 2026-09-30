"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  channel: string;
  destination: string | null;
  subject: string | null;
  body: string;
  status: string;
  provider_response: string | null;
  created_at: string;
}

const STATUS: Record<string, string> = {
  delivered: "Di kotak OTP",
  queued: "Mengirim…",
  sent: "Terkirim",
  failed: "Gagal kirim",
};

export function OtpInbox() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return setError(error.message);
    setItems((data ?? []) as Notification[]);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling kotak OTP
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">Belum ada permintaan OTP.</div>}
      {items.map((n) => {
        const code = n.body.match(/OTP (\d{6})/)?.[1];
        const ageMin = (now - new Date(n.created_at).getTime()) / 60000;
        const fresh = ageMin < 5;
        return (
          <div key={n.id} className={`card flex flex-wrap items-center gap-4 p-4 ${fresh ? "border-brand-500" : "opacity-70"}`}>
            <div className={`rounded-xl px-4 py-2 font-mono text-3xl font-bold tracking-widest ${fresh ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400 line-through"}`}>
              {code ?? "——"}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">{n.subject}</div>
              <div className="text-slate-600">{n.body.replace(/Kode OTP \d{6} /, "")}</div>
              <div className="mt-1 text-xs text-slate-400">
                {new Date(n.created_at).toLocaleString("id-ID")} · {n.channel} · {STATUS[n.status] ?? n.status}
                {n.status === "failed" && n.provider_response && ` (${n.provider_response})`}
                {!fresh && " · kedaluwarsa"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
