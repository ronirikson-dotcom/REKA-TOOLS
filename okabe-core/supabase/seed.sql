-- OKABE CORE — data awal: Chart of Accounts standar + contoh transaksi demo.
-- Dijalankan sebagai owner database (bukan melalui API).

-- ---------------------------------------------------------------------------
-- Chart of Accounts
-- ---------------------------------------------------------------------------
insert into public.accounts (code, name, type, is_postable) values
  ('1000', 'ASET', 'asset', false),
  ('2000', 'KEWAJIBAN', 'liability', false),
  ('3000', 'EKUITAS', 'equity', false),
  ('4000', 'PENDAPATAN', 'revenue', false),
  ('5000', 'HARGA POKOK PENJUALAN', 'expense', false),
  ('6000', 'BEBAN OPERASIONAL', 'expense', false);

insert into public.accounts (code, name, type, is_postable, parent_id)
select v.code, v.name, v.type::public.account_type, false, p.id
from (values
  ('1100', 'Aset Lancar', 'asset', '1000'),
  ('1200', 'Aset Tetap', 'asset', '1000'),
  ('2100', 'Kewajiban Jangka Pendek', 'liability', '2000'),
  ('2200', 'Kewajiban Jangka Panjang', 'liability', '2000')
) as v(code, name, type, parent)
join public.accounts p on p.code = v.parent;

insert into public.accounts (code, name, type, parent_id, is_cash, cash_flow_category, description)
select v.code, v.name, v.type::public.account_type, p.id, v.is_cash, v.cf::public.cash_flow_category, v.descr
from (values
  ('1110', 'Kas', 'asset', '1100', true, 'operating', null),
  ('1120', 'Bank', 'asset', '1100', true, 'operating', null),
  ('1130', 'Piutang Usaha', 'asset', '1100', false, 'operating', 'Sales Invoice (Debit)'),
  ('1140', 'Persediaan Barang Dagang', 'asset', '1100', false, 'operating', 'Receive Item (Debit), Delivery Order & POS (Kredit)'),
  ('1150', 'Uang Muka & Biaya Dibayar di Muka', 'asset', '1100', false, 'operating', null),
  ('1210', 'Peralatan', 'asset', '1200', false, 'investing', null),
  ('1220', 'Kendaraan', 'asset', '1200', false, 'investing', null),
  ('1290', 'Akumulasi Penyusutan', 'asset', '1200', false, 'investing', 'Akun kontra aset — saldo normal kredit'),
  ('2110', 'Hutang Usaha', 'liability', '2100', false, 'operating', 'Purchase Invoice (Kredit)'),
  ('2120', 'Barang Diterima Belum Ditagih', 'liability', '2100', false, 'operating', 'Akun penampung penerimaan: RI (Kredit), PI (Debit)'),
  ('2130', 'Hutang Lain-lain', 'liability', '2100', false, 'operating', null),
  ('2210', 'Hutang Bank', 'liability', '2200', false, 'financing', null),
  ('3100', 'Modal Disetor', 'equity', '3000', false, 'financing', null),
  ('3200', 'Laba Ditahan', 'equity', '3000', false, 'financing', null),
  ('3300', 'Prive', 'equity', '3000', false, 'financing', null),
  ('4100', 'Penjualan', 'revenue', '4000', false, 'operating', 'POS & Sales Invoice (Kredit)'),
  ('4200', 'Pendapatan Lain-lain', 'revenue', '4000', false, 'operating', null),
  ('5100', 'Harga Pokok Penjualan', 'expense', '5000', false, 'operating', 'POS & Delivery Order (Debit)'),
  ('6100', 'Beban Gaji', 'expense', '6000', false, 'operating', null),
  ('6200', 'Beban Sewa', 'expense', '6000', false, 'operating', null),
  ('6300', 'Beban Listrik, Air & Internet', 'expense', '6000', false, 'operating', null),
  ('6400', 'Beban Penyusutan', 'expense', '6000', false, 'operating', 'Penyusutan aset (Debit)'),
  ('6500', 'Beban Pemeliharaan', 'expense', '6000', false, 'operating', 'Biaya servis aset (Debit)'),
  ('6900', 'Beban Lain-lain', 'expense', '6000', false, 'operating', null)
) as v(code, name, type, parent, is_cash, cf, descr)
join public.accounts p on p.code = v.parent;

