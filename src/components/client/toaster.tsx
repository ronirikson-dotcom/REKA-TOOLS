"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };
const EVENT = "wms-toast";

/** Tampilkan notifikasi singkat (tetap terlihat walau form asal sudah tertutup) */
export function toast(message: string, tone: Toast["tone"] = "success") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<{ message: string; tone: Toast["tone"] }>).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-3), { id, message, tone }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.tone === "success" ? "bg-emerald-600" : "bg-red-600"}`}
        >
          {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Tutup">
            <X className="h-4 w-4 opacity-80" />
          </button>
        </div>
      ))}
    </div>
  );
}
