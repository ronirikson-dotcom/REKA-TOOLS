-- OKABE CORE — Core Accounting Engine
-- Covers BRD: ACC-01 (CoA hierarkis), ACC-02 (tutup buku), ACC-03 (laporan),
-- aturan zero-sum / immutability / period lock, dan NFR-04 (audit trail).
-- Semua aturan dijaga di database, bukan hanya di tampilan.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
create type public.cash_flow_category as enum ('operating', 'investing', 'financing');
create type public.journal_status as enum ('draft', 'posted');
create type public.period_status as enum ('open', 'closed');
create type public.app_role as enum ('admin', 'accountant', 'viewer');

-- ---------------------------------------------------------------------------
-- Pengguna & peran
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = any (roles));
$$;

-- Pengguna pertama otomatis menjadi admin; berikutnya viewer sampai dinaikkan admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'viewer' else 'admin' end::public.app_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail (NFR-04): permanen, tidak bisa diubah/dihapus
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  ip_address text,
  action text not null,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  note text
);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create or replace function public.request_ip()
returns text
language sql stable
as $$
  with h as (select nullif(current_setting('request.headers', true), '')::json as j)
  select nullif(trim(split_part(
    coalesce(j ->> 'x-forwarded-for', j ->> 'x-real-ip', ''), ',', 1)), '')
  from h;
$$;

