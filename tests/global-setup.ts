import "dotenv/config";
import postgres from "postgres";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wms_test";
  process.env.DATABASE_URL = url;
  const sql = postgres(url, { onnotice: () => {} });
  await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
  await sql.end();
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db, closeDb } = await import("../src/server/db");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const { seedDatabase } = await import("../src/server/seed");
  await seedDatabase({ withDemoTransactions: false });
  await closeDb();
}
