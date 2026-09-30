-- OKABE CORE — Smart POS
-- BRD: POS-01 offline-sync (idempotent submit), POS-02 otorisasi OTP manajer, POS-03 checker display,
-- POS-04 integrasi CRM, POS-05 promo engine berbasis aturan JSON, serta jurnal otomatis penjualan POS
-- (Kas/Bank & HPP di debit; Pendapatan & Persediaan di kredit).

do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net tidak tersedia: pengiriman OTP via WhatsApp/Email dinonaktifkan';
end $$;

create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  execute 'revoke all on schema private from anon, authenticated';
exception when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Akun tambahan untuk POS (hanya jika struktur CoA standar sudah ada)
-- ---------------------------------------------------------------------------
insert into public.accounts (code, name, type, parent_id, description)
select v.code, v.name, v.type::public.account_type, p.id, v.descr
from (values
  ('4150', 'Diskon & Retur Penjualan', 'revenue', '4000', 'Kontra pendapatan (saldo normal debit): diskon promo, diskon manual, retur POS'),
  ('6910', 'Selisih Kas', 'expense', '6000', 'Selisih kas kasir saat tutup shift')
) as v(code, name, type, parent, descr)
join public.accounts p on p.code = v.parent
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Pengaturan & rahasia
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values ('pos', jsonb_build_object(
  'store_name', 'OKABE Store',
  'store_address', 'Jl. Contoh No. 1, Jakarta',
  'receipt_footer', 'Terima kasih atas kunjungan Anda',
  'cash_account', '1110',
  'noncash_account', '1120',
  'revenue_account', '4100',
  'discount_account', '4150',
  'cogs_account', '5100',
  'inventory_account', '1140',
  'cash_variance_account', '6910',
  'points_per_amount', 10000,
  'otp_ttl_minutes', 5
)) on conflict (key) do nothing;

-- Token provider (WhatsApp/Email). Tidak terekspos ke API.
create table private.secrets (
  key text primary key,
  value text not null
);

create or replace function private.secret(p_key text)
returns text
language sql stable
as $$ select value from private.secrets where key = p_key $$;

create or replace function private.pos_setting(p_key text)
returns text
language sql stable
as $$ select value ->> p_key from public.app_settings where key = 'pos' $$;

create or replace function public.normalize_phone(p_phone text)
returns text
language sql immutable
set search_path = public
as $$
  select case
    when d = '' then null
    when d like '0%' then '62' || substr(d, 2)
    when d like '8%' then '62' || d
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- ---------------------------------------------------------------------------
-- Jurnal sistem (tanpa cek peran — hanya dipanggil fungsi bisnis lain)
-- ---------------------------------------------------------------------------
create or replace function private.post_system_journal(
  p_source_type text, p_source_ref text, p_entry_date date, p_description text, p_lines jsonb
)
returns public.journal_entries
language plpgsql
set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_line jsonb;
  v_account_id uuid;
  v_no int := 0;
  v_debit numeric;
  v_credit numeric;
begin
  insert into public.journal_entries (entry_date, description, source_type, source_ref)
  values (p_entry_date, p_description, p_source_type, p_source_ref)
  returning * into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce((v_line ->> 'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line ->> 'credit')::numeric, 0), 2);
    continue when v_debit = 0 and v_credit = 0;
    select id into v_account_id from public.accounts where code = v_line ->> 'account_code';
    if v_account_id is null then
      raise exception 'Kode akun % tidak ditemukan', v_line ->> 'account_code';
    end if;
    v_no := v_no + 1;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, memo)
    values (v_entry.id, v_no, v_account_id, v_debit, v_credit, v_line ->> 'memo');
  end loop;

  update public.journal_entries set status = 'posted' where id = v_entry.id returning * into v_entry;
  return v_entry;
end;
$$;

create or replace function private.reverse_entry(p_entry_id uuid, p_reason text, p_date date default null)
returns public.journal_entries
language plpgsql
set search_path = public
as $$
declare
  v_orig public.journal_entries;
  v_new public.journal_entries;
  v_date date;
begin
  select * into v_orig from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'Jurnal tidak ditemukan';
  end if;
  if v_orig.status <> 'posted' then
    raise exception 'Hanya jurnal Posted yang dapat dibalik; jurnal draft cukup diubah atau dihapus';
  end if;
  if v_orig.reversal_of is not null then
    raise exception 'Jurnal % adalah jurnal pembalik dan tidak dapat dibalik lagi', v_orig.entry_no;
  end if;
  if exists (select 1 from public.journal_entries where reversal_of = v_orig.id) then
    raise exception 'Jurnal % sudah pernah dibalik', v_orig.entry_no;
  end if;

  v_date := coalesce(
    p_date,
    case when public.ensure_period(v_orig.entry_date) = 'open' then v_orig.entry_date
         else (now() at time zone 'Asia/Jakarta')::date end
  );

  insert into public.journal_entries (entry_date, description, source_type, source_ref, reversal_of)
  values (v_date, 'Pembalik ' || v_orig.entry_no || ': ' || p_reason, 'reversal', v_orig.entry_no, v_orig.id)
  returning * into v_new;

  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, memo)
  select v_new.id, line_no, account_id, credit, debit, memo
  from public.journal_lines where entry_id = v_orig.id;

  update public.journal_entries set status = 'posted' where id = v_new.id returning * into v_new;
  return v_new;
end;
$$;

-- Fungsi publik tahap 1 memakai helper di atas.
create or replace function public.reverse_journal(
  p_entry_id uuid, p_reason text, p_date date default null
)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_orig public.journal_entries;
  v_new public.journal_entries;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin atau akuntan yang dapat membuat jurnal pembalik';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan pembalikan wajib diisi';
  end if;
  select * into v_orig from public.journal_entries where id = p_entry_id;
  v_new := private.reverse_entry(p_entry_id, p_reason, p_date);
  perform public.log_event('REVERSE_JOURNAL', 'journal_entries', p_entry_id::text,
    v_orig.entry_no || ' dibalik oleh ' || v_new.entry_no || ': ' || p_reason);
  return v_new;
end;
$$;

create or replace function public.create_auto_journal(
  p_source_type text, p_source_ref text, p_entry_date date, p_description text, p_lines jsonb
)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_entry public.journal_entries;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Tidak berwenang membuat jurnal otomatis';
  end if;
  if coalesce(p_source_type, '') in ('', 'manual', 'reversal') then
    raise exception 'source_type jurnal otomatis tidak valid';
  end if;
  v_entry := private.post_system_journal(p_source_type, p_source_ref, p_entry_date, p_description, p_lines);
  perform public.log_event('AUTO_JOURNAL', 'journal_entries', v_entry.id::text,
    p_source_type || ' ' || coalesce(p_source_ref, '') || ' → ' || v_entry.entry_no);
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Produk & stok (moving average)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (length(trim(sku)) > 0),
  barcode text unique,
  name text not null check (length(trim(name)) > 0),
  category text,
  unit text not null default 'pcs',
  price numeric(18, 2) not null check (price >= 0),
  avg_cost numeric(18, 4) not null default 0 check (avg_cost >= 0),
  stock_qty numeric(18, 3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete restrict,
  moved_at timestamptz not null default now(),
  qty numeric(18, 3) not null,
  unit_cost numeric(18, 4) not null,
  balance_qty numeric(18, 3) not null,
  ref_type text not null,
  ref_id uuid,
  ref_no text,
  journal_entry_id uuid references public.journal_entries (id),
  note text,
  created_by uuid references auth.users (id) default auth.uid()
);
create index stock_movements_product_idx on public.stock_movements (product_id, moved_at);