create or replace function public.log_event(
  p_action text, p_table text, p_record_id text, p_note text default null, p_data jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (user_id, user_email, ip_address, action, table_name, record_id, new_data, note)
  values (auth.uid(), auth.jwt() ->> 'email', public.request_ip(), p_action, p_table, p_record_id, p_data, p_note);
end;
$$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (user_id, user_email, ip_address, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    public.request_ip(),
    tg_op,
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit trail bersifat permanen dan tidak dapat diubah atau dihapus';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Chart of Accounts hierarkis (ACC-01)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-Za-z.\-]+$'),
  name text not null check (length(trim(name)) > 0),
  type public.account_type not null,
  parent_id uuid references public.accounts (id) on delete restrict,
  is_postable boolean not null default true,
  is_cash boolean not null default false,
  cash_flow_category public.cash_flow_category not null default 'operating',
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_parent_idx on public.accounts (parent_id);

create or replace function public.validate_account()
returns trigger
language plpgsql
as $$
declare
  v_parent public.accounts;
  v_cursor uuid;
  v_depth int := 0;
begin
  new.updated_at := now();

  if new.parent_id is not null then
    select * into v_parent from public.accounts where id = new.parent_id;
    if v_parent.type <> new.type then
      raise exception 'Tipe akun (%) harus sama dengan akun induk % (%)', new.type, v_parent.code, v_parent.type;
    end if;
    if v_parent.is_postable then
      raise exception 'Akun induk % adalah akun transaksi; hanya akun header yang boleh memiliki sub-akun', v_parent.code;
    end if;
    -- Cegah siklus parent-child
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception 'Struktur akun tidak boleh melingkar';
      end if;
      v_depth := v_depth + 1;
      if v_depth > 20 then
        raise exception 'Kedalaman hierarki akun maksimal 20 tingkat';
      end if;
      select parent_id into v_cursor from public.accounts where id = v_cursor;
    end loop;
  end if;

  if new.is_cash and not new.is_postable then
    raise exception 'Akun header tidak dapat ditandai sebagai akun kas/bank';
  end if;
  if new.is_cash and new.type <> 'asset' then
    raise exception 'Akun kas/bank harus bertipe Aset';
  end if;

  if tg_op = 'UPDATE' then
    if new.type <> old.type and exists (select 1 from public.journal_lines where account_id = new.id) then
      raise exception 'Tipe akun % tidak dapat diubah karena sudah memiliki transaksi', new.code;
    end if;
    if new.type <> old.type and exists (select 1 from public.accounts where parent_id = new.id) then
      raise exception 'Tipe akun % tidak dapat diubah karena memiliki sub-akun', new.code;
    end if;
    if not new.is_postable and old.is_postable
       and exists (select 1 from public.journal_lines where account_id = new.id) then
      raise exception 'Akun % sudah memiliki transaksi sehingga tidak dapat dijadikan header', new.code;
    end if;
    if new.is_postable and not old.is_postable
       and exists (select 1 from public.accounts where parent_id = new.id) then
      raise exception 'Akun % memiliki sub-akun sehingga harus tetap menjadi header', new.code;
    end if;
  end if;

  return new;
end;
$$;

create trigger accounts_validate before insert or update on public.accounts
  for each row execute function public.validate_account();

-- ---------------------------------------------------------------------------
-- Periode akuntansi (ACC-02)
-- ---------------------------------------------------------------------------
create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  status public.period_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- Membuat periode (status open) jika belum ada, lalu mengembalikan statusnya.
create or replace function public.ensure_period(p_date date)
returns public.period_status
language plpgsql security definer set search_path = public
as $$
declare
  v_status public.period_status;
begin
  insert into public.fiscal_periods (year, month)
  values (extract(year from p_date)::int, extract(month from p_date)::int)
  on conflict (year, month) do nothing;

  select status into v_status from public.fiscal_periods
  where year = extract(year from p_date)::int and month = extract(month from p_date)::int;
  return v_status;
end;
$$;

create or replace function public.assert_period_open(p_date date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.ensure_period(p_date) = 'closed' then
    raise exception 'Periode % sudah ditutup (Closed): transaksi tidak dapat ditambah, diubah, atau dihapus',
      to_char(p_date, 'MM/YYYY');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jurnal (double-entry)
-- ---------------------------------------------------------------------------
create sequence public.journal_entry_seq;

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  entry_date date not null,
  description text not null check (length(trim(description)) > 0),
  source_type text not null default 'manual',
  source_ref text,
  status public.journal_status not null default 'draft',
  reversal_of uuid unique references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid references auth.users (id),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_entries_date_idx on public.journal_entries (entry_date);
create index journal_entries_status_idx on public.journal_entries (status);
create index journal_entries_source_idx on public.journal_entries (source_type, source_ref);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_no int not null,
  account_id uuid not null references public.accounts (id) on delete restrict,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  memo text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);

create or replace function public.guard_journal_entry()
returns trigger
language plpgsql
as $$
declare
  v_lines int;
  v_debit numeric;
  v_credit numeric;
  v_bad text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Jurnal baru harus berstatus draft; gunakan fungsi posting';
    end if;
    perform public.assert_period_open(new.entry_date);
    new.entry_no := 'JU' || to_char(new.entry_date, 'YYMM') || '-'
                    || lpad(nextval('public.journal_entry_seq')::text, 5, '0');
    new.posted_at := null;
    new.posted_by := null;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Jurnal % sudah Posted dan tidak dapat dihapus; gunakan jurnal pembalik', old.entry_no;
    end if;
    perform public.assert_period_open(old.entry_date);
    return old;
  end if;

  -- UPDATE
  if old.status = 'posted' then
    raise exception 'Jurnal % sudah Posted dan tidak dapat diubah; gunakan jurnal pembalik', old.entry_no;
  end if;
  perform public.assert_period_open(old.entry_date);
  perform public.assert_period_open(new.entry_date);

  new.entry_no := old.entry_no;
  new.reversal_of := old.reversal_of;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.status = 'posted' then
    -- Zero-sum validation
    select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_lines, v_debit, v_credit
    from public.journal_lines where entry_id = new.id;

    if v_lines < 2 then
      raise exception 'Jurnal minimal memiliki 2 baris';
    end if;
    if v_debit <> v_credit then
      raise exception 'Jurnal tidak seimbang: total Debit % ≠ total Kredit %', v_debit, v_credit;
    end if;
    if v_debit = 0 then
      raise exception 'Total jurnal tidak boleh nol';
    end if;

    select string_agg(a.code, ', ') into v_bad
    from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.entry_id = new.id and (not a.is_active or not a.is_postable);
    if v_bad is not null then
      raise exception 'Akun berikut tidak aktif atau bukan akun transaksi: %', v_bad;
    end if;

    new.posted_at := now();
    new.posted_by := auth.uid();
  else
    new.posted_at := null;
    new.posted_by := null;
  end if;

  return new;
end;
$$;

create trigger journal_entries_guard before insert or update or delete on public.journal_entries
  for each row execute function public.guard_journal_entry();

create or replace function public.guard_journal_line()
returns trigger
language plpgsql
as $$
declare
  v_entry public.journal_entries;
  v_account public.accounts;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select * into v_entry from public.journal_entries where id = old.entry_id;
    -- Jika induk tidak ditemukan, baris sedang dihapus via cascade dari jurnal draft yang sudah divalidasi.
    if found then
      if v_entry.status = 'posted' then
        raise exception 'Baris jurnal % tidak dapat diubah/dihapus karena jurnal sudah Posted', v_entry.entry_no;
      end if;
      perform public.assert_period_open(v_entry.entry_date);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select * into v_entry from public.journal_entries where id = new.entry_id;
    if v_entry.status = 'posted' then
      raise exception 'Baris tidak dapat ditambahkan ke jurnal % yang sudah Posted', v_entry.entry_no;
    end if;
    perform public.assert_period_open(v_entry.entry_date);

    select * into v_account from public.accounts where id = new.account_id;
    if not v_account.is_postable then
      raise exception 'Akun % adalah akun header dan tidak dapat digunakan dalam jurnal', v_account.code;
    end if;
    return new;
  end if;

  return old;
end;
$$;

create trigger journal_lines_guard before insert or update or delete on public.journal_lines
  for each row execute function public.guard_journal_line();

-- ---------------------------------------------------------------------------
-- Fungsi bisnis (RPC)
-- ---------------------------------------------------------------------------
create or replace function public.post_journal(p_entry_id uuid)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_entry public.journal_entries;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin atau akuntan yang dapat mem-posting jurnal';
  end if;
  update public.journal_entries set status = 'posted' where id = p_entry_id and status = 'draft'
  returning * into v_entry;
  if not found then
    raise exception 'Jurnal tidak ditemukan atau sudah Posted';
  end if;
  perform public.log_event('POST_JOURNAL', 'journal_entries', v_entry.id::text, v_entry.entry_no);
  return v_entry;
end;
$$;

-- Simpan jurnal lengkap (header + baris) dalam satu transaksi.
-- p_lines: [{"account_id": uuid, "debit": n, "credit": n, "memo": text}, ...]
create or replace function public.save_journal(
  p_entry_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_post boolean default false,
  p_source_ref text default null
)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_line jsonb;
  v_no int := 0;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin atau akuntan yang dapat membuat jurnal';
  end if;

  if p_entry_id is null then
    insert into public.journal_entries (entry_date, description, source_type, source_ref)
    values (p_entry_date, p_description, 'manual', p_source_ref)
    returning * into v_entry;
  else
    update public.journal_entries
      set entry_date = p_entry_date, description = p_description, source_ref = p_source_ref
    where id = p_entry_id
    returning * into v_entry;
    if not found then
      raise exception 'Jurnal tidak ditemukan';
    end if;
    delete from public.journal_lines where entry_id = v_entry.id;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, memo)
    values (
      v_entry.id,
      v_no,
      (v_line ->> 'account_id')::uuid,
      round(coalesce((v_line ->> 'debit')::numeric, 0), 2),
      round(coalesce((v_line ->> 'credit')::numeric, 0), 2),
      nullif(trim(v_line ->> 'memo'), '')
    );
  end loop;

  if p_post then
    v_entry := public.post_journal(v_entry.id);
  end if;
  return v_entry;
