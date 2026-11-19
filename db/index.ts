import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function connectDatabase(url: string) {
  const client = postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return { client, db: drizzle(client, { schema }) };
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
