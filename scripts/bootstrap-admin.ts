import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { connectDatabase } from "../db";
import { bootstrapAdmin } from "../server/auth/bootstrap";
import { ServiceError } from "../server/services/errors";
import { databaseTarget } from "./database-target";

async function readPassword() {
  const piped = process.argv.includes("--password-stdin");
  if (piped === Boolean(process.stdin.isTTY)) throw new Error("Gunakan terminal, atau pipa dengan --password-stdin.");
  const settings = piped ? undefined : execFileSync("stty", ["-g"], { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" }).trim();
  function restore() {
    if (settings) {
      execFileSync("stty", [settings], { stdio: "inherit" });
      process.stderr.write("\n");
    }
  }
  function interrupt() {
    restore();
    process.exit(130);
  }
  if (settings) {
    process.stderr.write("Kata sandi Administrator: ");
    execFileSync("stty", ["-echo"], { stdio: "inherit" });
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
  }
  const reader = createInterface({ input: process.stdin, terminal: false });
  try {
    const first = await reader[Symbol.asyncIterator]().next();
    return first.value as string | undefined;
  } finally {
    reader.close();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    restore();
  }
}

async function main() {
  const url = databaseTarget();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  if (!email || !name) throw new ServiceError("invalid", "Atur BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_NAME.");
  const password = await readPassword();
  const { client, db } = connectDatabase(url);
  try {
    await bootstrapAdmin(db, { email, name, password });
    console.log("Administrator pertama berhasil dibuat.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ServiceError ? error.message : "Bootstrap gagal. Periksa konfigurasi, migrasi, dan terminal.");
  process.exitCode = 1;
});
