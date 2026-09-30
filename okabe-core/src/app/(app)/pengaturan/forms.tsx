"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

type Action = (s: FormState, f: FormData) => Promise<FormState>;

export function SettingsForm({ action, value }: { action: Action; value: Record<string, string | number> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card grid gap-4 p-5 sm:grid-cols-2">
      <Field name="store_name" label="Nama toko (struk)" value={value.store_name} />
      <Field name="store_address" label="Alamat (struk)" value={value.store_address} />
      <Field name="receipt_footer" label="Catatan kaki struk" value={value.receipt_footer} />
      <Field name="points_per_amount" label="1 poin setiap belanja (Rp)" value={value.points_per_amount} />
      <Field name="otp_ttl_minutes" label="Masa berlaku OTP (menit)" value={value.otp_ttl_minutes} />
      <Result state={state} />
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>Simpan</button></div>
    </form>
  );
}

export function SecretForm({ action, status }: { action: Action; status: Record<string, boolean> | null }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const badge = (on?: boolean) => (
    <span className={`badge ml-2 ${on ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>{on ? "terisi" : "kosong"}</span>
  );
  return (
    <form action={formAction} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div className="sm:col-span-2 text-sm text-slate-600">
        Nilai rahasia disimpan di skema database privat dan tidak pernah ditampilkan kembali. Kosongkan field untuk tidak mengubah; isi
        <code className="mx-1 rounded bg-slate-100 px-1">-</code>untuk menghapus. Tanpa provider, OTP masuk ke menu <b>OTP Manajer</b>.
        {status && !status.pg_net && <p className="mt-1 text-red-600">Ekstensi pg_net belum aktif sehingga WhatsApp/Email tidak dapat dikirim.</p>}
      </div>
      <div>
        <label className="label" htmlFor="wa_api_token">Token WhatsApp API (mis. Fonnte){badge(status?.whatsapp)}</label>
        <input id="wa_api_token" name="wa_api_token" type="password" className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="wa_api_url">URL WhatsApp API{badge(status?.wa_custom_url)}</label>
        <input id="wa_api_url" name="wa_api_url" className="input" placeholder="default: https://api.fonnte.com/send" />
      </div>
      <div>
        <label className="label" htmlFor="resend_api_key">API key Resend (email){badge(status?.email)}</label>
        <input id="resend_api_key" name="resend_api_key" type="password" className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="email_from">Pengirim email{badge(status?.email_from)}</label>
        <input id="email_from" name="email_from" className="input" placeholder="OKABE POS <otp@domainanda.com>" />
      </div>
      <Result state={state} />
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>Simpan provider</button></div>
    </form>
  );
}

function Field({ name, label, value }: { name: string; label: string; value: string | number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={String(value ?? "")} />
    </div>
  );
}

function Result({ state }: { state: FormState }) {
  if (state?.error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>;
  if (state?.ok) return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-2">{state.ok}</p>;
  return null;
}
