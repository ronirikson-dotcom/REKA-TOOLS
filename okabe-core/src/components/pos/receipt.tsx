import { money } from "@/lib/format";
import type { PosSettings, ReceiptData } from "@/lib/pos/types";

export const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  card: "Kartu Debit/Kredit",
  qris: "QRIS",
  transfer: "Transfer",
};

/** Struk 80mm. Elemen dengan kelas print-area yang dicetak saat window.print(). */
export function Receipt({
  data,
  settings,
  saleNo,
  pending,
}: {
  data: ReceiptData;
  settings: PosSettings;
  saleNo?: string;
  pending?: boolean;
}) {
  const at = new Date(data.sold_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
  return (
    <div className="print-area mx-auto w-full max-w-[300px] font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <div className="text-sm font-bold">{settings.store_name}</div>
        {settings.store_address && <div>{settings.store_address}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>No</span><span>{saleNo ?? data.temp_no}</span></div>
      <div className="flex justify-between"><span>Waktu</span><span>{at}</span></div>
      <div className="flex justify-between"><span>Kasir</span><span>{data.cashier_name}</span></div>
      {data.customer_name && <div className="flex justify-between"><span>Pelanggan</span><span>{data.customer_name}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      {data.lines.map((l) => (
        <div key={l.line_no} className="mb-1">
          <div>{l.name}</div>
          <div className="flex justify-between">
            <span>{l.qty} × {money(l.unit_price)}</span>
            <span>{money(l.gross)}</span>
          </div>
          {l.promo_discount > 0 && (
            <div className="flex justify-between">
              <span className="truncate pr-2">  {l.promo_name}</span>
              <span>-{money(l.promo_discount)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Row label="Subtotal" value={data.subtotal} />
      {data.promo_discount > 0 && <Row label="Diskon promo" value={-data.promo_discount} />}
      {data.manual_discount > 0 && <Row label="Diskon manual" value={-data.manual_discount} />}
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{money(data.total)}</span></div>
      <Row label={METHOD_LABEL[data.payment_method]} value={data.paid_amount} />
      {data.change > 0 && <Row label="Kembali" value={data.change} />}
      <div className="my-2 border-t border-dashed border-black" />
      {pending && <div className="text-center">* Transaksi offline — menunggu sinkronisasi *</div>}
      <div className="text-center">{settings.receipt_footer}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value < 0 ? `-${money(-value)}` : money(value)}</span>
    </div>
  );
}
