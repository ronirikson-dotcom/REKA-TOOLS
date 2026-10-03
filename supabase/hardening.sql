-- Hardening schema `wms` untuk project Supabase.
--
-- Jalankan sekali setelah `npm run db:migrate` (dan setiap kali ada migrasi yang menambah tabel):
--   psql "$DATABASE_URL" -f supabase/hardening.sql      -- atau tempel di Supabase SQL Editor
--
-- Efek:
--   * RLS aktif di semua tabel `wms` tanpa policy  -> Data API (anon / authenticated) tidak bisa membaca apa pun.
--   * Hak akses anon / authenticated / PUBLIC ke schema `wms` dicabut, termasuk untuk tabel baru.
-- Aplikasi tetap berjalan karena terhubung sebagai role `postgres` (pemilik tabel, BYPASSRLS);
-- otorisasi & scope cabang ditegakkan di service layer.
-- Aman dijalankan berulang kali. Hanya untuk Supabase (role anon / authenticated harus ada).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'wms' LOOP
    EXECUTE format('ALTER TABLE wms.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA wms FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA wms FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA wms FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wms FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA wms REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA wms REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA wms REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
