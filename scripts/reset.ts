import "dotenv/config";
import postgres from "postgres";

/** Menghapus seluruh tabel (HANYA untuk development). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset");
  if (process.env.NODE_ENV === "production") throw new Error("db:reset tidak boleh dijalankan di production");
  const sql = postgres(url, { onnotice: () => {} });
  await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
  await sql.end();
  console.log("✓ Database dikosongkan");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
