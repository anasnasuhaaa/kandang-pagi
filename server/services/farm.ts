import { and, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database, Transaction } from "../../db";
import { barns, farmEvents } from "../../db/schema";
import { jakartaStart } from "../../lib/format";
import type { Role } from "../../lib/roles";
import { requireRole, type Actor } from "../auth/permissions";
import { ServiceError } from "./errors";
import { lockScope, recordOnce, writeAudit } from "./transactions";

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

export const farmEventOrder = sql<bigint>`coalesce(${farmEvents.effectiveSequence}, ${farmEvents.sequence})`;

export async function postFarmEvent(tx: Transaction, actor: Actor, event: {
  kind: typeof farmEvents.$inferInsert.kind; date: string; requestKey: string; note?: string; reversesId?: string; replacesId?: string; effectiveSequence?: bigint;
}) {
  const [row] = await tx.insert(farmEvents).values({
    kind: event.kind, businessDate: event.date, occurredAt: jakartaStart(event.date), actorId: actor.id,
    requestKey: event.requestKey, note: event.note, reversesId: event.reversesId, replacesId: event.replacesId, effectiveSequence: event.effectiveSequence,
  }).returning();
  return row;
}

export function parseInput<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("invalid", result.error.issues[0].message);
  return result.data;
}

export async function farmCommand<T extends { requestKey: string; businessDate: string; note: string }>(
  headers: Headers, roles: readonly Role[], db: Database, kind: typeof farmEvents.$inferInsert.kind, input: T,
  operation: (tx: Transaction, actor: Actor, event: typeof farmEvents.$inferSelect, input: T) => Promise<void>,
) {
  return farmWrite(headers, roles, db, async (tx, actor) => recordOnce(
    tx, { actorId: actor.id, command: kind, requestKey: input.requestKey }, input,
    async () => {
      const event = await postFarmEvent(tx, actor, { kind, date: input.businessDate, requestKey: input.requestKey, note: input.note });
      await operation(tx, actor, event, input);
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, entity: "farm_event", entityId: event.id, action: kind, businessDate: event.businessDate, reason: input.note });
      return event.id;
    },
  ));
}

export async function assertActiveBarn(store: Store, barnId: string) {
  const [barn] = await store.select({ id: barns.id }).from(barns).where(and(eq(barns.id, barnId), eq(barns.active, true)));
  if (!barn) throw new ServiceError("invalid", "Pilih kandang yang aktif.");
  return barn.id;
}
