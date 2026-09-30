"use client";

import { useState, useTransition } from "react";

export type ActionResult = { error?: string } | void;

interface Props {
  action: (input?: string) => Promise<ActionResult>;
  label: string;
  confirm?: string;
  /** Jika diisi, pengguna diminta mengetik alasan sebelum aksi dijalankan. */
  prompt?: string;
  className?: string;
}

export function ActionButton({ action, label, confirm, prompt, className = "btn" }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    let input: string | undefined;
    if (prompt) {
      const answer = window.prompt(prompt);
      if (answer === null) return;
      if (!answer.trim()) {
        setError("Alasan wajib diisi.");
        return;
      }
      input = answer.trim();
    } else if (confirm && !window.confirm(confirm)) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await action(input);
      if (res && res.error) setError(res.error);
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={run} disabled={pending}>
        {pending ? "Memproses…" : label}
      </button>
      {error && <span className="max-w-xs text-xs text-red-600">{error}</span>}
    </span>
  );
}
