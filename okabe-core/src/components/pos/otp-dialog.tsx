"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "./modal";

export interface Approver {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  action: "void" | "manual_discount" | "return";
  title: string;
  /** Wajib memuat `ref` (id transaksi atau client_uuid keranjang). */
  context: Record<string, unknown>;
  approvers: Approver[];
  onApproved: (otpId: string) => void;
  onClose: () => void;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  inbox: "Kotak OTP aplikasi (menu OTP Manajer)",
};

/** Otorisasi manajer via OTP (POS-02) — menggantikan PIN statis. */
export function OtpDialog({ action, title, context, approvers, onApproved, onClose }: Props) {
  const [approver, setApprover] = useState(approvers[0]?.id ?? "");
  const [otp, setOtp] = useState<{ otp_id: string; channel: string; destination: string; approver: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("request_otp", {
      p_action: action,
      p_approver: approver,
      p_context: context,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setOtp(data);
    setCode("");
  };

  const verify = async () => {
    if (!otp) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("verify_otp", { p_otp_id: otp.otp_id, p_code: code.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    if (!data?.ok) return setError(data?.error ?? "Kode OTP salah");
    onApproved(otp.otp_id);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {!otp ? (
          <>
            <p className="text-sm text-slate-600">
              Aksi ini membutuhkan persetujuan manajer. Kode OTP akan dikirim ke manajer yang dipilih.
            </p>
            <div>
              <label className="label" htmlFor="approver">Manajer yang menyetujui</label>
              <select id="approver" className="input" value={approver} onChange={(e) => setApprover(e.target.value)}>
                {approvers.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name ?? a.email}</option>
                ))}
              </select>
              {approvers.length === 0 && <p className="mt-1 text-xs text-red-600">Belum ada pengguna berperan Manajer.</p>}
            </div>
            <button className="btn btn-primary w-full py-2" disabled={busy || !approver} onClick={request}>
              {busy ? "Mengirim…" : "Kirim OTP ke manajer"}
            </button>
          </>
        ) : (
          <>
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              OTP dikirim ke <b>{otp.approver}</b> via {CHANNEL_LABEL[otp.channel] ?? otp.channel}
              {otp.channel !== "inbox" && <> ({otp.destination})</>}. Minta manajer menyebutkan kodenya.
            </p>
            <div>
              <label className="label" htmlFor="otp-code">Kode OTP (6 digit)</label>
              <input
                id="otp-code"
                className="input text-center font-mono text-2xl tracking-[0.5em]"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={busy} onClick={request}>Kirim ulang</button>
              <button className="btn btn-primary flex-1" disabled={busy || code.length !== 6} onClick={verify}>
                {busy ? "Memeriksa…" : "Verifikasi"}
              </button>
            </div>
          </>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
