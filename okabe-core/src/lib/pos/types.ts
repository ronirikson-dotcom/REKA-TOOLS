export type PromoType = "buy_x_get_y" | "bundle" | "happy_hour" | "volume_tier";
export type PaymentMethod = "cash" | "card" | "qris" | "transfer";

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  avg_cost: number;
  stock_qty: number;
  is_active: boolean;
}

export interface PromoRules {
  product_ids?: string[];
  categories?: string[];
  buy_qty?: number;
  free_qty?: number;
  items?: { product_id: string; qty: number }[];
  price?: number;
  days?: number[];
  start?: string;
  end?: string;
  discount_pct?: number;
  tiers?: { min_qty: number; discount_pct: number }[];
}

export interface Promotion {
  id: string;
  name: string;
  type: PromoType;
  rules: PromoRules;
  priority: number;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  tier: string;
  points_balance: number;
  notes: string | null;
}

export interface PricedLine {
  line_no: number;
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  gross: number;
  promo_id: string | null;
  promo_name: string | null;
  promo_discount: number;
  net: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  promo_discount: number;
}

export interface PosSettings {
  store_name: string;
  store_address: string;
  receipt_footer: string;
  points_per_amount: number;
  otp_ttl_minutes: number;
}

export interface Shift {
  id: string;
  shift_no: string;
  cashier_id: string;
  status: "open" | "closed";
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
  expected_cash: number | null;
  actual_cash: number | null;
  variance: number | null;
}

/** Transaksi yang disimpan di perangkat sebelum/selama sinkronisasi. */
export interface QueuedSale {
  client_uuid: string;
  sold_at: string;
  shift_id: string;
  customer_id: string | null;
  customer_name: string | null;
  payment_method: PaymentMethod;
  paid_amount: number;
  items: { product_id: string; qty: number }[];
  manual_discount: number;
  manual_discount_otp: string | null;
  client_total: number;
  offline: boolean;
  note: string | null;
  // status lokal
  state: "pending" | "synced" | "error";
  error?: string;
  attempts: number;
  sale_no?: string;
  receipt: ReceiptData;
}

export interface ReceiptData {
  lines: PricedLine[];
  subtotal: number;
  promo_discount: number;
  manual_discount: number;
  total: number;
  paid_amount: number;
  change: number;
  payment_method: PaymentMethod;
  customer_name: string | null;
  cashier_name: string;
  sold_at: string;
  temp_no: string;
}
