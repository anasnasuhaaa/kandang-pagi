import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, inArray } from "drizzle-orm";
import { connectDatabase } from "../../db";
import { eggSales, farmCash, farmEvents, feedMixes } from "../../db/schema";
import { stockKey } from "../../lib/domain/inventory";
import { businessDate, shiftBusinessDate } from "../../lib/format";
import { eggProjection, eggView, gradeEggs, harvestEggs, sellEggs } from "../../server/services/eggs";
import {
  adjustFeed, buyFeed, closeBarnFeed, createFeedProduct, feedProjection, feedView, issueFeed, mixFeed, openFeedStock,
} from "../../server/services/feed";
import { createBarn, createFlock } from "../../server/services/population";
import { productionSummary } from "../../server/services/production-summary";
import { fixtureActor } from "./fixtures";
import { testDatabaseUrl } from "./test-database";

test("feed and egg stock use atomic dated ledgers and unique cash origins", async (t) => {
  const { client, db } = connectDatabase(testDatabaseUrl());
  t.after(() => client.end());
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const admin = await fixtureActor(db, "administrator");
  const abk = await fixtureActor(db, "abk");
  const owner = await fixtureActor(db, "pemilik");
  const day = shiftBusinessDate(businessDate(), -2);
  const next = shiftBusinessDate(day, 1);
  const today = businessDate();
  const record = (businessDate = day) => ({ requestKey: randomUUID(), businessDate, note: "" });
  const barnId = (await createBarn(admin.headers, { code: "IV-B", name: "Kandang Inventaris", location: "", requestKey: randomUUID() }, db)).id;
  const flockId = (await createFlock(admin.headers, {
    ...record(), code: "IV-F", name: "Kelompok Inventaris", barnId,
    kind: "opening", count: "100", age: "90", origin: "Peternakan Uji", reason: "Saldo awal populasi",
  }, db)).id;
  const master = async (code: string, name: string, kind: string) =>
    (await createFeedProduct(admin.headers, { requestKey: randomUUID(), code, name, kind }, db)).id;
  const productId = await master("INV-1", "Pakan Uji Satu", "ingredient");
  const second = await master("INV-2", "Bahan Uji Dua", "ingredient");
  const result = await master("INV-3", "Pakan Campuran Uji", "mixed");
  let receiptId: string;

  await t.test("paid feed receipt posts once, issue transfers stock, daily close deducts actual consumption once", async () => {
    await openFeedStock(admin.headers, { ...record(), productId, barnId, grams: "5", value: "5000", note: "Saldo awal kandang" }, db);
    const purchase = { ...record(), productId, grams: "150", total: "150000", supplier: "Pemasok Uji" };
    await assert.rejects(buyFeed(abk.headers, purchase, db), /tidak memiliki akses/);
    receiptId = (await buyFeed(admin.headers, purchase, db)).id;
    assert.equal((await buyFeed(admin.headers, purchase, db)).replay, true);
    const issue = { ...record(), productId, barnId, grams: "120" };
    await issueFeed(abk.headers, issue, db);
    assert.equal((await issueFeed(abk.headers, issue, db)).replay, true);
    const before = await feedProjection(db, day);
    assert.equal(before.balances.get(stockKey(null, productId))?.grams, 30_000);
    assert.equal(before.daily.find((row) => row.barnId === barnId)?.consumed, null);
    const closing = { ...record(), productId, barnId, closing: "15", waste: "3", returned: "0" };
    await closeBarnFeed(abk.headers, closing, db);
    await assert.rejects(closeBarnFeed(abk.headers, { ...closing, requestKey: randomUUID() }, db), /sudah tercatat/);
    const after = await feedProjection(db, day);
    assert.equal(after.daily.find((row) => row.barnId === barnId)?.consumed, 107_000);
    assert.equal(after.balances.get(stockKey(barnId, productId))?.grams, 15_000);
    const rows = await db.select().from(farmCash).where(eq(farmCash.id, receiptId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deltaIdr, -BigInt(150000));
    await assert.rejects(feedProjection(db, undefined, receiptId), /Stok pakan tidak cukup/);
  });

  await t.test("insufficient mixing rolls back and a valid mix maintains exact costs", async () => {
    await openFeedStock(admin.headers, { ...record(next), productId: second, grams: "10", value: "20000", note: "Saldo awal bahan kedua" }, db);
    const mix = { ...record(next), productId: result, output: "9", ingredients: [{ productId, grams: "5" }, { productId: second, grams: "5" }] };
    await assert.rejects(mixFeed(abk.headers, { ...mix, ingredients: [{ productId, grams: "5" }, { productId: second, grams: "20" }] }, db), /Stok pakan tidak cukup/);
    assert.equal((await db.select().from(feedMixes)).length, 0);
    const { id } = await mixFeed(abk.headers, mix, db);
    const projection = await feedProjection(db, next);
    assert.equal(projection.balances.get(stockKey(null, result))?.grams, 9_000);
    assert.equal(projection.balances.get(stockKey(null, result))?.value, BigInt(15_000));
    assert.equal(projection.valuation.get(id), BigInt(15_000));
    await assert.rejects(adjustFeed(admin.headers, {
      ...record(), productId, direction: "decrease", grams: "26", note: "Penyesuaian mundur",
    }, db), /Stok pakan tidak cukup/);
    const view = await feedView(abk.headers, { from: day, to: next }, db);
    assert.equal(view.events.find((event) => event.id === receiptId)?.purchase?.total, undefined);
    assert.equal(view.events.find((event) => event.id === id)?.cost, undefined);
    assert.ok(view.balances.every((row) => row.value === undefined));
  });

  let harvest: string;
  let grade: string;
  await t.test("harvest mass includes defective eggs and sorting conserves stock by lot", async () => {
    harvest = (await harvestEggs(abk.headers, {
      ...record(), barnId, flockId, attribution: "flock", count: "100", weighed: "5", massStatus: "complete",
    }, db)).id;
    grade = (await gradeEggs(abk.headers, { ...record(next), harvestId: harvest, coklat: "70", putih: "20", cacat: "10" }, db)).id;
    assert.deepEqual((await eggProjection(db, next)).balances, { ungraded: 0, coklat: 70, putih: 20, cacat: 10 });
    await assert.rejects(gradeEggs(abk.headers, { ...record(next), harvestId: harvest, coklat: "1", putih: "0", cacat: "0" }, db), /melebihi stok lot/);
    const view = await eggView(owner.headers, { from: day, to: next }, db);
    assert.equal(view.harvests.find(({ id }) => id === harvest)?.grams, 5000);
    const summary = await productionSummary(owner.headers, { from: day, to: day, barnId }, db);
    assert.equal(summary.eggGrams, 5000);
    assert.equal(summary.fcr, 21.4);
    const gaps = await productionSummary(owner.headers, { from: day, to: next, barnId }, db);
    assert.equal(gaps.fcr, null);
  });

  await t.test("parallel sales cannot oversell; retries post one income and stock cannot be replayed invalidly", async () => {
    const payload = () => ({ ...record(today), paid: "45000", lines: [{ category: "coklat", count: "45", price: "1000" }] });
    const a = payload();
    const b = payload();
    await assert.rejects(sellEggs(abk.headers, a, db), /tidak memiliki akses/);
    await assert.rejects(sellEggs(admin.headers, { ...a, businessDate: day }, db), /Stok kategori telur tidak cukup/);
    const parallel = await Promise.allSettled([sellEggs(admin.headers, a, db), sellEggs(admin.headers, b, db)]);
    assert.equal(parallel.filter(({ status }) => status === "fulfilled").length, 1);
    const winner = parallel[0].status === "fulfilled" ? a : b;
    const replay = await sellEggs(admin.headers, winner, db);
    assert.equal(replay.replay, true);
    assert.equal((await eggProjection(db)).balances.coklat, 25);
    const postings = await db.select().from(farmCash).where(inArray(farmCash.id, [receiptId, replay.id]));
    assert.deepEqual(postings.map(({ deltaIdr }) => deltaIdr.toString()).sort(), ["-150000", "45000"]);
    assert.equal((await db.select().from(eggSales).where(eq(eggSales.id, replay.id))).length, 1);
    await assert.rejects(eggProjection(db, undefined, grade), /Stok kategori telur tidak cukup/);
    const stockEvents = await db.select().from(farmEvents).where(and(eq(farmEvents.kind, "egg_sale"), eq(farmEvents.actorId, admin.id)));
    assert.equal(stockEvents.length, 1);
    const view = await eggView(abk.headers, { from: day, to: today }, db);
    assert.equal(view.events.find(({ id }) => id === replay.id)?.sale?.paid, undefined);
  });

  await t.test("parallel warehouse releases serialize, reject excess, and do not post expenses", async () => {
    const supply = await master("INV-RACE", "Pakan Uji Serentak", "complete");
    await openFeedStock(admin.headers, { ...record(today), productId: supply, grams: "40", value: "40000", note: "Saldo uji pelepasan" }, db);
    const release = { ...record(today), productId: supply, barnId, grams: "30" };
    const other = { ...release, requestKey: randomUUID() };
    const outcomes = await Promise.allSettled([issueFeed(abk.headers, release, db), issueFeed(abk.headers, other, db)]);
    assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
    const winner = outcomes[0].status === "fulfilled" ? release : other;
    const repeated = await issueFeed(abk.headers, winner, db);
    assert.equal(repeated.replay, true);
    const projection = await feedProjection(db, today);
    assert.equal(projection.balances.get(stockKey(null, supply))?.grams, 10000);
    assert.equal(projection.balances.get(stockKey(barnId, supply))?.grams, 30000);
    assert.equal((await db.select().from(farmCash).where(eq(farmCash.id, repeated.id))).length, 0);
  });
});
