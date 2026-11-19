import { eq, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database, Transaction } from "../../db";
import { farmEvents } from "../../db/schema";
import { jakartaStart } from "../../lib/format";
import type { Role } from "../../lib/roles";
import { requireRole, type Actor } from "../auth/permissions";
import { ServiceError } from "./errors";
import { lockScope } from "./transactions";

export type Store = Database | Transaction;
export const farmReaders: readonly Role[] = ["administrator", "pemilik", "abk"];
export const farmOperators: readonly Role[] = ["administrator", "abk"];

export async function farmWrite<T>(headers: Headers, roles: readonly Role[], db: Database, operation: (tx: Transaction, actor: Actor) => Promise<T>) {
  return db.transaction(async (tx) => {
    await lockScope(tx, "farm-ledger");
    return operation(tx, await requireRole(headers, roles, tx));
  });
}

export function isEffective(store: Store) {
  const cancellation = alias(farmEvents, "reversal");
  return notExists(store.select({ id: cancellation.id }).from(cancellation).where(eq(cancellation.reversesId, farmEvents.id)));
}

export async function postFarmEvent(tx: Transaction, actor: Actor, event: {
  kind: typeof farmEvents.$inferInsert.kind; date: string; requestKey: string; note?: string; reversesId?: string;
}) {
  const [row] = await tx.insert(farmEvents).values({
    kind: event.kind, businessDate: event.date, occurredAt: jakartaStart(event.date), actorId: actor.id,
    requestKey: event.requestKey, note: event.note, reversesId: event.reversesId,
  }).returning();
  return row;
}

export function parseInput<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("invalid", result.error.issues[0].message);
  return result.data;
}

