import { existsSync } from "node:fs";
import { z } from "zod";

export function loadLocalEnvironment() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export function databaseTarget() {
  loadLocalEnvironment();
  const allowedFlags = z.tuple([]).or(z.tuple([z.literal("--production")]));
  const args = process.argv.slice(2).filter((arg) => arg !== "--password-stdin");
  if (!allowedFlags.safeParse(args).success) throw new Error("Argumen perintah basis data tidak valid.");
  const target = z.enum(["development", "test", "production"]).parse(process.env.DATABASE_TARGET);
  const url = new URL(process.env.DATABASE_URL ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname === "/") throw new Error("Konfigurasi basis data tidak valid.");
  if (args.includes("--production") !== (target === "production")) throw new Error("Target produksi memerlukan opsi eksplisit.");
  if ((target === "test" && (!loopback || !url.pathname.endsWith("_test"))) ||
      (target === "production" && loopback) ||
      (target !== "test" && url.pathname.endsWith("_test"))) {
    throw new Error("Target basis data dan koneksi tidak cocok.");
  }
  return url.toString();
}