-- ---------------------------------------------------------------------------
-- Contoh transaksi demo (Agustus & September 2026)
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  r record;
  l record;
begin
  for r in
    select * from (values
      (1, date '2026-08-01', 'Setoran modal awal pemilik', 'manual', 'SETORAN-001'),
      (2, date '2026-08-03', 'Pembelian peralatan toko', 'manual', 'KW-0801'),
      (3, date '2026-08-05', 'Penerimaan barang dari PT Sumber Makmur', 'receive_item', 'RI-2608-001'),
      (4, date '2026-08-06', 'Tagihan PT Sumber Makmur', 'purchase_invoice', 'PI-2608-001'),
      (5, date '2026-08-15', 'Penjualan POS harian', 'pos', 'POS-2608-015'),
      (6, date '2026-08-31', 'Beban sewa & gaji Agustus', 'manual', 'MEMO-0831'),
      (7, date '2026-08-31', 'Penyusutan peralatan Agustus', 'asset_depreciation', 'DEP-2608'),
      (8, date '2026-09-02', 'Pembayaran hutang PT Sumber Makmur', 'manual', 'BKK-0902'),
      (9, date '2026-09-10', 'Pengiriman barang ke CV Maju Jaya', 'delivery_order', 'DO-2609-001'),
      (10, date '2026-09-10', 'Faktur penjualan CV Maju Jaya', 'sales_invoice', 'SI-2609-001'),
      (11, date '2026-09-18', 'Penjualan POS harian', 'pos', 'POS-2609-018'),
      (12, date '2026-09-25', 'Servis AC toko', 'asset_maintenance', 'MNT-2609-001'),
      (13, date '2026-09-28', 'Pinjaman modal kerja bank', 'manual', 'PK-0928')
    ) as t(n, d, descr, src, ref)
  loop
    insert into public.journal_entries (entry_date, description, source_type, source_ref)
    values (r.d, r.descr, r.src, r.ref) returning id into v_id;

    for l in
      select row_number() over () as no, x.* from (values
        (1, '1120', 100000000, 0), (1, '3100', 0, 100000000),
        (2, '1210', 24000000, 0), (2, '1120', 0, 24000000),
        (3, '1140', 45000000, 0), (3, '2120', 0, 45000000),
        (4, '2120', 45000000, 0), (4, '2110', 0, 45000000),
        (5, '1110', 18500000, 0), (5, '5100', 11200000, 0), (5, '4100', 0, 18500000), (5, '1140', 0, 11200000),
        (6, '6200', 6000000, 0), (6, '6100', 9500000, 0), (6, '1120', 0, 15500000),
        (7, '6400', 500000, 0), (7, '1290', 0, 500000),
        (8, '2110', 45000000, 0), (8, '1120', 0, 45000000),
        (9, '5100', 14800000, 0), (9, '1140', 0, 14800000),
        (10, '1130', 23750000, 0), (10, '4100', 0, 23750000),
        (11, '1110', 21300000, 0), (11, '5100', 12900000, 0), (11, '4100', 0, 21300000), (11, '1140', 0, 12900000),
        (12, '6500', 850000, 0), (12, '1110', 0, 850000),
        (13, '1120', 50000000, 0), (13, '2210', 0, 50000000)
      ) as x(n, code, debit, credit)
      where x.n = r.n
    loop
      insert into public.journal_lines (entry_id, line_no, account_id, debit, credit)
      select v_id, l.no, a.id, l.debit, l.credit from public.accounts a where a.code = l.code;
    end loop;

    update public.journal_entries set status = 'posted' where id = v_id;
  end loop;
end;
$$;

-- Agustus 2026 sudah tutup buku (demo period lock).
update public.fiscal_periods set status = 'closed', closed_at = now() where year = 2026 and month = 8;

-- Contoh draft yang belum diposting.
do $$
declare
  v_id uuid;
begin
  insert into public.journal_entries (entry_date, description, source_type, source_ref)
  values (date '2026-09-30', 'Beban listrik & internet September (draft)', 'manual', 'MEMO-0930')
  returning id into v_id;
  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit)
  select v_id, 1, id, 1750000, 0 from public.accounts where code = '6300';
  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit)
  select v_id, 2, id, 0, 1750000 from public.accounts where code = '1120';
end;
$$;

