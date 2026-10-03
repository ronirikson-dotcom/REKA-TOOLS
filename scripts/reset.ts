import "dotenv/config";
import postgres from "postgres";

/**
 * Menghapus seluruh tabel Workshop Management System (schema "wms") — HANYA untuk development.
 * Schema lain (mis. public milik aplikasi lain di project Supabase yang sama) tidak disentuh.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset");
  if (process.env.NODE_ENV === "production") throw new Error("db:reset tidak boleh dijalankan di production");
  const sql = postgres(url, { onnotice: () => {} });
  await sql.unsafe("drop schema if exists wms cascade;");
  await sql.end();
  console.log("✓ Schema wms dikosongkan");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
