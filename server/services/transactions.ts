import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "../../db";
import { auditEvents, idempotency } from "../../db/schema";
import { ServiceError } from "./errors";

export async function lockScope(tx: Transaction, scope: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kandang-pagi:${scope}`}, 0))`);
}

export async function writeAudit(tx: Transaction, entry: typeof auditEvents.$inferInsert) {
  await tx.insert(auditEvents).values(entry);
}

export async function recordOnce(
  tx: Transaction,
  identity: { actorId: string; command: string; requestKey: string },
  normalizedInput: unknown,
  operation: () => Promise<string>,
) {
  const payload = JSON.stringify(normalizedInput, (_, value: unknown) => typeof value === "bigint" ? value.toString() : value);
  const fingerprint = createHash("sha256").update(payload).digest("hex");
  const [inserted] = await tx.insert(idempotency).values({ ...identity, fingerprint })
    .onConflictDoNothing().returning({ key: idempotency.requestKey });
  const where = and(eq(idempotency.actorId, identity.actorId), eq(idempotency.command, identity.command), eq(idempotency.requestKey, identity.requestKey));
  if (!inserted) {
    const [record] = await tx.select().from(idempotency).where(where);
    if (!record?.resultId || record.fingerprint !== fingerprint) {
      throw new ServiceError("conflict", "Permintaan ini sudah digunakan dengan data berbeda.");
    }
    return { id: record.resultId, replay: true };
  }
  const id = await operation();
  await tx.update(idempotency).set({ resultId: id }).where(where);
  return { id, replay: false };
}
