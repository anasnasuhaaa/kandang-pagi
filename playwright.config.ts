import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./tests/integration/test-database";

const port = 3071;
const baseURL = `http://127.0.0.1:${port}`;
const url = testDatabaseUrl();

process.env.BETTER_AUTH_URL = baseURL;
process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  use: { baseURL },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    env: { DATABASE_URL: url, DATABASE_TARGET: "test", VERCEL: "0" },
    timeout: 60_000,
  },
});
