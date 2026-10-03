-- Bucket Supabase Storage untuk foto check-in & evidence approval WMS.
--
-- Jalankan sekali per project Supabase (SQL Editor atau `psql "$DATABASE_URL" -f supabase/storage.sql`).
-- Bucket privat tanpa policy: hanya server aplikasi (SUPABASE_SECRET_KEY / service_role) yang bisa
-- membaca & menulis; file ditampilkan ke user lewat route /api/files/:id yang mengecek login & perusahaan.
-- Nama bucket harus sama dengan env SUPABASE_STORAGE_BUCKET (default: wms-files). Aman dijalankan berulang.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wms-files', 'wms-files', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
