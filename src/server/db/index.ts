import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** Transaction handle — memiliki API query yang sama dengan Database */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __wmsDb?: Database; __wmsSql?: postgres.Sql };

function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset. Lihat .env.example");
  const client = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    // Supabase connection pooler (transaction mode, port 6543) tidak mendukung prepared statement
    prepare: process.env.DB_PREPARE === "true",
    // numeric dikembalikan sebagai string oleh driver; Drizzle mode "number" yang mengonversi
    onnotice: () => {},
  });
  globalForDb.__wmsSql = client;
  return drizzle(client, { schema, casing: undefined });
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    if (!globalForDb.__wmsDb) globalForDb.__wmsDb = createDb();
    const value = Reflect.get(globalForDb.__wmsDb, prop);
    return typeof value === "function" ? value.bind(globalForDb.__wmsDb) : value;
  },
});

export async function closeDb() {
  if (globalForDb.__wmsSql) await globalForDb.__wmsSql.end({ timeout: 5 });
  globalForDb.__wmsDb = undefined;
  globalForDb.__wmsSql = undefined;
}

export { schema };
