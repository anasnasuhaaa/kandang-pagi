import { and, asc, desc, eq, inArray, lt, lte, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { database, type Database, type Transaction } from "../../db";
import { resellerCash, resellerEvents, resellerStock, resellerUnits } from "../../db/schema";
import {
  categories, InvalidConversion, resellerAdjustmentSchema, resellerCancelSchema, resellerCashOpeningSchema,
  resellerCashSchema, resellerSaleSchema, resellerStockAmount, resellerTransactionSchema, unitDefinitionSchema,
  type ResellerCategory,
} from "../../lib/domain/reseller";
import { jakartaStart } from "../../lib/format";
import { requireResellerSpace, type Actor } from "../auth/permissions";
import { ServiceError } from "./errors";
import { parseInput, type Store } from "./farm";
import { lockScope, recordOnce, writeAudit } from "./transactions";

type EventKind = typeof resellerEvents.$inferSelect.kind;
type Unit = typeof resellerUnits.$inferSelect;
type ResellerContext = { actor: Actor; spaceId: string };
const zero = BigInt(0);

function effective(store: Store) {
  const reversal = alias(resellerEvents, "reseller_reversal");
  return notExists(store.select({ id: reversal.id }).from(reversal).where(and(
    eq(reversal.spaceId, resellerEvents.spaceId), eq(reversal.reversesId, resellerEvents.id),
  )));
}

async function resellerWrite<T>(headers: Headers, db: Database, apply: (tx: Transaction, owner: ResellerContext) => Promise<T>) {
  return db.transaction(async (tx) => {
    const user = await requireResellerSpace(headers, tx);
    await lockScope(tx, `reseller:${user.spaceId}`);
    return apply(tx, await requireResellerSpace(headers, tx));
  });
}

async function event(tx: Transaction, owner: ResellerContext, row: {
  kind: EventKind; businessDate: string; requestKey: string; note: string; reversesId?: string;
}) {
  const [event] = await tx.insert(resellerEvents).values({
    ...row, actorId: owner.actor.id, spaceId: owner.spaceId, occurredAt: jakartaStart(row.businessDate),
  }).returning();
  return event;
}

async function resellerCommand<T extends { businessDate: string; requestKey: string; note: string }>(
  headers: Headers, db: Database, kind: EventKind, input: T,
  apply: (tx: Transaction, row: typeof resellerEvents.$inferSelect, data: T) => Promise<void>,
) {
  return resellerWrite(headers, db, async (tx, owner) => recordOnce(
    tx, { actorId: owner.actor.id, command: `reseller_${kind}`, requestKey: input.requestKey }, input, async () => {
      const row = await event(tx, owner, { kind, businessDate: input.businessDate, requestKey: input.requestKey, note: input.note });
      await apply(tx, row, input);
      await writeAudit(tx, { actorId: owner.actor.id, actorRole: owner.actor.role,
        spaceId: owner.spaceId, businessDate: row.businessDate, entity: "reseller_event", entityId: row.id, action: kind, reason: input.note });
      return row.id;
    },
  ));
}

async function stockProjection(store: Store, spaceId: string, end?: string) {
  const rows = await store.select({ category: resellerStock.category, delta: resellerStock.deltaPieces })
    .from(resellerStock).innerJoin(resellerEvents, and(eq(resellerEvents.id, resellerStock.id), eq(resellerEvents.spaceId, resellerStock.spaceId)))
    .where(and(eq(resellerStock.spaceId, spaceId), inArray(resellerEvents.kind, ["intake", "sale", "stock_opening", "stock_adjustment"]),
      effective(store), end ? lte(resellerEvents.businessDate, end) : undefined,
    )).orderBy(asc(resellerEvents.businessDate), asc(resellerEvents.sequence));
  const balances: Record<ResellerCategory, number> = { campur: 0, coklat: 0, putih: 0, cacat: 0 };
  for (const row of rows) {
    if (!categories.includes(row.category as ResellerCategory)) throw new ServiceError("invalid", "Kategori stok reseller tidak valid.");
    const category = row.category as ResellerCategory;
    balances[category] += row.delta;
    if (balances[category] < 0) throw new ServiceError("conflict", "Stok reseller tidak cukup pada salah satu tanggal dalam riwayat.");
    if (!Number.isSafeInteger(balances[category])) throw new ServiceError("conflict", "Jumlah stok reseller terlalu besar.");
  }
  return balances;
}

function currentUnits(units: Unit[]) {
  const latest = new Map<string, Unit>();
  for (const row of units) if (!latest.has(row.code)) latest.set(row.code, row);
  return [...latest.values()].filter(({ active }) => active);
}

export async function defineResellerUnit(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(unitDefinitionSchema, raw);
  return resellerWrite(headers, db, async (tx, owner) => recordOnce(
    tx, { actorId: owner.actor.id, command: "reseller_unit", requestKey: input.requestKey }, input, async () => {
      const [last] = await tx.select({ revision: resellerUnits.revision, count: resellerUnits.piecesPerUnit })
        .from(resellerUnits).where(and(eq(resellerUnits.spaceId, owner.spaceId), eq(resellerUnits.code, input.code)))
        .orderBy(desc(resellerUnits.revision)).limit(1);
      if (!last && input.status === "inactive") throw new ServiceError("invalid", "Tambahkan satuan aktif sebelum menonaktifkannya.");
      const [unit] = await tx.insert(resellerUnits).values({
        spaceId: owner.spaceId, code: input.code, name: input.name, effectiveDate: input.businessDate, revision: (last?.revision ?? 0) + 1,
        piecesPerUnit: input.piecesPerUnit, active: input.status === "active",
      }).returning();
      await writeAudit(tx, { actorId: owner.actor.id, actorRole: owner.actor.role, spaceId: owner.spaceId,
        businessDate: input.businessDate, entity: "reseller_unit", entityId: unit.id, action: "unit_version_created",
        before: last ? { factor: last.count } : undefined, after: { factor: unit.piecesPerUnit, code: unit.code, active: unit.active } });
      return unit.id;
    },
  ));
}

async function resolveUnit(store: Store, spaceId: string, id: string, date: string) {
  const [selected] = await store.select({ code: resellerUnits.code }).from(resellerUnits)
    .where(and(eq(resellerUnits.spaceId, spaceId), eq(resellerUnits.id, id)));
  if (!selected) throw new ServiceError("not-found", "Satuan reseller tidak ditemukan.");
  const [current] = await store.select().from(resellerUnits).where(and(
    eq(resellerUnits.spaceId, spaceId), eq(resellerUnits.code, selected.code), lte(resellerUnits.effectiveDate, date),
  )).orderBy(desc(resellerUnits.effectiveDate), desc(resellerUnits.revision)).limit(1);
  if (!current?.active) throw new ServiceError("invalid", "Satuan belum aktif pada tanggal transaksi.");
  return current;
}

export async function postResellerStock(headers: Headers, raw: unknown, kind: "intake" | "sale", db = database()) {
  const input = parseInput(kind === "sale" ? resellerSaleSchema : resellerTransactionSchema, raw);
  return resellerCommand(headers, db, kind, input, async (tx, row, data) => {
    const unit = data.unit === "packaging" ? await resolveUnit(tx, row.spaceId, data.unitId, row.businessDate) : null;
    let pieces: number;
    try {
      pieces = data.unit === "packaging" ? resellerStockAmount("packaging", data.unitCount, unit?.piecesPerUnit)
        : resellerStockAmount(data.unit, data.pieces, data.unit === "kg" ? data.weight : undefined);
    } catch (error) {
      if (error instanceof InvalidConversion) throw new ServiceError("invalid", error.message);
      throw error;
    }
    await tx.insert(resellerStock).values({
      id: row.id, spaceId: row.spaceId, category: data.category, deltaPieces: kind === "intake" ? pieces : -pieces,
      unit: data.unit, unitId: unit?.id, unitCount: data.unit === "packaging" ? data.unitCount : undefined,
      piecesPerUnit: unit?.piecesPerUnit, actualGrams: data.unit === "kg" ? data.weight : undefined,
    });
    if (data.amount > zero) await tx.insert(resellerCash).values({
      id: row.id, spaceId: row.spaceId, direction: kind === "sale" ? "income" : "expense",
      deltaIdr: kind === "sale" ? data.amount : -data.amount, category: kind === "sale" ? "Penjualan telur" : "Pembelian telur",
    });
    await stockProjection(tx, row.spaceId);
  });
}

export async function adjustResellerStock(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(resellerAdjustmentSchema, raw);
  const opening = input.mode === "opening";
  return resellerCommand(headers, db, opening ? "stock_opening" : "stock_adjustment", input, async (tx, row, data) => {
    if (opening) {
      const [previous] = await tx.select({ id: resellerStock.id }).from(resellerStock)
        .innerJoin(resellerEvents, and(eq(resellerEvents.id, resellerStock.id), eq(resellerEvents.spaceId, resellerStock.spaceId)))
        .where(and(eq(resellerStock.spaceId, row.spaceId), eq(resellerStock.category, data.category),
          lte(resellerEvents.businessDate, data.businessDate), effective(tx))).limit(1);
      if (previous) throw new ServiceError("conflict", "Saldo awal harus mendahului pergerakan pertama kategori ini.");
    }
    await tx.insert(resellerStock).values({
      id: row.id, spaceId: row.spaceId, category: data.category, unit: "pieces",
      deltaPieces: opening || data.direction === "increase" ? data.pieces : -data.pieces,
    });
    await stockProjection(tx, row.spaceId);
  });
}

export async function openResellerCash(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(resellerCashOpeningSchema, raw);
  return resellerCommand(headers, db, "cash_opening", input, async (tx, row, data) => {
    const [previous] = await tx.select({ id: resellerCash.id }).from(resellerCash)
      .innerJoin(resellerEvents, and(eq(resellerEvents.id, resellerCash.id), eq(resellerEvents.spaceId, resellerCash.spaceId)))
      .where(and(eq(resellerCash.spaceId, row.spaceId), eq(resellerCash.direction, "opening"), effective(tx))).limit(1);
    if (previous) throw new ServiceError("conflict", "Saldo awal kas reseller sudah tercatat.");
    const [earlier] = await tx.select({ id: resellerCash.id }).from(resellerCash)
      .innerJoin(resellerEvents, and(eq(resellerEvents.id, resellerCash.id), eq(resellerEvents.spaceId, resellerCash.spaceId)))
      .where(and(eq(resellerCash.spaceId, row.spaceId), lt(resellerEvents.businessDate, data.businessDate), effective(tx))).limit(1);
    if (earlier) throw new ServiceError("conflict", "Saldo awal kas harus mendahului transaksi pertama.");
    await tx.insert(resellerCash).values({ id: row.id, spaceId: row.spaceId, direction: "opening", deltaIdr: data.amount, category: "Saldo awal" });
  });
}

export async function postResellerCash(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(resellerCashSchema, raw);
  return resellerCommand(headers, db, "cash_manual", input, async (tx, row, data) => {
    await tx.insert(resellerCash).values({
      id: row.id, spaceId: row.spaceId, direction: data.direction, category: data.category,
      deltaIdr: data.direction === "income" ? data.amount : -data.amount,
    });
  });
}

export async function cancelResellerEvent(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(resellerCancelSchema, raw);
  return resellerWrite(headers, db, async (tx, owner) => recordOnce(
    tx, { actorId: owner.actor.id, command: "reseller_cancel", requestKey: input.requestKey }, input, async () => {
      const [original] = await tx.select().from(resellerEvents).where(and(
        eq(resellerEvents.spaceId, owner.spaceId), eq(resellerEvents.id, input.id), effective(tx),
      ));
      if (!original || original.kind === "reversal") throw new ServiceError("not-found", "Catatan reseller yang aktif tidak ditemukan.");
      const reversal = await event(tx, owner, {
        kind: "reversal", businessDate: original.businessDate, requestKey: input.requestKey, note: input.reason, reversesId: original.id,
      });
      const [funds] = await tx.select().from(resellerCash).where(and(eq(resellerCash.spaceId, owner.spaceId), eq(resellerCash.id, original.id)));
      const stock = await tx.select().from(resellerStock).where(and(eq(resellerStock.spaceId, owner.spaceId), eq(resellerStock.id, original.id)));
      if (funds) await tx.insert(resellerCash).values({ ...funds, id: reversal.id, deltaIdr: -funds.deltaIdr, direction: "reversal" });
      if (stock.length) await tx.insert(resellerStock).values(stock.map((row) => ({ ...row, id: reversal.id, deltaPieces: -row.deltaPieces })));
      await stockProjection(tx, owner.spaceId);
      await writeAudit(tx, { actorId: owner.actor.id, actorRole: owner.actor.role, spaceId: owner.spaceId,
        entity: "reseller_event", entityId: original.id, action: "reseller_cancelled", businessDate: reversal.businessDate,
        reason: input.reason, correlationId: reversal.id,
        before: { kind: original.kind, amount: funds?.deltaIdr.toString() ?? null },
        after: { reversalId: reversal.id },
      });
      return reversal.id;
    },
  ));
}

export async function resellerView(headers: Headers, period: { from: string; to: string }, db = database()) {
  const { spaceId } = await requireResellerSpace(headers, db);
  const [balances, units, events] = await Promise.all([
    stockProjection(db, spaceId, period.to),
    db.select().from(resellerUnits).where(and(eq(resellerUnits.spaceId, spaceId), lte(resellerUnits.effectiveDate, period.to)))
      .orderBy(desc(resellerUnits.effectiveDate), desc(resellerUnits.revision)),
    db.select({
      id: resellerEvents.id, kind: resellerEvents.kind, day: resellerEvents.businessDate, reversesId: resellerEvents.reversesId,
      note: resellerEvents.note, active: effective(db), stock: resellerStock, cash: resellerCash,
    }).from(resellerEvents)
      .leftJoin(resellerStock, and(eq(resellerStock.spaceId, resellerEvents.spaceId), eq(resellerStock.id, resellerEvents.id)))
      .leftJoin(resellerCash, and(eq(resellerCash.spaceId, resellerEvents.spaceId), eq(resellerCash.id, resellerEvents.id)))
      .where(and(eq(resellerEvents.spaceId, spaceId), lte(resellerEvents.businessDate, period.to)))
      .orderBy(desc(resellerEvents.businessDate), desc(resellerEvents.sequence)),
  ]);
  const ordinary = new Map(events.filter((row) => row.kind !== "reversal").map((row) => [row.id, row]));
  let balance = zero;
  let income = zero;
  let expense = zero;
  let opening = false;
  for (const row of events) {
    if (!row.cash) continue;
    const cash = row.cash;
    balance += cash.deltaIdr;
    if (row.active && cash.direction === "opening") opening = true;
    if (row.day < period.from) continue;
    const direction = row.reversesId ? ordinary.get(row.reversesId)?.cash?.direction : cash.direction;
    if (direction === "income") income += cash.deltaIdr;
    if (direction === "expense") expense -= cash.deltaIdr;
  }
  return { balances, units, currentUnits: currentUnits(units), events: events.filter(({ day }) => day >= period.from),
    finance: { balance, income, expense, opening, net: income - expense } };
}
