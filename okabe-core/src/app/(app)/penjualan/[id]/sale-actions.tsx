"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/pos/modal";
import { OtpDialog, type Approver } from "@/components/pos/otp-dialog";
import { METHOD_LABEL, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

interface Props {
  saleId: string;
  saleNo: string;
  total: number;
  method: string;
  hasReturns: boolean;
  approvers: Approver[];
  items: { id: string; name: string; qty: number; returned: number }[];
}

/** Void & retur dengan otorisasi OTP manajer (POS-02). */
export function SaleActions({ saleId, saleNo, total, method, hasReturns, approvers, items }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "void" | "return" | "otp">(null);
  const [kind, setKind] = useState<"void" | "return">("void");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [refund, setRefund] = useState(method);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const returnItems = Object.entries(qty).filter(([, q]) => q > 0).map(([sale_item_id, q]) => ({ sale_item_id, qty: q }));

  const execute = async (otpId: string) => {
    setMode(null);
    setError(null);
    const supabase = createClient();
    const res =
      kind === "void"
        ? await supabase.rpc("pos_void_sale", { p_sale_id: saleId, p_otp_id: otpId, p_reason: reason })
        : await supabase.rpc("pos_return_sale", {
            p_sale_id: saleId, p_items: returnItems, p_otp_id: otpId, p_reason: reason, p_refund_method: refund,
          });
    if (res.error) return setError(res.error.message);
    setDone(kind === "void" ? `Transaksi dibatalkan. Jurnal pembalik ${res.data.journal_no}.` : `Retur ${res.data.return_no} berhasil, refund Rp ${money(res.data.refund_amount)}.`);
    router.refresh();
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {!hasReturns && <button className="btn btn-danger" onClick={() => { setKind("void"); setMode("void"); }}>Void transaksi</button>}
      {items.some((i) => i.qty > i.returned) && (
        <button className="btn" onClick={() => { setKind("return"); setMode("return"); }}>Retur barang</button>
      )}
      <span className="text-xs text-slate-500">Void dan retur membutuhkan OTP dari manajer.</span>
      {error && <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="w-full rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>}

      {mode === "void" && (
        <Modal title={`Void ${saleNo}`} onClose={() => setMode(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Seluruh transaksi Rp {money(total)} dibatalkan: jurnal dibalik otomatis, stok dan poin dikembalikan.
            </p>
            <input className="input" placeholder="Alasan pembatalan (wajib)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <button className="btn btn-danger w-full py-2" disabled={!reason.trim()} onClick={() => setMode("otp")}>Lanjut minta OTP</button>
          </div>
        </Modal>
      )}

      {mode === "return" && (
        <Modal title={`Retur ${saleNo}`} onClose={() => setMode(null)}>
          <div className="space-y-3">
            {items.map((i) => {
              const max = i.qty - i.returned;
              return (
                <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{i.name} <span className="text-xs text-slate-400">(maks {max})</span></span>
                  <input
                    className="input w-20 text-right"
                    inputMode="numeric"
                    disabled={max <= 0}
                    value={qty[i.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [i.id]: Math.min(max, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                    placeholder="0"
                  />
                </div>
              );
            })}
            <div>
              <label className="label" htmlFor="refund">Metode refund</label>
              <select id="refund" className="input" value={refund} onChange={(e) => setRefund(e.target.value)}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <input className="input" placeholder="Alasan retur (wajib)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-primary w-full py-2" disabled={!reason.trim() || returnItems.length === 0} onClick={() => setMode("otp")}>
              Lanjut minta OTP
            </button>
          </div>
        </Modal>
      )}

      {mode === "otp" && (
        <OtpDialog
          action={kind}
          title={kind === "void" ? `Persetujuan void ${saleNo}` : `Persetujuan retur ${saleNo}`}
          context={{ ref: saleId, summary: `${saleNo} Rp ${money(total)}: ${reason}` }}
          approvers={approvers}
          onClose={() => setMode(null)}
          onApproved={execute}
        />
      )}
    </div>
  );
}
