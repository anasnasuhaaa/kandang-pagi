import { randomBytes, randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "../../db";
import { bootstrapAdmin } from "../../server/auth/bootstrap";
import { testDatabaseUrl } from "../integration/test-database";

export default async function setup() {
  const email = `admin-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(20).toString("base64url");
  const { client, db } = connectDatabase(testDatabaseUrl());
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await bootstrapAdmin(db, { email, name: "Administrator uji", password });
    process.env.KANDANG_E2E_ADMIN_EMAIL = email;
    process.env.KANDANG_E2E_ADMIN_PASSWORD = password;
  } finally {
    await client.end();
  }
}
