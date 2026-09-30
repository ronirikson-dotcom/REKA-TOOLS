-- Hardening sesuai Supabase security advisor.
alter function private.secret(text) set search_path = public;
alter function private.pos_setting(text) set search_path = public;
alter function private.mask(text) set search_path = public;
alter function private.pos_cash_account(text) set search_path = public;

-- pg_net dipindah ke skema extensions (fungsi tetap di skema net).
do $$ begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
exception when others then
  raise notice 'pg_net tidak dipindahkan: %', sqlerrm;
end $$;
