import "dotenv/config";
import { closeDb } from "../src/server/db";
import { seedDatabase } from "../src/server/seed";

const withDemo = !process.argv.includes("--no-demo");

seedDatabase({ withDemoTransactions: withDemo })
  .then(async (res) => {
    console.log(res.skipped ? "• Data sudah ada, seed dilewati" : "✓ Seed data selesai");
    if (!res.skipped) {
      console.log("\nLogin demo (password: Password123):");
      for (const u of res.users) console.log(`  ${u.username.padEnd(16)} ${u.role}`);
    }
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
