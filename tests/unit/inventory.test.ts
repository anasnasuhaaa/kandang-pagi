import assert from "node:assert/strict";
import { test } from "node:test";
import { feedConversion, reconcileEggs, reconcileFeed, stockKey, type FeedRecord } from "../../lib/domain/inventory";
import { harvestSchema, saleSchema } from "../../lib/domain/production-input";
import { businessDate, shiftBusinessDate } from "../../lib/format";
import { randomUUID } from "node:crypto";

const day = "2026-11-18";
const previous = (value: string) => shiftBusinessDate(value, -1);
const productId = "feed";
const barnId = "barn";
const cents = (value: number) => BigInt(value);
const feedRecords: FeedRecord[] = [
  { id: "opening", day, moves: [
    { productId, barnId, grams: 5_000, value: cents(5_000), kind: "opening" },
    { productId, barnId: null, grams: 120_000, value: cents(120_000), kind: "opening" },
  ] },
  { id: "issue", day, moves: [
    { productId, barnId: null, grams: -120_000, value: null, kind: "issue" },
    { productId, barnId, grams: 120_000, value: null, kind: "issue" },
  ] },
];

test("feed transfer is not consumption and daily close reconciles physical weight", () => {
  assert.equal(reconcileFeed(feedRecords, previous).daily[0].consumed, null);
  const close: FeedRecord = { id: "close", day, moves: [], close: { barnId, productId, grams: 15_000 } };
  const without = reconcileFeed([...feedRecords, close], previous);
  assert.equal(without.daily[0].consumed, 110_000);
  assert.equal(without.balances.get(stockKey(barnId, productId))?.grams, 15_000);
  close.moves.push({ productId, barnId, grams: -3_000, value: null, kind: "waste" });
  const withWaste = reconcileFeed([...feedRecords, close], previous);
  assert.equal(withWaste.daily[0].consumed, 107_000);
  assert.equal(withWaste.balances.get(stockKey(null, productId))?.grams, 0);
  assert.equal(feedConversion(withWaste.daily[0].consumed, 25_000), 4.28);
  assert.equal(feedConversion(null, 25_000), null);
  assert.equal(feedConversion(107_000, 0), null);
});

test("a missing preceding close invalidates consumption through the next reading", () => {
  const today = shiftBusinessDate(day, 1);
  const tomorrow = shiftBusinessDate(day, 2);
  const result = reconcileFeed([...feedRecords,
    { id: "late-close", day: today, moves: [], close: { barnId, productId, grams: 10_000 } },
    { id: "next-close", day: tomorrow, moves: [], close: { barnId, productId, grams: 5_000 } },
  ], previous);
  assert.deepEqual(result.daily.map(({ consumed }) => consumed), [null, null, 5_000]);
});

test("partial sorting preserves lot inventory and classification totals", () => {
  const harvest = { harvestId: "lot", category: "ungraded", pieces: 100 } as const;
  const result = reconcileEggs([harvest,
    { harvestId: "lot", category: "ungraded", pieces: -50 },
    { harvestId: "lot", category: "coklat", pieces: 35 },
    { harvestId: "lot", category: "putih", pieces: 10 },
    { harvestId: "lot", category: "cacat", pieces: 5 },
  ]);
  assert.deepEqual(result.balances, { ungraded: 50, coklat: 35, putih: 10, cacat: 5 });
  assert.equal(result.lots.get("lot"), 50);
  assert.throws(() => reconcileEggs([harvest, { harvestId: null, category: "coklat", pieces: -1 }]), /tidak cukup/);
});

test("paid egg sale rejects ungraded stock and partial payment", () => {
  const input = { requestKey: randomUUID(), businessDate: businessDate(), paid: "1000", lines: [{ category: "ungraded", count: "2", price: "500" }] };
  assert.equal(saleSchema.safeParse(input).success, false);
  const lines = [{ category: "coklat", count: "2", price: "500" }];
  assert.equal(saleSchema.safeParse({ ...input, lines, paid: "999" }).success, false);
  assert.equal(saleSchema.safeParse({ ...input, lines }).success, true);
  assert.equal(harvestSchema.safeParse({
    requestKey: randomUUID(), businessDate: businessDate(), attribution: "mixed", barnId: randomUUID(),
    count: "0", weighed: "0", massStatus: "complete",
  }).success, true);
});

test("backdated movement after a recorded physical close requires reverification", () => {
  const close: FeedRecord = { id: "close", day, moves: [], close: { barnId, productId, grams: 15_000 } };
  const waste: FeedRecord = { id: "waste", day, moves: [{ productId, barnId, grams: -3000, value: null, kind: "waste" }] };
  const row = reconcileFeed([...feedRecords, close, waste], previous).daily[0];
  assert.equal(row.closing, 15_000);
  assert.equal(row.consumed, null);
  assert.equal(row.stale, true);
});