-- Stok & HPP rata-rata hanya boleh berubah lewat fungsi sistem.
create or replace function public.guard_product()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('okabe.system', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.stock_qty := 0;
      new.avg_cost := 0;
    elsif new.stock_qty is distinct from old.stock_qty or new.avg_cost is distinct from old.avg_cost then
      raise exception 'Stok dan HPP hanya dapat berubah melalui transaksi (penerimaan, penjualan, retur)';
    end if;
  end if;
  new.barcode := nullif(trim(new.barcode), '');
  return new;
end;
$$;

create trigger products_guard before insert or update on public.products
  for each row execute function public.guard_product();

create or replace function private.move_stock(
  p_product_id uuid, p_qty numeric, p_unit_cost numeric, p_ref_type text, p_ref_id uuid, p_ref_no text,
  p_journal_id uuid default null, p_note text default null
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_p public.products;
  v_cost numeric;
  v_avg numeric;
begin
  select * into v_p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;

  if p_qty > 0 then
    v_cost := coalesce(p_unit_cost, v_p.avg_cost);
    if v_p.stock_qty <= 0 then
      v_avg := v_cost;
    else
      v_avg := (v_p.stock_qty * v_p.avg_cost + p_qty * v_cost) / (v_p.stock_qty + p_qty);
    end if;
  else
    v_cost := v_p.avg_cost;
    v_avg := v_p.avg_cost;
  end if;

  perform set_config('okabe.system', 'on', true);
  update public.products
    set stock_qty = stock_qty + p_qty, avg_cost = round(v_avg, 4)
  where id = p_product_id;
  perform set_config('okabe.system', '', true);

  insert into public.stock_movements (product_id, qty, unit_cost, balance_qty, ref_type, ref_id, ref_no, journal_entry_id, note)
  values (p_product_id, p_qty, v_cost, v_p.stock_qty + p_qty, p_ref_type, p_ref_id, p_ref_no, p_journal_id, p_note);

  return v_cost;
end;
$$;

-- Penerimaan stok (saldo awal / pembelian sederhana sebelum modul Purchase).
-- p_lines: [{"product_id": uuid, "qty": n, "unit_cost": n}]
create or replace function public.receive_stock(
  p_date date, p_counter_account text, p_ref text, p_note text, p_lines jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_line jsonb;
  v_total numeric := 0;
  v_qty numeric;
  v_cost numeric;
  v_no text := coalesce(nullif(trim(p_ref), ''), 'STK-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDDHH24MISS'));
  v_entry public.journal_entries;
  v_counter public.accounts;
begin
  if not public.has_role(array['admin', 'manager', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin, manajer, atau akuntan yang dapat menerima stok';
  end if;
  select * into v_counter from public.accounts where code = p_counter_account;
  if not found or not v_counter.is_postable or v_counter.code = private.pos_setting('inventory_account') then
    raise exception 'Akun lawan tidak valid';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Minimal satu baris barang';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::numeric;
    v_cost := (v_line ->> 'unit_cost')::numeric;
    if coalesce(v_qty, 0) <= 0 or coalesce(v_cost, -1) < 0 then
      raise exception 'Qty harus > 0 dan harga pokok ≥ 0';
    end if;
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;

  v_entry := private.post_system_journal('stock_receipt', v_no, p_date,
    'Penerimaan stok ' || v_no || coalesce(' — ' || nullif(trim(p_note), ''), ''),
    jsonb_build_array(
      jsonb_build_object('account_code', private.pos_setting('inventory_account'), 'debit', v_total),
      jsonb_build_object('account_code', p_counter_account, 'credit', v_total)));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform private.move_stock((v_line ->> 'product_id')::uuid, (v_line ->> 'qty')::numeric,
      (v_line ->> 'unit_cost')::numeric, 'stock_receipt', v_entry.id, v_no, v_entry.id, p_note);
  end loop;

  perform public.log_event('RECEIVE_STOCK', 'journal_entries', v_entry.id::text, v_no || ' senilai ' || v_total);
  return jsonb_build_object('entry_id', v_entry.id, 'entry_no', v_entry.entry_no, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pelanggan & poin (CRM, POS-04)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null check (length(trim(name)) > 0),
  email text,
  tier text not null default 'regular',
  points_balance int not null default 0 check (points_balance >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.point_ledger (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  points int not null,
  balance int not null,
  ref_type text not null,
  ref_id uuid,
  note text
);
create index point_ledger_customer_idx on public.point_ledger (customer_id, created_at desc);

create or replace function public.guard_customer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phone := public.normalize_phone(new.phone);
  if new.phone is null or length(new.phone) < 8 then
    raise exception 'Nomor HP pelanggan tidak valid';
  end if;
  new.updated_at := now();
  if coalesce(current_setting('okabe.system', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.points_balance := 0;
    elsif new.points_balance is distinct from old.points_balance then
      raise exception 'Saldo poin hanya berubah melalui transaksi';
    end if;
  end if;
  return new;
end;
$$;

create trigger customers_guard before insert or update on public.customers
  for each row execute function public.guard_customer();

create or replace function private.add_points(p_customer_id uuid, p_points int, p_ref_type text, p_ref_id uuid, p_note text)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_balance int;
  v_points int;
begin
  select points_balance into v_balance from public.customers where id = p_customer_id for update;
  if not found then
    return 0;
  end if;
  v_points := greatest(p_points, -v_balance);
  if v_points = 0 then
    return 0;
  end if;
  perform set_config('okabe.system', 'on', true);
  update public.customers set points_balance = points_balance + v_points where id = p_customer_id;
  perform set_config('okabe.system', '', true);
  insert into public.point_ledger (customer_id, points, balance, ref_type, ref_id, note)
  values (p_customer_id, v_points, v_balance + v_points, p_ref_type, p_ref_id, p_note);
  return v_points;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promo engine (POS-05)
-- ---------------------------------------------------------------------------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('buy_x_get_y', 'bundle', 'happy_hour', 'volume_tier')),
  rules jsonb not null,
  priority int not null default 100,
  is_active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- Validasi struktur aturan JSON per tipe promo.
create or replace function public.validate_promotion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r jsonb := new.rules;
  x jsonb;
begin
  new.updated_at := now();
  if jsonb_typeof(r) <> 'object' then
    raise exception 'Aturan promo harus berupa objek JSON';
  end if;
  if new.type = 'buy_x_get_y' then
    if coalesce((r ->> 'buy_qty')::numeric, 0) <= 0 or coalesce((r ->> 'free_qty')::numeric, 0) <= 0 then
      raise exception 'Buy X Get Y membutuhkan buy_qty dan free_qty > 0';
    end if;
  elsif new.type = 'bundle' then
    if jsonb_array_length(coalesce(r -> 'items', '[]')) < 2 or coalesce((r ->> 'price')::numeric, -1) < 0 then
      raise exception 'Bundling membutuhkan minimal 2 item dan harga paket';
    end if;
    for x in select * from jsonb_array_elements(r -> 'items') loop
      if not exists (select 1 from public.products where id = (x ->> 'product_id')::uuid)
         or coalesce((x ->> 'qty')::numeric, 0) <= 0 then
        raise exception 'Item bundling tidak valid';
      end if;
    end loop;
  elsif new.type = 'happy_hour' then
    if coalesce(r ->> 'start', '') !~ '^[0-2][0-9]:[0-5][0-9]$' or coalesce(r ->> 'end', '') !~ '^[0-2][0-9]:[0-5][0-9]$'
       or r ->> 'start' >= r ->> 'end' then
      raise exception 'Happy hour membutuhkan jam mulai < jam selesai (format HH:MM)';
    end if;
    if coalesce((r ->> 'discount_pct')::numeric, 0) <= 0 or (r ->> 'discount_pct')::numeric > 100 then
      raise exception 'Persentase diskon happy hour harus 1–100';
    end if;
  elsif new.type = 'volume_tier' then
    if jsonb_array_length(coalesce(r -> 'tiers', '[]')) = 0 then
      raise exception 'Diskon volume membutuhkan minimal satu tingkat';
    end if;
    for x in select * from jsonb_array_elements(r -> 'tiers') loop
      if coalesce((x ->> 'min_qty')::numeric, 0) <= 0
         or coalesce((x ->> 'discount_pct')::numeric, 0) <= 0 or (x ->> 'discount_pct')::numeric > 100 then
        raise exception 'Tingkat diskon volume tidak valid';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger promotions_validate before insert or update on public.promotions
  for each row execute function public.validate_promotion();

create or replace function public.promo_applies(r jsonb, p_product_id uuid, p_category text)
returns boolean
language sql immutable
set search_path = public
as $$
  select case
    when jsonb_array_length(coalesce(r -> 'product_ids', '[]')) = 0
     and jsonb_array_length(coalesce(r -> 'categories', '[]')) = 0 then true
    else coalesce(r -> 'product_ids', '[]') ? p_product_id::text
      or (p_category is not null and coalesce(r -> 'categories', '[]') ? p_category)
  end;
$$;

-- Hitung harga keranjang + promo. Satu baris hanya mendapat satu promo; promo diproses
-- berdasarkan prioritas (angka kecil lebih dulu). Logika ini dicerminkan di src/lib/pos/pricing.ts.
-- p_items: [{"product_id": uuid, "qty": n}]
create or replace function public.pos_price_cart(p_items jsonb, p_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Jakarta';
  v_dow int := extract(isodow from v_local)::int;
  v_hm text := to_char(v_local, 'HH24:MI');
  pr public.promotions;
  r jsonb;
  v_pct numeric;
  v_buy numeric;
  v_free numeric;
  v_ok boolean;
  v_n numeric;
  v_normal numeric;
  v_disc numeric;
  v_alloc numeric;
  v_given numeric;
  v_cnt int;
  v_idx int;
  it record;
begin
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]')) i
    where coalesce((i ->> 'qty')::numeric, 0) <= 0
  ) then
    raise exception 'Qty setiap item harus lebih dari 0';
  end if;

  if to_regclass('pg_temp._pos_cart') is null then
    create temp table _pos_cart (
      line_no int, product_id uuid, name text, category text, qty numeric, unit_price numeric,
      gross numeric, promo_id uuid, promo_name text, promo_discount numeric
    ) on commit drop;
  else
    truncate _pos_cart;
  end if;

  insert into _pos_cart
  select row_number() over (order by min(t.ord)), p.id, p.name, p.category,
         sum((t.i ->> 'qty')::numeric), p.price, round(p.price * sum((t.i ->> 'qty')::numeric), 2),
         null, null, 0
  from jsonb_array_elements(coalesce(p_items, '[]')) with ordinality t(i, ord)
  join public.products p on p.id = (t.i ->> 'product_id')::uuid and p.is_active
  group by p.id, p.name, p.category, p.price;

  if (select count(distinct i ->> 'product_id') from jsonb_array_elements(coalesce(p_items, '[]')) i)
     <> (select count(*) from _pos_cart) then
    raise exception 'Ada produk yang tidak ditemukan atau tidak aktif';
  end if;

  for pr in
    select * from public.promotions
    where is_active
      and (starts_on is null or starts_on <= v_local::date)
      and (ends_on is null or ends_on >= v_local::date)
    order by priority, created_at, id
  loop
    r := pr.rules;

    if pr.type = 'buy_x_get_y' then
      v_buy := (r ->> 'buy_qty')::numeric;
      v_free := (r ->> 'free_qty')::numeric;
      update _pos_cart c
        set promo_id = pr.id, promo_name = pr.name,
            promo_discount = least(c.gross, round(floor(c.qty / (v_buy + v_free)) * v_free * c.unit_price, 2))
      where c.promo_id is null
        and public.promo_applies(r, c.product_id, c.category)
        and floor(c.qty / (v_buy + v_free)) > 0;

    elsif pr.type = 'volume_tier' then
      update _pos_cart c
        set promo_id = pr.id, promo_name = pr.name,
            promo_discount = least(c.gross, round(c.gross * t.pct / 100))
      from (
        select c2.line_no, max((x ->> 'discount_pct')::numeric) as pct
        from _pos_cart c2, jsonb_array_elements(r -> 'tiers') x
        where c2.qty >= (x ->> 'min_qty')::numeric
        group by c2.line_no
      ) t
      where t.line_no = c.line_no and c.promo_id is null
        and public.promo_applies(r, c.product_id, c.category) and t.pct > 0;

    elsif pr.type = 'happy_hour' then
      continue when not exists (
        select 1 from jsonb_array_elements_text(coalesce(r -> 'days', '[1,2,3,4,5,6,7]'::jsonb)) d
        where d::int = v_dow
      );
      continue when not (v_hm >= r ->> 'start' and v_hm < r ->> 'end');
      v_pct := (r ->> 'discount_pct')::numeric;
      update _pos_cart c
        set promo_id = pr.id, promo_name = pr.name,
            promo_discount = least(c.gross, round(c.gross * v_pct / 100))
      where c.promo_id is null and public.promo_applies(r, c.product_id, c.category);

    elsif pr.type = 'bundle' then
      select bool_and(c.line_no is not null and c.qty >= (x ->> 'qty')::numeric),
             min(floor(c.qty / (x ->> 'qty')::numeric)),
             sum(c.unit_price * (x ->> 'qty')::numeric),
             count(*)
        into v_ok, v_n, v_normal, v_cnt
      from jsonb_array_elements(r -> 'items') x
      left join _pos_cart c on c.product_id = (x ->> 'product_id')::uuid and c.promo_id is null;
      continue when not coalesce(v_ok, false) or v_n < 1;
      v_disc := round(v_n * (v_normal - (r ->> 'price')::numeric));
      continue when v_disc <= 0;

      v_idx := 0;
      v_given := 0;
      for it in
        select c.line_no, c.unit_price * (x ->> 'qty')::numeric as part
        from jsonb_array_elements(r -> 'items') x
        join _pos_cart c on c.product_id = (x ->> 'product_id')::uuid
        order by c.line_no
      loop
        v_idx := v_idx + 1;
        if v_idx = v_cnt then
          v_alloc := v_disc - v_given;
        else
          v_alloc := round(v_disc * it.part / v_normal);
        end if;
        v_given := v_given + v_alloc;
        update _pos_cart
          set promo_id = pr.id, promo_name = pr.name, promo_discount = least(gross, v_alloc)
        where line_no = it.line_no;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_no', line_no, 'product_id', product_id, 'name', name, 'qty', qty,
        'unit_price', unit_price, 'gross', gross, 'promo_id', promo_id, 'promo_name', promo_name,
        'promo_discount', promo_discount, 'net', gross - promo_discount
      ) order by line_no) from _pos_cart), '[]'::jsonb),
    'subtotal', (select coalesce(sum(gross), 0) from _pos_cart),
    'promo_discount', (select coalesce(sum(promo_discount), 0) from _pos_cart)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- OTP manajer (POS-02)
-- ---------------------------------------------------------------------------
create table public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('void', 'manual_discount', 'return')),
  context jsonb not null default '{}',
  requested_by uuid not null references auth.users (id) default auth.uid(),
  approver_id uuid not null references public.profiles (id),
  channel text not null check (channel in ('whatsapp', 'email', 'inbox')),
  destination text,
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  used_at timestamptz,
  used_ref text,
  created_at timestamptz not null default now()
);
create index otp_requests_requested_idx on public.otp_requests (requested_by, created_at desc);

