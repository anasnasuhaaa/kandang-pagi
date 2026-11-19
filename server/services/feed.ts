import { and, asc, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { database, type Transaction } from "../../db";
import {
  barnFeedCloses, barns, farmCash, farmEvents, feedMixInputs, feedMixes, feedMovements, feedProducts, feedReceipts,
} from "../../db/schema";
import { InventoryConflict, reconcileFeed, type FeedDelta, type FeedRecord } from "../../lib/domain/inventory";
import {
  feedAdjustmentSchema, feedClosingSchema, feedIssueSchema, feedMixSchema, feedOpeningSchema,
  feedPurchaseSchema, productSchema,
} from "../../lib/domain/production-input";
import { datesBetween, shiftBusinessDate } from "../../lib/format";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { assertActiveBarn, farmCommand, farmEventOrder, farmOperators, farmReaders, farmWrite, isEffective, parseInput, type Store } from "./farm";
import { recordOnce, writeAudit } from "./transactions";

const feedKinds = ["feed_opening", "feed_purchase", "feed_mix", "feed_issue", "feed_close", "feed_adjustment"] as const;
type Product = typeof feedProducts.$inferSelect;

export async function feedProjection(store: Store, end?: string, omittedId?: string, from?: string) {
  const conditions = and(or(inArray(farmEvents.kind, feedKinds), eq(farmEvents.kind, "reversal")), isEffective(store), end ? lte(farmEvents.businessDate, end) : undefined,
    omittedId ? ne(farmEvents.id, omittedId) : undefined);
  const [events, moves, closes] = await Promise.all([
    store.select({ id: farmEvents.id, day: farmEvents.businessDate, sequence: farmEvents.sequence }).from(farmEvents)
      .where(conditions).orderBy(asc(farmEvents.businessDate), asc(farmEventOrder)),
    store.select({
      eventId: feedMovements.eventId, productId: feedMovements.productId, barnId: feedMovements.barnId,
      grams: feedMovements.deltaGrams, kind: feedMovements.kind, value: feedMovements.valueIdr,
    }).from(feedMovements).innerJoin(farmEvents, eq(farmEvents.id, feedMovements.eventId)).where(conditions)
      .orderBy(asc(feedMovements.kind), asc(feedMovements.id)),
    store.select({
      id: barnFeedCloses.id, barnId: barnFeedCloses.barnId, productId: barnFeedCloses.productId, grams: barnFeedCloses.observedGrams,
    }).from(barnFeedCloses).innerJoin(farmEvents, eq(farmEvents.id, barnFeedCloses.id)).where(conditions),
  ]);
  const grouped = new Map(events.map((event): [string, FeedRecord] => [event.id, { ...event, moves: [] }]));
  for (const move of moves) {
    const event = grouped.get(move.eventId);
    if (!event) continue;
    if (move.kind === "reversal") {
      if (move.barnId) (event.touches ??= []).push({ barnId: move.barnId, productId: move.productId });
    } else event.moves.push(move);
  }
  for (const close of closes) {
    const record = grouped.get(close.id);
    if (record) record.close = close;
  }
  const records = [...grouped.values()];
  if (from && end) {
    const recorded = new Set(events.map((event) => event.day));
    for (const day of datesBetween(from, end)) if (!recorded.has(day)) records.push({ id: day, day, moves: [] });
    records.sort((left, right) => left.day.localeCompare(right.day));
  }
  try {
    return reconcileFeed(records, (day) => shiftBusinessDate(day, -1));
  } catch (error) {
    if (error instanceof InventoryConflict) throw new ServiceError("conflict", error.message);
    throw error;
  }
}

async function activeProduct(tx: Transaction, id: string) {
  const [product] = await tx.select().from(feedProducts).where(and(eq(feedProducts.id, id), eq(feedProducts.active, true)));
  if (!product) throw new ServiceError("invalid", "Pilih pakan yang aktif.");
  return product;
}

async function insertFeedMoves(tx: Transaction, id: string, moves: (Omit<FeedDelta, "value"> & { value?: bigint })[]) {
  if (moves.length) await tx.insert(feedMovements).values(moves.map((row) => ({
    eventId: id, productId: row.productId, barnId: row.barnId, deltaGrams: row.grams, kind: row.kind, valueIdr: row.value,
  })));
}

export async function createFeedProduct(headers: Headers, raw: unknown, db = database()) {
  const { requestKey, ...input } = parseInput(productSchema, raw);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) => recordOnce(
    tx, { actorId: actor.id, command: "create_feed_product", requestKey }, input, async () => {
      const [product] = await tx.insert(feedProducts).values(input).onConflictDoNothing().returning({ id: feedProducts.id });
      if (!product) throw new ServiceError("conflict", "Kode pakan sudah digunakan.");
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "feed_product_created", entity: "feed_product", entityId: product.id });
      return product.id;
    },
  ));
}

