-- Peran baru untuk Smart POS (dipisah karena nilai enum baru tidak bisa dipakai di transaksi yang sama).
alter type public.app_role add value if not exists 'manager';
alter type public.app_role add value if not exists 'cashier';

-- Nomor WhatsApp untuk pengiriman OTP ke manajer (POS-02).
alter table public.profiles add column if not exists phone text;