end;
$$;

-- Jurnal pembalik: satu-satunya cara mengoreksi jurnal Posted.
create or replace function public.reverse_journal(
  p_entry_id uuid, p_reason text, p_date date default null
)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_orig public.journal_entries;
  v_new public.journal_entries;
  v_date date;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin atau akuntan yang dapat membuat jurnal pembalik';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan pembalikan wajib diisi';
  end if;

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

  -- Default: tanggal jurnal asli bila periodenya masih open, selain itu hari ini.
  v_date := coalesce(
    p_date,
    case when public.ensure_period(v_orig.entry_date) = 'open' then v_orig.entry_date else current_date end
  );

  insert into public.journal_entries (entry_date, description, source_type, source_ref, reversal_of)
  values (v_date, 'Pembalik ' || v_orig.entry_no || ': ' || p_reason, 'reversal', v_orig.entry_no, v_orig.id)
  returning * into v_new;

  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, memo)
  select v_new.id, line_no, account_id, credit, debit, memo
  from public.journal_lines where entry_id = v_orig.id;

  update public.journal_entries set status = 'posted' where id = v_new.id returning * into v_new;

  perform public.log_event('REVERSE_JOURNAL', 'journal_entries', v_orig.id::text,
    v_orig.entry_no || ' dibalik oleh ' || v_new.entry_no || ': ' || p_reason);
  return v_new;
end;
$$;