-- Hash kode OTP disimpan terpisah dan tidak terekspos ke API.
create table private.otp_codes (
  otp_id uuid primary key references public.otp_requests (id) on delete cascade,
  code_hash text not null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null,
  destination text,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'delivered')),
  provider_response text,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create or replace function private.dispatch_notification(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  n public.notifications;
  v_req bigint;
begin
  select * into n from public.notifications where id = p_id;
  if n.channel = 'inbox' then
    return;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'net' and p.proname = 'http_post'
  ) then
    update public.notifications set status = 'failed', provider_response = 'pg_net tidak aktif' where id = p_id;
    return;
  end if;

  if n.channel = 'whatsapp' then
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      into v_req
      using coalesce(private.secret('wa_api_url'), 'https://api.fonnte.com/send'),
            jsonb_build_object('target', n.destination, 'message', n.body),
            jsonb_build_object('Authorization', private.secret('wa_api_token'), 'Content-Type', 'application/json');
  elsif n.channel = 'email' then
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      into v_req
      using 'https://api.resend.com/emails',
            jsonb_build_object(
              'from', coalesce(private.secret('email_from'), 'OKABE POS <onboarding@resend.dev>'),
              'to', jsonb_build_array(n.destination),
              'subject', coalesce(n.subject, 'Kode OTP OKABE POS'),
              'text', n.body),
            jsonb_build_object('Authorization', 'Bearer ' || private.secret('resend_api_key'), 'Content-Type', 'application/json');
  end if;
  update public.notifications set status = 'sent', provider_response = 'pg_net request #' || v_req where id = p_id;
