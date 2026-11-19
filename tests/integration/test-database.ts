import { z } from "zod";

export function testDatabaseUrl() {
  const url = new URL(z.string().parse(process.env.TEST_DATABASE_URL));
  if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || !url.pathname.endsWith("_test")) {
    throw new Error("Gunakan TEST_DATABASE_URL yang menunjuk PostgreSQL lokal dengan nama berakhiran _test.");
  }
  return url.toString();
}
