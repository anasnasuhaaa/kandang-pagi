import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { connectDatabase } from "../../db";
import { eggHarvests, farmEvents, flocks } from "../../db/schema";
import { businessDate, jakartaStart, shiftBusinessDate } from "../../lib/format";
import { addMovement, cancelMovement, createBarn, createFlock, populationDashboard, populationPage, setBarnStatus } from "../../server/services/population";
import { fixtureActor } from "./fixtures";
import { testDatabaseUrl } from "./test-database";

test("dated population ledger, corrections and role boundaries", async (t) => {
  const { client, db } = connectDatabase(testDatabaseUrl());
  t.after(() => client.end());
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const admin = await fixtureActor(db, "administrator");
  const operator = await fixtureActor(db, "abk");
  const owner = await fixtureActor(db, "pemilik");
  const reseller = await fixtureActor(db, "reseller");
  const today = businessDate();
  const d1 = shiftBusinessDate(today, -2);
  const d2 = shiftBusinessDate(today, -1);
  const barnInput = { requestKey: randomUUID(), name: "Kandang Satu", code: "TS-1", location: "Sisi timur" };
  const initial = { requestKey: randomUUID(), name: "Kelompok Uji", code: "FL-1", kind: "arrival", businessDate: d1, count: "100", age: "70", origin: "Pemasok uji", reason: "Penempatan dari pemasok" };
  let barnA: string;
  let barnB: string;
  let flockId: string;

  await t.test("only administrator manages barns, and ABK records intake with original baseline", async () => {
    await assert.rejects(createBarn(operator.headers, barnInput, db), /tidak memiliki akses/);
    barnA = (await createBarn(admin.headers, barnInput, db)).id;
    const replay = await createBarn(admin.headers, barnInput, db);
    assert.deepEqual(replay, { id: barnA, replay: true });
    barnB = (await createBarn(admin.headers, { ...barnInput, requestKey: randomUUID(), code: "TS-2", name: "Kandang Dua" }, db)).id;
    await assert.rejects(createFlock(owner.headers, { ...initial, barnId: barnA }, db), /tidak memiliki akses/);
    flockId = (await createFlock(operator.headers, { ...initial, barnId: barnA }, db)).id;
    await assert.rejects(setBarnStatus(admin.headers, { barnId: barnA, active: false, reason: "Pemeliharaan kandang" }, db), /ternak hidup/);
    await assert.rejects(populationDashboard(reseller.headers, { from: d1, to: today }, db), /tidak memiliki akses/);
  });

  const death = () => ({ requestKey: randomUUID(), flockId, kind: "death", businessDate: d2, reason: "Ditemukan mati saat pemeriksaan", count: "60" });

  await t.test("parallel movements cannot reduce population below zero and history remains dated", async () => {
    const actions = await Promise.allSettled([addMovement(operator.headers, death(), db), addMovement(admin.headers, death(), db)]);
    assert.equal(actions.filter(({ status }) => status === "fulfilled").length, 1);
    const dashboard = await populationDashboard(owner.headers, { from: d1, to: today, flockId }, db);
    assert.deepEqual(dashboard.timeline.map(({ hens }) => hens), [100, 40, 40]);
    assert.deepEqual(dashboard.timeline.map(({ deaths }) => deaths), [0, 60, 0]);
    assert.equal(dashboard.rates.hdp, null);
    await assert.rejects(addMovement(operator.headers, { ...death(), count: "50", businessDate: d1 }, db), /negatif/);
  });

  let transferId: string;
  await t.test("transfer preserves total, keeps baseline, rejects invalid source placement and replay", async () => {
    const move = { requestKey: randomUUID(), flockId, kind: "transfer", businessDate: today, reason: "Rotasi kandang", toBarnId: barnB };
    await assert.rejects(addMovement(operator.headers, { ...move, toBarnId: barnA }, db), /kandang lain/);
    transferId = (await addMovement(operator.headers, move, db)).id;
    assert.equal((await addMovement(operator.headers, move, db)).replay, true);
    const dashboard = await populationDashboard(owner.headers, { from: d1, to: today, flockId }, db);
    const originalBarn = await populationDashboard(owner.headers, { from: d1, to: today, barnId: barnA, flockId }, db);
    const [flock] = await db.select().from(flocks).where(eq(flocks.id, flockId));
    assert.deepEqual(dashboard.timeline.map(({ hens }) => hens), [100, 40, 40]);
    assert.deepEqual(originalBarn.timeline.map(({ hens }) => hens), [100, 40, 0]);
    assert.equal(originalBarn.timeline[2].known, true);
    assert.equal(flock.initialHenHoused, 100);
    await assert.rejects(addMovement(operator.headers, { ...death(), count: "1", businessDate: d1 }, db), /semua ternak hidup/);
  });

  await t.test("administrator reversal is dated, visible in audit history and protects later placements", async () => {
    const cancel = { requestKey: randomUUID(), eventId: transferId, reason: "Lokasi transfer salah" };
    await assert.rejects(cancelMovement(operator.headers, cancel, db), /tidak memiliki akses/);
    await cancelMovement(admin.headers, cancel, db);
    const dashboard = await populationDashboard(owner.headers, { from: d1, to: today, barnId: barnA, flockId }, db);
    assert.deepEqual(dashboard.timeline.map(({ hens }) => hens), [100, 40, 40]);
    const history = await populationPage(admin.headers, { date: today, from: d1, search: "Kelompok Uji", flockId, page: 1, tab: "riwayat" }, db);
    assert.ok(history.history.find(({ id, reversal }) => id === transferId && reversal));
    await assert.rejects(cancelMovement(admin.headers, { ...cancel, requestKey: randomUUID() }, db), /tidak ditemukan/);
  });

  await t.test("mixed barn harvest remains unallocated while aggregate figures stay valid", async () => {
    await db.transaction(async (tx) => {
      for (const [day, group, qty] of [[d1, flockId, 85], [d2, null, 30]] as const) {
        const [event] = await tx.insert(farmEvents).values({
          kind: "egg_harvest", actorId: operator.id, businessDate: day, occurredAt: jakartaStart(day), requestKey: randomUUID(),
        }).returning({ id: farmEvents.id });
        await tx.insert(eggHarvests).values({ id: event.id, barnId: barnA, flockId: group, pieces: qty, measuredGrams: qty * 60 });
      }
    });
    const flock = await populationDashboard(owner.headers, { from: d1, to: d2, flockId }, db);
    const barn = await populationDashboard(owner.headers, { from: d1, to: d2, barnId: barnA }, db);
    assert.equal(flock.rates.hdp, 85);
    assert.equal(flock.rates.hhp, 85);
    assert.equal(flock.timeline[1].mixed, true);
    assert.equal(flock.timeline[1].recorded, false);
    assert.equal(barn.rates.hdp, 115 * 100 / 140);
  });
});
