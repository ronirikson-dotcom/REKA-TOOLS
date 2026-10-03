import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Hanya kelola schema "wms" — tabel aplikasi lain di project yang sama tidak disentuh
  schemaFilter: ["wms"],
  migrations: { schema: "wms", table: "__drizzle_migrations" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wms" },
});
