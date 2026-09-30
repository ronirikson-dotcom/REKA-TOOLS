-- Hardening sesuai Supabase security advisor.
alter function public.request_ip() set search_path = public;
alter function public.audit_log_immutable() set search_path = public;
alter function public.validate_account() set search_path = public;
alter function public.guard_journal_entry() set search_path = public;
alter function public.guard_journal_line() set search_path = public;
alter function public.account_activity(date, date) set search_path = public;
alter function public.cash_flow(date, date) set search_path = public;

revoke execute on function public.has_role(public.app_role[]) from public, anon;
revoke execute on function public.assert_period_open(date) from public, anon;