-- ---------------------------------------------------------------------------
-- Smart POS: akun tambahan, produk (stok awal = saldo Persediaan di buku besar), promo, pelanggan
-- ---------------------------------------------------------------------------
insert into public.accounts (code, name, type, parent_id, description)
select v.code, v.name, v.type::public.account_type, p.id, v.descr
from (values
  ('4150', 'Diskon & Retur Penjualan', 'revenue', '4000', 'Kontra pendapatan (saldo normal debit): diskon promo, diskon manual, retur POS'),
  ('6910', 'Selisih Kas', 'expense', '6000', 'Selisih kas kasir saat tutup shift')
) as v(code, name, type, parent, descr)
join public.accounts p on p.code = v.parent
on conflict (code) do nothing;

select set_config('okabe.system', 'on', false);

insert into public.products (sku, barcode, name, category, unit, price, avg_cost, stock_qty) values
  ('KOP-001', '8990001000011', 'Kopi Susu Gula Aren', 'Minuman', 'cup', 22000, 8000, 120),
  ('KOP-002', '8990001000028', 'Americano', 'Minuman', 'cup', 18000, 6000, 100),
  ('KOP-003', '8990001000035', 'Cafe Latte', 'Minuman', 'cup', 25000, 9000, 80),
  ('TEH-001', '8990001000042', 'Es Teh Lemon', 'Minuman', 'cup', 15000, 4000, 100),
  ('AIR-001', '8990001000059', 'Air Mineral 600ml', 'Minuman', 'btl', 6000, 2500, 120),
  ('MKN-001', '8990001000066', 'Croissant Butter', 'Makanan', 'pcs', 20000, 9000, 60),
  ('MKN-002', '8990001000073', 'Roti Bakar Coklat Keju', 'Makanan', 'porsi', 24000, 10000, 50),
  ('MKN-003', '8990001000080', 'Donat Gula', 'Makanan', 'pcs', 8000, 3000, 100),
  ('RTL-001', '8990001000097', 'Biji Kopi Arabika 250g', 'Retail', 'pak', 95000, 60000, 20),
  ('RTL-002', '8990001000103', 'Tumbler OKABE', 'Retail', 'pcs', 120000, 58000, 10);

insert into public.stock_movements (product_id, moved_at, qty, unit_cost, balance_qty, ref_type, ref_no, note)
select id, timestamptz '2026-08-31 23:00+07', stock_qty, avg_cost, stock_qty, 'opening', 'SALDO-AWAL',
       'Saldo awal stok (sesuai saldo akun Persediaan)'
from public.products;

select set_config('okabe.system', '', false);

insert into public.promotions (name, type, priority, rules)
select 'Beli 2 Gratis 1 Donat', 'buy_x_get_y', 10,
       jsonb_build_object('product_ids', jsonb_build_array(id), 'buy_qty', 2, 'free_qty', 1)
from public.products where sku = 'MKN-003';

insert into public.promotions (name, type, priority, rules)
select 'Paket Hemat Kopi Aren + Croissant', 'bundle', 20,
       jsonb_build_object('price', 36000, 'items', jsonb_build_array(
         jsonb_build_object('product_id', (select id from public.products where sku = 'KOP-001'), 'qty', 1),
         jsonb_build_object('product_id', (select id from public.products where sku = 'MKN-001'), 'qty', 1)));

insert into public.promotions (name, type, priority, rules) values
  ('Happy Hour Minuman 14.00–17.00', 'happy_hour', 30,
   '{"days": [1, 2, 3, 4, 5], "start": "14:00", "end": "17:00", "discount_pct": 20, "categories": ["Minuman"]}');

insert into public.promotions (name, type, priority, rules)
select 'Diskon Grosir Air Mineral', 'volume_tier', 40,
       jsonb_build_object('product_ids', jsonb_build_array(id), 'tiers', jsonb_build_array(
         jsonb_build_object('min_qty', 12, 'discount_pct', 10),
         jsonb_build_object('min_qty', 24, 'discount_pct', 15)))
from public.products where sku = 'AIR-001';

insert into public.customers (phone, name, email, tier, notes) values
  ('081234567001', 'Budi Santoso', 'budi@example.com', 'gold', 'Suka kopi aren less sugar'),
  ('081234567002', 'Siti Rahma', null, 'regular', null),
  ('081234567003', 'CV Maju Jaya', 'admin@majujaya.example', 'corporate', 'Pesanan kantor');
