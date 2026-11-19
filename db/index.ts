import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tables from "./schema";

export function connectDatabase(url: string) {
  const uri = new URL(url);
  const schema = uri.searchParams.get("schema");
  if (schema && schema !== "public") throw new Error("Koneksi Kandang Pagi menggunakan skema public.");
  uri.searchParams.delete("schema");
  const client = postgres(uri.toString(), { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return { client, db: drizzle(client, { schema: tables }) };
}

let connection: ReturnType<typeof connectDatabase> | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum dikonfigurasi.");
  connection ??= connectDatabase(url);
  return connection.db;
}

export type Database = ReturnType<typeof database>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