export async function openFeedStock(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "feed_opening", parseInput(feedOpeningSchema, raw),
    async (tx, _, event, input) => {
      await activeProduct(tx, input.productId);
      if (input.barnId) await assertActiveBarn(tx, input.barnId);
      await insertFeedMoves(tx, event.id, [{ kind: "opening", productId: input.productId, barnId: input.barnId ?? null, grams: input.grams, value: input.value }]);
      await feedProjection(tx);
    });
}

export async function buyFeed(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "feed_purchase", parseInput(feedPurchaseSchema, raw),
    async (tx, _, event, input) => {
      await activeProduct(tx, input.productId);
      await tx.insert(feedReceipts).values({
        id: event.id, productId: input.productId, supplier: input.supplier, grams: input.grams, totalIdr: input.total,
      });
      await insertFeedMoves(tx, event.id, [{ kind: "purchase", productId: input.productId, barnId: null, grams: input.grams, value: input.total }]);
      await tx.insert(farmCash).values({ id: event.id, direction: "expense", category: "Pembelian pakan", deltaIdr: -input.total });
      await feedProjection(tx);
    });
}

export async function issueFeed(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "feed_issue", parseInput(feedIssueSchema, raw),
    async (tx, _, event, input) => {
      await activeProduct(tx, input.productId);
      await assertActiveBarn(tx, input.barnId);
      await insertFeedMoves(tx, event.id, [
        { kind: "issue", productId: input.productId, barnId: null, grams: -input.grams },
        { kind: "issue", productId: input.productId, barnId: input.barnId, grams: input.grams },
      ]);
      await feedProjection(tx);
    });
}

export async function mixFeed(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "feed_mix", parseInput(feedMixSchema, raw),
    async (tx, _, event, input) => {
      const product = await activeProduct(tx, input.productId);
      if (product.kind !== "mixed") throw new ServiceError("invalid", "Pilih produk hasil dengan jenis pakan campuran.");
      for (const ingredient of input.ingredients) await activeProduct(tx, ingredient.productId);
      const inputGrams = input.ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);
      await tx.insert(feedMixes).values({ id: event.id, productId: input.productId, outputGrams: input.output, shrinkageGrams: inputGrams - input.output });
      await tx.insert(feedMixInputs).values(input.ingredients.map((ingredient) => ({ mixId: event.id, ...ingredient })));
      await insertFeedMoves(tx, event.id, [
        ...input.ingredients.map((ingredient) => ({ kind: "mix_in" as const, productId: ingredient.productId, barnId: null, grams: -ingredient.grams })),
        { kind: "mix_out", productId: input.productId, barnId: null, grams: input.output },
      ]);
      const projected = await feedProjection(tx);
      await tx.update(feedMovements).set({ valueIdr: projected.valuation.get(event.id) ?? BigInt(0) }).where(and(
        eq(feedMovements.eventId, event.id), eq(feedMovements.kind, "mix_out"),
      ));
    });
}

export async function closeBarnFeed(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "feed_close", parseInput(feedClosingSchema, raw),
    async (tx, _, event, input) => {
      await activeProduct(tx, input.productId);
      await assertActiveBarn(tx, input.barnId);
      const previous = await tx.select({ revision: barnFeedCloses.revision }).from(barnFeedCloses).where(and(
        eq(barnFeedCloses.businessDate, input.businessDate), eq(barnFeedCloses.barnId, input.barnId), eq(barnFeedCloses.productId, input.productId),
      ));
      const revision = Math.max(0, ...previous.map((row) => row.revision)) + 1;
      await tx.insert(barnFeedCloses).values({
        id: event.id, barnId: input.barnId, productId: input.productId,
        businessDate: input.businessDate, observedGrams: input.closing, revision,
      });
      const movements: Parameters<typeof insertFeedMoves>[2] = [];
      if (input.waste > 0) movements.push({ kind: "waste", productId: input.productId, barnId: input.barnId, grams: -input.waste });
      if (input.returned > 0) movements.push(
        { kind: "return", productId: input.productId, barnId: input.barnId, grams: -input.returned },
        { kind: "return", productId: input.productId, barnId: null, grams: input.returned },
      );
      await insertFeedMoves(tx, event.id, movements);
      await feedProjection(tx);
    });
}

