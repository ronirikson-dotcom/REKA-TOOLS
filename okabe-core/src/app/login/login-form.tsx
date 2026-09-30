"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signIn, undefined);
  const [upState, upAction, upPending] = useActionState(signUp, undefined);
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <form action={mode === "in" ? inAction : upAction} className="space-y-4">
      {mode === "up" && (
        <div>
          <label className="label" htmlFor="full_name">Nama lengkap</label>
          <input className="input" id="full_name" name="full_name" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
        />
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>}
      <button className="btn btn-primary w-full py-2" disabled={pending}>
        {pending ? "Memproses…" : mode === "in" ? "Masuk" : "Daftar"}
      </button>
      <p className="text-center text-sm text-slate-500">
        {mode === "in" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
        <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Daftar" : "Masuk"}
        </button>
      </p>
    </form>
  );
}
