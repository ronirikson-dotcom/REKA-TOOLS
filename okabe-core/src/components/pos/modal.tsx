"use client";

import { useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4 print:static print:bg-transparent print:p-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl print:max-h-none print:shadow-none ${
          wide ? "sm:max-w-3xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 print:hidden">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn btn-ghost px-2" onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className="p-5 print:p-0">{children}</div>
      </div>
    </div>
  );
}