-- Titik integrasi untuk modul lain (POS, Purchase, Sales, Asset):
-- membentuk dan mem-posting jurnal otomatis berdasarkan kode akun.
-- p_lines: [{"account_code": "1110", "debit": n, "credit": n, "memo": text}, ...]
create or replace function public.create_auto_journal(
  p_source_type text, p_source_ref text, p_entry_date date, p_description text, p_lines jsonb
)
returns public.journal_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_line jsonb;
  v_account_id uuid;
  v_no int := 0;
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Tidak berwenang membuat jurnal otomatis';
  end if;
  if coalesce(p_source_type, '') in ('', 'manual', 'reversal') then
    raise exception 'source_type jurnal otomatis tidak valid';
  end if;

  insert into public.journal_entries (entry_date, description, source_type, source_ref)
  values (p_entry_date, p_description, p_source_type, p_source_ref)
  returning * into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    select id into v_account_id from public.accounts where code = v_line ->> 'account_code';
    if v_account_id is null then
      raise exception 'Kode akun % tidak ditemukan', v_line ->> 'account_code';
    end if;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, memo)
    values (
      v_entry.id, v_no, v_account_id,
      round(coalesce((v_line ->> 'debit')::numeric, 0), 2),
      round(coalesce((v_line ->> 'credit')::numeric, 0), 2),
      v_line ->> 'memo'
    );
  end loop;

  update public.journal_entries set status = 'posted' where id = v_entry.id returning * into v_entry;
  perform public.log_event('AUTO_JOURNAL', 'journal_entries', v_entry.id::text,
    p_source_type || ' ' || coalesce(p_source_ref, '') || ' → ' || v_entry.entry_no);
  return v_entry;
end;
$$;

-- Tutup buku bulanan
create or replace function public.close_period(p_year int, p_month int)
returns public.fiscal_periods
language plpgsql security definer set search_path = public
as $$
declare
  v_period public.fiscal_periods;
  v_drafts int;
  v_start date := make_date(p_year, p_month, 1);
begin
  if not public.has_role(array['admin', 'accountant']::public.app_role[]) then
    raise exception 'Hanya admin atau akuntan yang dapat menutup periode';
  end if;
  perform public.ensure_period(v_start);

  if exists (
    select 1 from public.fiscal_periods
    where status = 'open' and make_date(year, month, 1) < v_start
  ) then
    raise exception 'Periode sebelumnya masih open; tutup periode secara berurutan';
  end if;

  select count(*) into v_drafts from public.journal_entries
  where status = 'draft' and entry_date >= v_start and entry_date < v_start + interval '1 month';
  if v_drafts > 0 then
    raise exception 'Masih ada % jurnal draft pada periode ini; posting atau hapus terlebih dahulu', v_drafts;
  end if;

  update public.fiscal_periods set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where year = p_year and month = p_month and status = 'open'
  returning * into v_period;
  if not found then
    raise exception 'Periode sudah ditutup';
  end if;

  perform public.log_event('CLOSE_PERIOD', 'fiscal_periods', v_period.id::text, to_char(v_start, 'MM/YYYY'));
  return v_period;
end;
$$;

-- Buka kembali periode: hanya admin, hanya periode tertutup terakhir, wajib alasan.
create or replace function public.reopen_period(p_year int, p_month int, p_reason text)
returns public.fiscal_periods
language plpgsql security definer set search_path = public
as $$
declare
  v_period public.fiscal_periods;
  v_start date := make_date(p_year, p_month, 1);
begin
  if not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'Hanya admin yang dapat membuka kembali periode';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan membuka kembali periode wajib diisi';
  end if;
  if exists (
    select 1 from public.fiscal_periods
    where status = 'closed' and make_date(year, month, 1) > v_start
  ) then
    raise exception 'Periode setelahnya sudah ditutup; buka kembali dari periode terakhir';
  end if;

  update public.fiscal_periods set status = 'open', closed_at = null, closed_by = null
  where year = p_year and month = p_month and status = 'closed'
  returning * into v_period;
  if not found then
    raise exception 'Periode tidak ditemukan atau masih open';
  end if;

  perform public.log_event('REOPEN_PERIOD', 'fiscal_periods', v_period.id::text,
    to_char(v_start, 'MM/YYYY') || ': ' || p_reason);
  return v_period;
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'Hanya admin yang dapat mengubah peran pengguna';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Admin tidak dapat menurunkan perannya sendiri';
  end if;
  update public.profiles set role = p_role where id = p_user_id returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Laporan (ACC-03) — hanya jurnal Posted
-- ---------------------------------------------------------------------------