export async function adjustFeed(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "feed_adjustment", parseInput(feedAdjustmentSchema, raw),
    async (tx, _, event, input) => {
      await activeProduct(tx, input.productId);
      if (input.barnId) await assertActiveBarn(tx, input.barnId);
      await insertFeedMoves(tx, event.id, [{
        kind: "adjustment", productId: input.productId, barnId: input.barnId ?? null, grams: input.direction === "increase" ? input.grams : -input.grams,
      }]);
      await feedProjection(tx);
    });
}

export function feedConsumedForBarns(projected: Awaited<ReturnType<typeof feedProjection>>, date: string, barnIds: readonly string[]) {
  if (!barnIds.length) return null;
  let total = 0;
  for (const barnId of barnIds) {
    const rows = projected.daily.filter((row) => row.day === date && row.barnId === barnId);
    if (!rows.length || rows.some(({ consumed }) => consumed === null)) return null;
    for (const row of rows) total += row.consumed ?? 0;
  }
  return total;
}

export async function feedBarnBalance(store: Store, barnId: string) {
  return [...(await feedProjection(store)).balances.values()].some((balance) => balance.barnId === barnId && balance.grams > 0);
}

export async function feedView(headers: Headers, period: { from: string; to: string }, db = database()) {
  const actor = await requireRole(headers, farmReaders, db);
  const includeMoney = actor.role !== "abk";
  const inPeriod = and(gte(farmEvents.businessDate, period.from), lte(farmEvents.businessDate, period.to));
  const [projected, products, barnRows, events, purchaseRows, rawMovements, mixes] = await Promise.all([
    feedProjection(db, period.to, undefined, period.from),
    db.select().from(feedProducts).orderBy(feedProducts.name),
    db.select({ id: barns.id, name: barns.name, active: barns.active }).from(barns).orderBy(barns.name),
    db.select({
      id: farmEvents.id, kind: farmEvents.kind, day: farmEvents.businessDate, note: farmEvents.note, recordedAt: farmEvents.recordedAt,
    }).from(farmEvents).where(and(inArray(farmEvents.kind, feedKinds), inPeriod))
      .orderBy(asc(farmEvents.businessDate), asc(farmEventOrder)),
    db.select({
      id: feedReceipts.id, supplier: feedReceipts.supplier, productId: feedReceipts.productId, grams: feedReceipts.grams,
      ...(includeMoney ? { total: feedReceipts.totalIdr } : {}),
    }).from(feedReceipts).innerJoin(farmEvents, eq(farmEvents.id, feedReceipts.id)).where(inPeriod),
    db.select({
      eventId: feedMovements.eventId, barnId: feedMovements.barnId, productId: feedMovements.productId,
      kind: feedMovements.kind, grams: feedMovements.deltaGrams,
    }).from(feedMovements).innerJoin(farmEvents, eq(farmEvents.id, feedMovements.eventId)).where(inPeriod),
    db.select({ id: feedMixes.id, outputGrams: feedMixes.outputGrams, shrinkageGrams: feedMixes.shrinkageGrams }).from(feedMixes)
      .innerJoin(farmEvents, eq(farmEvents.id, feedMixes.id)).where(inPeriod),
  ]);
  const balances = [...projected.balances.values()].map(({ value, ...row }) => ({ ...row, ...(includeMoney ? { value } : {}) }));
  const eventIds = events.map((event) => event.id);
  const reversals = eventIds.length ? await db.select({ original: farmEvents.reversesId }).from(farmEvents).where(inArray(farmEvents.reversesId, eventIds)) : [];
  const revoked = new Set(reversals.map(({ original }) => original));
  return {
    products: products as Product[], barns: barnRows, balances, daily: projected.daily,
    events: events.reverse().map((event) => ({
      ...event, ...(actor.role === "abk" && event.kind === "feed_purchase" ? { note: "" } : {}),
      reversed: revoked.has(event.id),
      moves: rawMovements.filter(({ eventId }) => eventId === event.id),
      purchase: purchaseRows.find(({ id }) => id === event.id),
      mix: mixes.find(({ id }) => id === event.id),
      ...(includeMoney ? { cost: projected.valuation.get(event.id) } : {}),
    })),
  };
}
