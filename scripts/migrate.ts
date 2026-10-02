import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "../src/server/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrasi database selesai");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