exception when others then
  update public.notifications set status = 'failed', provider_response = sqlerrm where id = p_id;
end;
$$;

create or replace function private.mask(p_value text)
returns text
language sql immutable
as $$
  select case
    when p_value is null then null
    when position('@' in p_value) > 0 then left(p_value, 1) || '***' || substr(p_value, position('@' in p_value))
    when length(p_value) > 7 then left(p_value, 5) || repeat('*', length(p_value) - 8) || right(p_value, 3)
    else p_value
  end;
$$;

-- p_context wajib memuat "ref": id transaksi (void/retur) atau client_uuid keranjang (diskon manual).
create or replace function public.request_otp(p_action text, p_approver uuid, p_context jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_approver public.profiles;
  v_requester public.profiles;
  v_code text;
  v_bytes bytea;
  v_channel text;
  v_dest text;
  v_ttl int := coalesce(private.pos_setting('otp_ttl_minutes')::int, 5);
  v_otp public.otp_requests;
  v_notif uuid;
  v_label text;
  v_detail text;
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Tidak berwenang meminta OTP';
  end if;
  if p_action not in ('void', 'manual_discount', 'return') then
    raise exception 'Jenis otorisasi tidak dikenal';
  end if;
  if coalesce(p_context ->> 'ref', '') = '' then
    raise exception 'Konteks OTP tidak lengkap';
  end if;
  select * into v_approver from public.profiles where id = p_approver and role in ('admin', 'manager');
  if not found then
    raise exception 'Approver harus berperan Manajer atau Admin';
  end if;
  if (select count(*) from public.otp_requests
      where requested_by = auth.uid() and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Terlalu banyak permintaan OTP. Coba lagi beberapa menit lagi.';
  end if;
  select * into v_requester from public.profiles where id = auth.uid();

  v_bytes := gen_random_bytes(3);
  v_code := lpad((((get_byte(v_bytes, 0) << 16) + (get_byte(v_bytes, 1) << 8) + get_byte(v_bytes, 2)) % 1000000)::text, 6, '0');

  if v_approver.phone is not null and private.secret('wa_api_token') is not null then
    v_channel := 'whatsapp';
    v_dest := v_approver.phone;
  elsif v_approver.email is not null and private.secret('resend_api_key') is not null then
    v_channel := 'email';
    v_dest := v_approver.email;
  else
    v_channel := 'inbox';
    v_dest := 'Kotak OTP aplikasi';
  end if;

  insert into public.otp_requests (action, context, approver_id, channel, destination, expires_at)
  values (p_action, p_context, p_approver, v_channel, v_dest, now() + make_interval(mins => v_ttl))
  returning * into v_otp;
  insert into private.otp_codes (otp_id, code_hash) values (v_otp.id, crypt(v_code, gen_salt('bf', 6)));

  v_label := case p_action
    when 'void' then 'VOID transaksi'
    when 'return' then 'RETUR transaksi'
    else 'DISKON MANUAL' end;
  v_detail := coalesce(p_context ->> 'summary', '');
  insert into public.notifications (recipient_id, channel, destination, subject, body, status)
  values (
    p_approver, v_channel, v_dest, 'Kode OTP ' || v_label,
    'OKABE POS: Kode OTP ' || v_code || ' untuk ' || v_label
      || case when v_detail <> '' then ' (' || v_detail || ')' else '' end
      || ' diminta oleh ' || coalesce(v_requester.full_name, v_requester.email, 'kasir')
      || '. Berlaku ' || v_ttl || ' menit. Jangan berikan kode ini jika Anda tidak menyetujui.',
    case when v_channel = 'inbox' then 'delivered' else 'queued' end
  ) returning id into v_notif;

  if v_channel <> 'inbox' then
    perform private.dispatch_notification(v_notif);
  end if;

  perform public.log_event('REQUEST_OTP', 'otp_requests', v_otp.id::text,
    v_label || ' → ' || coalesce(v_approver.full_name, v_approver.email) || ' via ' || v_channel
      || case when v_detail <> '' then ' · ' || v_detail else '' end);

  return jsonb_build_object(
    'otp_id', v_otp.id,
    'channel', v_channel,
    'destination', private.mask(v_dest),
    'approver', coalesce(v_approver.full_name, v_approver.email),
    'expires_at', v_otp.expires_at
  );
end;
$$;

-- Mengembalikan {ok, error, remaining}; tidak raise agar hitungan percobaan tetap tersimpan.
create or replace function public.verify_otp(p_otp_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_otp public.otp_requests;
  v_hash text;
begin
  select * into v_otp from public.otp_requests where id = p_otp_id for update;
  if not found or v_otp.requested_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Permintaan OTP tidak ditemukan');
  end if;
  if v_otp.verified_at is not null then
    return jsonb_build_object('ok', true);
  end if;
  if v_otp.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Kode OTP kedaluwarsa. Minta kode baru.');
  end if;
  if v_otp.attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak percobaan. Minta kode baru.');
  end if;

  update public.otp_requests set attempts = attempts + 1 where id = p_otp_id;
  select code_hash into v_hash from private.otp_codes where otp_id = p_otp_id;
  if crypt(coalesce(p_code, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'Kode OTP salah', 'remaining', 4 - v_otp.attempts);
  end if;

  update public.otp_requests set verified_at = now() where id = p_otp_id;
  perform public.log_event('VERIFY_OTP', 'otp_requests', p_otp_id::text, v_otp.action || ' disetujui');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function private.consume_otp(p_otp_id uuid, p_action text, p_ref text, p_amount numeric default null)
returns public.otp_requests
language plpgsql
set search_path = public
as $$
declare
  v_otp public.otp_requests;
begin
  select * into v_otp from public.otp_requests where id = p_otp_id for update;
  if not found or v_otp.requested_by <> auth.uid() or v_otp.action <> p_action then
    raise exception 'Otorisasi manajer (OTP) diperlukan';
  end if;
  if v_otp.verified_at is null then
    raise exception 'OTP belum diverifikasi';
  end if;
  if v_otp.used_at is not null then
    raise exception 'OTP sudah digunakan';
  end if;
  if v_otp.verified_at < now() - interval '30 minutes' then
    raise exception 'Otorisasi OTP kedaluwarsa. Minta kode baru.';
  end if;
  if v_otp.context ->> 'ref' <> p_ref then
    raise exception 'OTP bukan untuk transaksi ini';
  end if;
  if p_amount is not null and p_amount > coalesce((v_otp.context ->> 'amount')::numeric, 0) then
    raise exception 'Nilai melebihi yang disetujui manajer';
  end if;
  update public.otp_requests set used_at = now(), used_ref = p_ref where id = p_otp_id returning * into v_otp;
  return v_otp;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shift kasir
-- ---------------------------------------------------------------------------
create sequence public.pos_shift_seq;
create sequence public.pos_sale_seq;
create sequence public.pos_return_seq;

create table public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_no text not null unique,
  cashier_id uuid not null references auth.users (id) default auth.uid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  opening_cash numeric(18, 2) not null default 0 check (opening_cash >= 0),
  closed_at timestamptz,
  expected_cash numeric(18, 2),
  actual_cash numeric(18, 2),
  variance numeric(18, 2),
  variance_journal_id uuid references public.journal_entries (id),
  note text
);
create unique index pos_shifts_one_open on public.pos_shifts (cashier_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Penjualan POS
-- ---------------------------------------------------------------------------
create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  sale_no text not null unique,
  shift_id uuid not null references public.pos_shifts (id),
  cashier_id uuid not null references auth.users (id) default auth.uid(),
  customer_id uuid references public.customers (id),
  sold_at timestamptz not null,
  synced_at timestamptz not null default now(),
  offline boolean not null default false,
  subtotal numeric(18, 2) not null,
  promo_discount numeric(18, 2) not null default 0,
  manual_discount numeric(18, 2) not null default 0,
  manual_discount_otp uuid references public.otp_requests (id),
  total numeric(18, 2) not null,
  payment_method text not null check (payment_method in ('cash', 'card', 'qris', 'transfer')),
  paid_amount numeric(18, 2) not null,
  change_amount numeric(18, 2) not null default 0,
  cogs_total numeric(18, 2) not null default 0,
  points_earned int not null default 0,
  client_total numeric(18, 2),
  price_mismatch boolean not null default false,
  status text not null default 'completed' check (status in ('completed', 'voided')),
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_otp uuid references public.otp_requests (id),
  void_journal_id uuid references public.journal_entries (id),
  fulfillment_status text not null default 'preparing' check (fulfillment_status in ('preparing', 'ready', 'completed')),
  fulfillment_updated_at timestamptz,
  journal_entry_id uuid references public.journal_entries (id),
  note text
);
create index pos_sales_sold_at_idx on public.pos_sales (sold_at desc);
create index pos_sales_customer_idx on public.pos_sales (customer_id, sold_at desc);
create index pos_sales_shift_idx on public.pos_sales (shift_id);
create index pos_sales_fulfillment_idx on public.pos_sales (fulfillment_status) where fulfillment_status <> 'completed';

create table public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales (id) on delete restrict,
  line_no int not null,
  product_id uuid not null references public.products (id),
  product_name text not null,
  qty numeric(18, 3) not null check (qty > 0),
  unit_price numeric(18, 2) not null,
  gross numeric(18, 2) not null,
  promo_id uuid references public.promotions (id),
  promo_name text,
  promo_discount numeric(18, 2) not null default 0,
  net numeric(18, 2) not null,
  unit_cost numeric(18, 4) not null,
  returned_qty numeric(18, 3) not null default 0
);
create index pos_sale_items_sale_idx on public.pos_sale_items (sale_id);
create index pos_sale_items_product_idx on public.pos_sale_items (product_id);

create table public.pos_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  sale_id uuid not null references public.pos_sales (id),
  shift_id uuid references public.pos_shifts (id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  reason text not null,
  refund_method text not null check (refund_method in ('cash', 'card', 'qris', 'transfer')),
  refund_amount numeric(18, 2) not null,
  cogs_amount numeric(18, 2) not null,
  otp_id uuid references public.otp_requests (id),
  journal_entry_id uuid references public.journal_entries (id)
);

create table public.pos_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.pos_returns (id),
  sale_item_id uuid not null references public.pos_sale_items (id),
  qty numeric(18, 3) not null check (qty > 0),
  refund_amount numeric(18, 2) not null,
  unit_cost numeric(18, 4) not null
);

create or replace function private.pos_cash_account(p_method text)
returns text
language sql stable
as $$
  select case when p_method = 'cash' then private.pos_setting('cash_account')
              else private.pos_setting('noncash_account') end;
$$;

create or replace function public.pos_open_shift(p_opening_cash numeric default 0, p_note text default null)
returns public.pos_shifts
language plpgsql security definer set search_path = public
as $$
declare
  v_shift public.pos_shifts;
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Hanya kasir, manajer, atau admin yang dapat membuka shift';
  end if;
  if exists (select 1 from public.pos_shifts where cashier_id = auth.uid() and status = 'open') then
    raise exception 'Anda masih memiliki shift yang terbuka';
  end if;
  insert into public.pos_shifts (shift_no, cashier_id, opening_cash, note)
  values (
    'SHF' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(nextval('public.pos_shift_seq')::text, 4, '0'),
    auth.uid(), round(coalesce(p_opening_cash, 0), 2), p_note
  ) returning * into v_shift;
  return v_shift;
end;
$$;

create or replace function public.pos_shift_summary(p_shift_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_shift public.pos_shifts;
  v_by_method jsonb;
  v_cash_sales numeric;
  v_cash_refunds numeric;
  v_count int;
  v_voided int;
begin
  select * into v_shift from public.pos_shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift tidak ditemukan';
  end if;
  if v_shift.cashier_id <> auth.uid() and not public.has_role(array['admin', 'manager', 'accountant']::public.app_role[]) then
    raise exception 'Tidak berwenang melihat shift ini';
  end if;

  select coalesce(jsonb_object_agg(payment_method, amt), '{}'::jsonb) into v_by_method
  from (select payment_method, sum(total) amt from public.pos_sales
        where shift_id = p_shift_id and status = 'completed' group by payment_method) x;
  select coalesce(sum(total), 0), count(*) into v_cash_sales, v_count
  from public.pos_sales where shift_id = p_shift_id and status = 'completed' and payment_method = 'cash';
  select count(*) into v_count from public.pos_sales where shift_id = p_shift_id and status = 'completed';
  select count(*) into v_voided from public.pos_sales where shift_id = p_shift_id and status = 'voided';
  select coalesce(sum(refund_amount), 0) into v_cash_refunds
  from public.pos_returns where shift_id = p_shift_id and refund_method = 'cash';

  return jsonb_build_object(
    'shift', to_jsonb(v_shift),
    'sales_count', v_count,
    'voided_count', v_voided,
    'by_method', v_by_method,
    'cash_sales', v_cash_sales,
    'cash_refunds', v_cash_refunds,
    'expected_cash', v_shift.opening_cash + v_cash_sales - v_cash_refunds
  );
end;
$$;

create or replace function public.pos_close_shift(p_actual_cash numeric, p_note text default null)
returns public.pos_shifts
language plpgsql security definer set search_path = public
as $$
declare
  v_shift public.pos_shifts;
  v_expected numeric;
  v_variance numeric;
  v_entry public.journal_entries;
  v_cash text := private.pos_setting('cash_account');
  v_var_acc text := private.pos_setting('cash_variance_account');
begin
  select * into v_shift from public.pos_shifts where cashier_id = auth.uid() and status = 'open' for update;
  if not found then
    raise exception 'Tidak ada shift yang terbuka';
  end if;
  if p_actual_cash is null or p_actual_cash < 0 then
    raise exception 'Jumlah kas aktual wajib diisi';
  end if;
  v_expected := (public.pos_shift_summary(v_shift.id) ->> 'expected_cash')::numeric;
  v_variance := round(p_actual_cash - v_expected, 2);

  if v_variance <> 0 then
    v_entry := private.post_system_journal('pos_shift', v_shift.shift_no,
      (now() at time zone 'Asia/Jakarta')::date,
      'Selisih kas tutup shift ' || v_shift.shift_no,
      case when v_variance < 0 then jsonb_build_array(
        jsonb_build_object('account_code', v_var_acc, 'debit', -v_variance),
        jsonb_build_object('account_code', v_cash, 'credit', -v_variance))
      else jsonb_build_array(
        jsonb_build_object('account_code', v_cash, 'debit', v_variance),
        jsonb_build_object('account_code', v_var_acc, 'credit', v_variance)) end);
  end if;

  update public.pos_shifts
    set status = 'closed', closed_at = now(), expected_cash = v_expected, actual_cash = round(p_actual_cash, 2),
        variance = v_variance, variance_journal_id = v_entry.id,
        note = coalesce(nullif(trim(p_note), ''), note)
  where id = v_shift.id
  returning * into v_shift;

  perform public.log_event('CLOSE_SHIFT', 'pos_shifts', v_shift.id::text,
    v_shift.shift_no || ': ekspektasi ' || v_expected || ', aktual ' || p_actual_cash || ', selisih ' || v_variance);
  return v_shift;
end;
$$;

-- Submit penjualan. Idempoten berdasarkan client_uuid sehingga aman diulang saat sinkronisasi offline.
-- p_sale: {client_uuid, sold_at, shift_id, customer_id, payment_method, paid_amount, items:[{product_id, qty}],
--          manual_discount, manual_discount_otp, client_total, offline, note}
create or replace function public.pos_submit_sale(p_sale jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := (p_sale ->> 'client_uuid')::uuid;
  v_existing public.pos_sales;
  v_sold_at timestamptz := coalesce((p_sale ->> 'sold_at')::timestamptz, now());
  v_method text := coalesce(p_sale ->> 'payment_method', 'cash');
  v_manual numeric := round(coalesce((p_sale ->> 'manual_discount')::numeric, 0), 2);
  v_manual_otp uuid := nullif(p_sale ->> 'manual_discount_otp', '')::uuid;
  v_customer uuid := nullif(p_sale ->> 'customer_id', '')::uuid;
  v_shift public.pos_shifts;
  v_cart jsonb;
  v_subtotal numeric;
  v_promo numeric;
  v_total numeric;
  v_paid numeric;
  v_cogs numeric := 0;
  v_cost numeric;
  v_line jsonb;
  v_sale public.pos_sales;
  v_entry public.journal_entries;
  v_points int := 0;
  v_ppa numeric := coalesce(private.pos_setting('points_per_amount')::numeric, 0);
  v_date date;
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Hanya kasir, manajer, atau admin yang dapat melakukan transaksi POS';
  end if;
  if v_client is null then
    raise exception 'client_uuid wajib diisi';
  end if;

  select * into v_existing from public.pos_sales where client_uuid = v_client;
  if found then
    return jsonb_build_object('id', v_existing.id, 'sale_no', v_existing.sale_no, 'total', v_existing.total,
      'points_earned', v_existing.points_earned, 'price_mismatch', v_existing.price_mismatch, 'duplicate', true);
  end if;

  if v_method not in ('cash', 'card', 'qris', 'transfer') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  -- Toleransi jam perangkat kasir yang lebih cepat.
  if v_sold_at > now() + interval '5 minutes' then
    v_sold_at := now();
  end if;

  if nullif(p_sale ->> 'shift_id', '') is not null then
    select * into v_shift from public.pos_shifts
    where id = (p_sale ->> 'shift_id')::uuid and cashier_id = auth.uid();
  end if;
  if v_shift.id is null then
    select * into v_shift from public.pos_shifts where cashier_id = auth.uid() and status = 'open';
  end if;
  if v_shift.id is null then
    raise exception 'Belum ada shift kasir yang dibuka';
  end if;

  v_cart := public.pos_price_cart(p_sale -> 'items', v_sold_at);
  if jsonb_array_length(v_cart -> 'lines') = 0 then
    raise exception 'Keranjang kosong';
  end if;
  v_subtotal := (v_cart ->> 'subtotal')::numeric;
  v_promo := (v_cart ->> 'promo_discount')::numeric;

  if v_manual < 0 or v_manual > v_subtotal - v_promo then
    raise exception 'Diskon manual tidak valid';
  end if;
  if v_manual > 0 then
    perform private.consume_otp(v_manual_otp, 'manual_discount', v_client::text, v_manual);
  else
    v_manual_otp := null;
  end if;

  v_total := v_subtotal - v_promo - v_manual;
  v_paid := case when v_method = 'cash' then round(coalesce((p_sale ->> 'paid_amount')::numeric, v_total), 2) else v_total end;
  if v_paid < v_total then
    raise exception 'Jumlah pembayaran kurang dari total';
  end if;
  if v_customer is not null and not exists (select 1 from public.customers where id = v_customer) then
    v_customer := null;
  end if;
  v_date := (v_sold_at at time zone 'Asia/Jakarta')::date;

  insert into public.pos_sales (
    client_uuid, sale_no, shift_id, cashier_id, customer_id, sold_at, offline,
    subtotal, promo_discount, manual_discount, manual_discount_otp, total,
    payment_method, paid_amount, change_amount, client_total, price_mismatch, note
  ) values (
    v_client,
    'POS' || to_char(v_sold_at at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(nextval('public.pos_sale_seq')::text, 5, '0'),
    v_shift.id, auth.uid(), v_customer, v_sold_at, coalesce((p_sale ->> 'offline')::boolean, false),
    v_subtotal, v_promo, v_manual, v_manual_otp, v_total,
    v_method, v_paid, v_paid - v_total,
    (p_sale ->> 'client_total')::numeric,
    (p_sale ->> 'client_total') is not null and (p_sale ->> 'client_total')::numeric <> v_total,
    nullif(trim(p_sale ->> 'note'), '')
  ) returning * into v_sale;

  for v_line in select * from jsonb_array_elements(v_cart -> 'lines') loop
    v_cost := private.move_stock((v_line ->> 'product_id')::uuid, -(v_line ->> 'qty')::numeric, null,
      'pos_sale', v_sale.id, v_sale.sale_no);
    insert into public.pos_sale_items (
      sale_id, line_no, product_id, product_name, qty, unit_price, gross,
      promo_id, promo_name, promo_discount, net, unit_cost
    ) values (
      v_sale.id, (v_line ->> 'line_no')::int, (v_line ->> 'product_id')::uuid, v_line ->> 'name',
      (v_line ->> 'qty')::numeric, (v_line ->> 'unit_price')::numeric, (v_line ->> 'gross')::numeric,
      nullif(v_line ->> 'promo_id', '')::uuid, v_line ->> 'promo_name',
      (v_line ->> 'promo_discount')::numeric, (v_line ->> 'net')::numeric, v_cost
    );
    v_cogs := v_cogs + round((v_line ->> 'qty')::numeric * v_cost, 2);
  end loop;

  v_entry := private.post_system_journal('pos', v_sale.sale_no, v_date, 'Penjualan POS ' || v_sale.sale_no,
    jsonb_build_array(
      jsonb_build_object('account_code', private.pos_cash_account(v_method), 'debit', v_total),
      jsonb_build_object('account_code', private.pos_setting('discount_account'), 'debit', v_promo + v_manual,
        'memo', 'Diskon promo ' || v_promo || ' + manual ' || v_manual),
      jsonb_build_object('account_code', private.pos_setting('revenue_account'), 'credit', v_subtotal),
      jsonb_build_object('account_code', private.pos_setting('cogs_account'), 'debit', v_cogs),
      jsonb_build_object('account_code', private.pos_setting('inventory_account'), 'credit', v_cogs)));

  update public.stock_movements set journal_entry_id = v_entry.id where ref_id = v_sale.id and ref_type = 'pos_sale';

  if v_customer is not null and v_ppa > 0 then
    v_points := private.add_points(v_customer, floor(v_total / v_ppa)::int, 'pos_sale', v_sale.id, v_sale.sale_no);
  end if;

  update public.pos_sales set cogs_total = v_cogs, journal_entry_id = v_entry.id, points_earned = v_points
  where id = v_sale.id;

  return jsonb_build_object('id', v_sale.id, 'sale_no', v_sale.sale_no, 'total', v_total,
    'subtotal', v_subtotal, 'promo_discount', v_promo, 'manual_discount', v_manual,
    'change_amount', v_paid - v_total, 'points_earned', v_points,
    'price_mismatch', v_sale.price_mismatch, 'journal_no', v_entry.entry_no, 'duplicate', false);
end;
$$;

create or replace function public.pos_void_sale(p_sale_id uuid, p_otp_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sale public.pos_sales;
  v_rev public.journal_entries;
  it public.pos_sale_items;
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Tidak berwenang membatalkan transaksi';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi';
  end if;
  select * into v_sale from public.pos_sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'completed' then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan';
  end if;
  if exists (select 1 from public.pos_returns where sale_id = p_sale_id) then
    raise exception 'Transaksi sudah memiliki retur; gunakan retur untuk sisa barang';
  end if;
  perform private.consume_otp(p_otp_id, 'void', p_sale_id::text);

  v_rev := private.reverse_entry(v_sale.journal_entry_id, 'Void ' || v_sale.sale_no || ': ' || p_reason);
  for it in select * from public.pos_sale_items where sale_id = p_sale_id order by line_no loop
    perform private.move_stock(it.product_id, it.qty, it.unit_cost, 'pos_void', v_sale.id, v_sale.sale_no, v_rev.id);
  end loop;
  if v_sale.customer_id is not null and v_sale.points_earned > 0 then
    perform private.add_points(v_sale.customer_id, -v_sale.points_earned, 'pos_void', v_sale.id, 'Void ' || v_sale.sale_no);
  end if;

  update public.pos_sales
    set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid(),
        void_otp = p_otp_id, void_journal_id = v_rev.id
  where id = p_sale_id;

  perform public.log_event('VOID_SALE', 'pos_sales', p_sale_id::text,
    v_sale.sale_no || ' (' || v_sale.total || '): ' || p_reason);
  return jsonb_build_object('sale_no', v_sale.sale_no, 'journal_no', v_rev.entry_no);
end;
$$;

-- p_items: [{"sale_item_id": uuid, "qty": n}]
create or replace function public.pos_return_sale(
  p_sale_id uuid, p_items jsonb, p_otp_id uuid, p_reason text, p_refund_method text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sale public.pos_sales;
  v_ret public.pos_returns;
  v_shift uuid;
  v_factor numeric;
  v_method text;
  v_x jsonb;
  v_item public.pos_sale_items;
  v_qty numeric;
  v_refund numeric;
  v_total_refund numeric := 0;
  v_total_cost numeric := 0;
  v_entry public.journal_entries;
  v_ppa numeric := coalesce(private.pos_setting('points_per_amount')::numeric, 0);
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Tidak berwenang memproses retur';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan retur wajib diisi';
  end if;
  select * into v_sale from public.pos_sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'completed' then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then
    raise exception 'Pilih barang yang diretur';
  end if;
  perform private.consume_otp(p_otp_id, 'return', p_sale_id::text);

  v_method := coalesce(nullif(p_refund_method, ''), v_sale.payment_method);
  if v_method not in ('cash', 'card', 'qris', 'transfer') then
    raise exception 'Metode refund tidak valid';
  end if;
  select id into v_shift from public.pos_shifts where cashier_id = auth.uid() and status = 'open';
  if v_method = 'cash' and v_shift is null then
    raise exception 'Buka shift kasir terlebih dahulu untuk refund tunai';
  end if;
  -- Diskon manual dialokasikan proporsional ke setiap baris.
  v_factor := case when v_sale.subtotal - v_sale.promo_discount > 0
                   then v_sale.total / (v_sale.subtotal - v_sale.promo_discount) else 0 end;

  insert into public.pos_returns (return_no, sale_id, shift_id, reason, refund_method, refund_amount, cogs_amount, otp_id)
  values ('RTR' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(nextval('public.pos_return_seq')::text, 5, '0'),
          p_sale_id, v_shift, p_reason, v_method, 0, 0, p_otp_id)
  returning * into v_ret;

  for v_x in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_x ->> 'qty')::numeric, 0);
    continue when v_qty = 0;
    select * into v_item from public.pos_sale_items where id = (v_x ->> 'sale_item_id')::uuid and sale_id = p_sale_id for update;
    if not found or v_qty < 0 or v_qty > v_item.qty - v_item.returned_qty then
      raise exception 'Qty retur tidak valid untuk %', coalesce(v_item.product_name, 'item');
    end if;
    v_refund := round(v_item.net * v_qty / v_item.qty * v_factor);
    perform private.move_stock(v_item.product_id, v_qty, v_item.unit_cost, 'pos_return', v_ret.id, v_ret.return_no);
    update public.pos_sale_items set returned_qty = returned_qty + v_qty where id = v_item.id;
    insert into public.pos_return_items (return_id, sale_item_id, qty, refund_amount, unit_cost)
    values (v_ret.id, v_item.id, v_qty, v_refund, v_item.unit_cost);
    v_total_refund := v_total_refund + v_refund;
    v_total_cost := v_total_cost + round(v_qty * v_item.unit_cost, 2);
  end loop;

  if v_total_refund = 0 and v_total_cost = 0 then
    raise exception 'Tidak ada barang yang diretur';
  end if;

  v_entry := private.post_system_journal('pos_return', v_ret.return_no, (now() at time zone 'Asia/Jakarta')::date,
    'Retur POS ' || v_ret.return_no || ' atas ' || v_sale.sale_no || ': ' || p_reason,
    jsonb_build_array(
      jsonb_build_object('account_code', private.pos_setting('discount_account'), 'debit', v_total_refund),
      jsonb_build_object('account_code', private.pos_cash_account(v_method), 'credit', v_total_refund),
      jsonb_build_object('account_code', private.pos_setting('inventory_account'), 'debit', v_total_cost),
      jsonb_build_object('account_code', private.pos_setting('cogs_account'), 'credit', v_total_cost)));
  update public.stock_movements set journal_entry_id = v_entry.id where ref_id = v_ret.id and ref_type = 'pos_return';

  if v_sale.customer_id is not null and v_ppa > 0 and v_sale.points_earned > 0 then
    perform private.add_points(v_sale.customer_id, -least(v_sale.points_earned, floor(v_total_refund / v_ppa)::int),
      'pos_return', v_ret.id, v_ret.return_no);
  end if;

  update public.pos_returns set refund_amount = v_total_refund, cogs_amount = v_total_cost, journal_entry_id = v_entry.id
  where id = v_ret.id returning * into v_ret;

  perform public.log_event('RETURN_SALE', 'pos_returns', v_ret.id::text,
    v_ret.return_no || ' atas ' || v_sale.sale_no || ' refund ' || v_total_refund || ': ' || p_reason);
  return jsonb_build_object('return_no', v_ret.return_no, 'refund_amount', v_total_refund, 'journal_no', v_entry.entry_no);
end;
$$;

-- Checker display (POS-03): Preparing → Ready → Completed
create or replace function public.pos_set_fulfillment(p_sale_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current text;
begin
  if not public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'Tidak berwenang';
  end if;
  select fulfillment_status into v_current from public.pos_sales where id = p_sale_id and status = 'completed';
  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;
  if not ((v_current = 'preparing' and p_status in ('ready', 'completed')) or (v_current = 'ready' and p_status = 'completed')) then
    raise exception 'Status tidak dapat diubah dari % ke %', v_current, p_status;
  end if;
  update public.pos_sales set fulfillment_status = p_status, fulfillment_updated_at = now() where id = p_sale_id;
end;
$$;

-- CRM (POS-04): profil, histori, poin, dan rekomendasi upselling.
create or replace function public.pos_customer_insight(p_phone text, p_cart uuid[] default '{}')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_c public.customers;
begin
  if auth.uid() is null then
    raise exception 'Harus login';
  end if;
  select * into v_c from public.customers where phone = public.normalize_phone(p_phone);
  if not found then
    return jsonb_build_object('customer', null, 'recommendations', public.pos_recommendations(null, p_cart));
  end if;
  return jsonb_build_object(
    'customer', to_jsonb(v_c),
    'stats', (select jsonb_build_object('visits', count(*), 'spend', coalesce(sum(total), 0), 'last_visit', max(sold_at))
              from public.pos_sales where customer_id = v_c.id and status = 'completed'),
    'recent', coalesce((
      select jsonb_agg(x order by x.sold_at desc) from (
        select s.id, s.sale_no, s.sold_at, s.total,
               (select string_agg(i.product_name || ' ×' || trim(to_char(i.qty, 'FM999990.###')), ', ' order by i.line_no)
                from public.pos_sale_items i where i.sale_id = s.id) as items
        from public.pos_sales s where s.customer_id = v_c.id and s.status = 'completed'
        order by s.sold_at desc limit 5) x), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(x) from (
        select i.product_id, max(i.product_name) as name, sum(i.qty) as qty
        from public.pos_sale_items i join public.pos_sales s on s.id = i.sale_id
        where s.customer_id = v_c.id and s.status = 'completed'
        group by i.product_id order by sum(i.qty) desc limit 5) x), '[]'::jsonb),
    'recommendations', public.pos_recommendations(v_c.id, p_cart)
  );
end;
$$;

create or replace function public.pos_recommendations(p_customer_id uuid, p_cart uuid[] default '{}')
returns jsonb
language sql stable security definer set search_path = public
as $$
  with cart as (select unnest(coalesce(p_cart, '{}'::uuid[])) as product_id),
  together as (
    select b.product_id, count(distinct a.sale_id) as score, 'Sering dibeli bersama item di keranjang' as reason, 1 as rank
    from public.pos_sale_items a
    join public.pos_sale_items b on b.sale_id = a.sale_id and b.product_id <> a.product_id
    where a.product_id in (select product_id from cart)
      and b.product_id not in (select product_id from cart)
    group by b.product_id
  ),
  favorites as (
    select i.product_id, sum(i.qty) as score, 'Favorit pelanggan ini' as reason, 0 as rank
    from public.pos_sale_items i join public.pos_sales s on s.id = i.sale_id
    where p_customer_id is not null and s.customer_id = p_customer_id and s.status = 'completed'
      and i.product_id not in (select product_id from cart)
    group by i.product_id
  ),
  ranked as (
    select distinct on (product_id) product_id, reason, rank, score
    from (select * from favorites union all select * from together) u
    order by product_id, rank, score desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'price', p.price, 'reason', r.reason)
         order by r.rank, r.score desc), '[]'::jsonb)
  from (select * from ranked order by rank, score desc limit 4) r
  join public.products p on p.id = r.product_id and p.is_active;
$$;

create or replace function public.update_profile_contact(p_user_id uuid, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if p_user_id <> auth.uid() and not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'Tidak berwenang mengubah kontak pengguna lain';
  end if;
  update public.profiles set phone = public.normalize_phone(p_phone) where id = p_user_id returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers (notifications tidak diaudit karena memuat kode OTP)
-- ---------------------------------------------------------------------------
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.audit_trigger();
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_trigger();
create trigger audit_promotions after insert or update or delete on public.promotions
  for each row execute function public.audit_trigger();
create trigger audit_pos_sales after insert or update or delete on public.pos_sales
  for each row execute function public.audit_trigger();
create trigger audit_pos_returns after insert or update or delete on public.pos_returns
  for each row execute function public.audit_trigger();
create trigger audit_pos_shifts after insert or update or delete on public.pos_shifts
  for each row execute function public.audit_trigger();
create trigger audit_otp_requests after insert or update or delete on public.otp_requests
  for each row execute function public.audit_trigger();
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.point_ledger enable row level security;
alter table public.promotions enable row level security;
alter table public.otp_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.pos_shifts enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.pos_returns enable row level security;
alter table public.pos_return_items enable row level security;

create policy "settings_read" on public.app_settings for select to authenticated using (true);
create policy "settings_update" on public.app_settings for update to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

create policy "products_read" on public.products for select to authenticated using (true);
create policy "products_insert" on public.products for insert to authenticated
  with check (public.has_role(array['admin', 'manager', 'accountant']::public.app_role[]));
create policy "products_update" on public.products for update to authenticated
  using (public.has_role(array['admin', 'manager', 'accountant']::public.app_role[]))
  with check (public.has_role(array['admin', 'manager', 'accountant']::public.app_role[]));

create policy "stock_read" on public.stock_movements for select to authenticated using (true);

create policy "customers_read" on public.customers for select to authenticated using (true);
create policy "customers_insert" on public.customers for insert to authenticated
  with check (public.has_role(array['admin', 'manager', 'cashier', 'accountant']::public.app_role[]));
create policy "customers_update" on public.customers for update to authenticated
  using (public.has_role(array['admin', 'manager', 'cashier', 'accountant']::public.app_role[]))
  with check (public.has_role(array['admin', 'manager', 'cashier', 'accountant']::public.app_role[]));

create policy "points_read" on public.point_ledger for select to authenticated using (true);

create policy "promotions_read" on public.promotions for select to authenticated using (true);
create policy "promotions_insert" on public.promotions for insert to authenticated
  with check (public.has_role(array['admin', 'manager']::public.app_role[]));
create policy "promotions_update" on public.promotions for update to authenticated
  using (public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (public.has_role(array['admin', 'manager']::public.app_role[]));
create policy "promotions_delete" on public.promotions for delete to authenticated
  using (public.has_role(array['admin', 'manager']::public.app_role[]));

create policy "otp_read" on public.otp_requests for select to authenticated
  using (requested_by = auth.uid() or approver_id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

create policy "notifications_read" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "shifts_read" on public.pos_shifts for select to authenticated using (true);
create policy "sales_read" on public.pos_sales for select to authenticated using (true);
create policy "sale_items_read" on public.pos_sale_items for select to authenticated using (true);
create policy "returns_read" on public.pos_returns for select to authenticated using (true);
create policy "return_items_read" on public.pos_return_items for select to authenticated using (true);

revoke insert, update, delete on public.stock_movements, public.point_ledger, public.otp_requests,
  public.notifications, public.pos_shifts, public.pos_sales, public.pos_sale_items,
  public.pos_returns, public.pos_return_items from anon, authenticated;
revoke insert, delete on public.app_settings from anon, authenticated;
revoke delete on public.products, public.customers from anon, authenticated;
revoke all on public.products, public.customers, public.promotions, public.app_settings from anon;

-- ---------------------------------------------------------------------------
-- Hak eksekusi fungsi
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.receive_stock(date, text, text, text, jsonb)',
    'public.pos_price_cart(jsonb, timestamptz)',
    'public.request_otp(text, uuid, jsonb)',
    'public.verify_otp(uuid, text)',
    'public.pos_open_shift(numeric, text)',
    'public.pos_shift_summary(uuid)',
    'public.pos_close_shift(numeric, text)',
    'public.pos_submit_sale(jsonb)',
    'public.pos_void_sale(uuid, uuid, text)',
    'public.pos_return_sale(uuid, jsonb, uuid, text, text)',
    'public.pos_set_fulfillment(uuid, text)',
    'public.pos_customer_insight(text, uuid[])',
    'public.pos_recommendations(uuid, uuid[])',
    'public.update_profile_contact(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke execute on all functions in schema private from public;

-- ---------------------------------------------------------------------------
-- Konfigurasi provider notifikasi OTP oleh admin (write-only; nilai tidak pernah dibaca balik)
-- ---------------------------------------------------------------------------
create or replace function public.set_notification_secret(p_key text, p_value text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'Hanya admin yang dapat mengatur provider notifikasi';
  end if;
  if p_key not in ('wa_api_url', 'wa_api_token', 'resend_api_key', 'email_from') then
    raise exception 'Kunci konfigurasi tidak dikenal';
  end if;
  if coalesce(trim(p_value), '') = '' then
    delete from private.secrets where key = p_key;
  else
    insert into private.secrets (key, value) values (p_key, trim(p_value))
    on conflict (key) do update set value = excluded.value;
  end if;
  perform public.log_event('SET_SECRET', 'secrets', p_key, case when coalesce(trim(p_value), '') = '' then 'dihapus' else 'diperbarui' end);
end;
$$;

create or replace function public.notification_config_status()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'whatsapp', exists (select 1 from private.secrets where key = 'wa_api_token'),
    'wa_custom_url', exists (select 1 from private.secrets where key = 'wa_api_url'),
    'email', exists (select 1 from private.secrets where key = 'resend_api_key'),
    'email_from', exists (select 1 from private.secrets where key = 'email_from'),
    'pg_net', exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                      where s.nspname = 'net' and p.proname = 'http_post')
  ) where public.has_role(array['admin']::public.app_role[]);
$$;

revoke execute on function public.set_notification_secret(text, text) from public, anon;
grant execute on function public.set_notification_secret(text, text) to authenticated;
revoke execute on function public.notification_config_status() from public, anon;
grant execute on function public.notification_config_status() to authenticated;

-- Manajer dapat membaca audit trail (aksi POS, OTP, void, retur).
drop policy if exists "audit_read" on public.audit_log;
create policy "audit_read" on public.audit_log for select to authenticated
  using (public.has_role(array['admin', 'accountant', 'manager']::public.app_role[]));