-- Saldo per akun: saldo awal (sebelum p_from), mutasi debit/kredit periode.
-- Nilai saldo bertanda debit-positif; tampilan menyesuaikan saldo normal.
create or replace function public.account_activity(p_from date, p_to date)
returns table (
  account_id uuid,
  opening numeric,
  period_debit numeric,
  period_credit numeric
)
language sql stable
as $$
  select
    l.account_id,
    coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0) as opening,
    coalesce(sum(l.debit) filter (where e.entry_date >= p_from), 0) as period_debit,
    coalesce(sum(l.credit) filter (where e.entry_date >= p_from), 0) as period_credit
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  where e.status = 'posted' and e.entry_date <= p_to
  group by l.account_id;
$$;

-- Arus kas metode langsung: setiap baris non-kas pada jurnal yang menyentuh akun kas
-- dianggap sumber/penggunaan kas sebesar (kredit - debit), dikelompokkan per kategori akun lawan.
create or replace function public.cash_flow(p_from date, p_to date)
returns table (
  category public.cash_flow_category,
  account_id uuid,
  amount numeric
)
language sql stable
as $$
  with cash_entries as (
    select distinct l.entry_id
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    join public.accounts a on a.id = l.account_id
    where e.status = 'posted' and a.is_cash and e.entry_date between p_from and p_to
  )
  select a.cash_flow_category, a.id, sum(l.credit - l.debit)
  from cash_entries ce
  join public.journal_lines l on l.entry_id = ce.entry_id
  join public.accounts a on a.id = l.account_id and not a.is_cash
  group by a.cash_flow_category, a.id
  having sum(l.credit - l.debit) <> 0;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
create trigger audit_accounts after insert or update or delete on public.accounts
  for each row execute function public.audit_trigger();
create trigger audit_fiscal_periods after insert or update or delete on public.fiscal_periods
  for each row execute function public.audit_trigger();
create trigger audit_journal_entries after insert or update or delete on public.journal_entries
  for each row execute function public.audit_trigger();
create trigger audit_journal_lines after insert or update or delete on public.journal_lines
  for each row execute function public.audit_trigger();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_read" on public.profiles for select to authenticated using (true);

create policy "accounts_read" on public.accounts for select to authenticated using (true);
create policy "accounts_insert" on public.accounts for insert to authenticated
  with check (public.has_role(array['admin', 'accountant']::public.app_role[]));
create policy "accounts_update" on public.accounts for update to authenticated
  using (public.has_role(array['admin', 'accountant']::public.app_role[]))
  with check (public.has_role(array['admin', 'accountant']::public.app_role[]));
create policy "accounts_delete" on public.accounts for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

create policy "periods_read" on public.fiscal_periods for select to authenticated using (true);

create policy "entries_read" on public.journal_entries for select to authenticated using (true);
create policy "entries_delete" on public.journal_entries for delete to authenticated
  using (status = 'draft' and public.has_role(array['admin', 'accountant']::public.app_role[]));

create policy "lines_read" on public.journal_lines for select to authenticated using (true);

create policy "audit_read" on public.audit_log for select to authenticated
  using (public.has_role(array['admin', 'accountant']::public.app_role[]));

-- Penulisan jurnal & periode hanya melalui fungsi RPC di atas.
revoke insert, update on public.journal_entries from anon, authenticated;
revoke insert, update, delete on public.journal_lines from anon, authenticated;
revoke insert, update, delete on public.fiscal_periods from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Fungsi internal tidak boleh dipanggil langsung dari API.
revoke execute on function public.log_event(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ensure_period(date) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_trigger() from public, anon, authenticated;

-- Fungsi RPC hanya untuk pengguna login.
revoke execute on function public.post_journal(uuid) from public, anon;
revoke execute on function public.save_journal(uuid, date, text, jsonb, boolean, text) from public, anon;
revoke execute on function public.reverse_journal(uuid, text, date) from public, anon;
revoke execute on function public.create_auto_journal(text, text, date, text, jsonb) from public, anon;
revoke execute on function public.close_period(int, int) from public, anon;
revoke execute on function public.reopen_period(int, int, text) from public, anon;
revoke execute on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke execute on function public.account_activity(date, date) from public, anon;
revoke execute on function public.cash_flow(date, date) from public, anon;
grant execute on function public.post_journal(uuid) to authenticated;
grant execute on function public.save_journal(uuid, date, text, jsonb, boolean, text) to authenticated;
grant execute on function public.reverse_journal(uuid, text, date) to authenticated;
grant execute on function public.create_auto_journal(text, text, date, text, jsonb) to authenticated;
grant execute on function public.close_period(int, int) to authenticated;
grant execute on function public.reopen_period(int, int, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.account_activity(date, date) to authenticated;
grant execute on function public.cash_flow(date, date) to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;
grant execute on function public.assert_period_open(date) to authenticated;
