import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "../db";
import { databaseTarget } from "./database-target";

async function main() {
  const { client, db } = connectDatabase(databaseTarget());
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    console.log("Migrasi selesai.");
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("Migrasi gagal. Periksa DATABASE_URL, DATABASE_TARGET, opsi perintah, dan hak akses migrasi.");
  process.exitCode = 1;
});
