import "dotenv/config";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wms_test";
process.env.STORAGE_DIR = "./storage-test";
// Test memakai penyimpanan lokal; jangan pernah menulis ke Supabase Storage dari .env developer
for (const k of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL"]) delete process.env[k];
