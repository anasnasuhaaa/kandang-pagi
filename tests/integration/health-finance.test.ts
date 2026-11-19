import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { connectDatabase } from "../../db";
import { correctionRequests, farmCash, farmEvents, transactionReceipts } from "../../db/schema";
import { businessDate, shiftBusinessDate } from "../../lib/format";
import { receiptLimit } from "../../lib/receipts";
import { correctionView, directCorrection, requestCorrection, reviewCorrection } from "../../server/services/corrections";
import { buyFeed, createFeedProduct, feedProjection, issueFeed } from "../../server/services/feed";
import { financeSummary, financeView, openCash, postCash } from "../../server/services/finance";
import { changeHealthStatus, createIncident, endQuarantine, executeVaccination, healthView, scheduleVaccination, startQuarantine } from "../../server/services/health";
import type { ReceiptProvider } from "../../server/services/imagekit";
import { addMovement, createBarn, createFlock, populationDashboard } from "../../server/services/population";
import { receiptDelivery, receiptHistory, reconcileReceipts, uploadReceipt, validateReceipt } from "../../server/services/receipts";
import { fixtureActor } from "./fixtures";
import { testDatabaseUrl } from "./test-database";

test("health, financial origins, corrections and private receipts", async (t) => {
  const { client, db } = connectDatabase(testDatabaseUrl());
  t.after(() => client.end());
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const admin = await fixtureActor(db, "administrator");
  const abk = await fixtureActor(db, "abk");
  const owner = await fixtureActor(db, "pemilik");
  const now = businessDate();
  const past = shiftBusinessDate(now, -2);
  const yesterday = shiftBusinessDate(now, -1);
  const record = (date = past) => ({ requestKey: randomUUID(), businessDate: date, note: "" });
  const period = { from: past, to: now };
  const barnId = (await createBarn(admin.headers, { code: "HF-B", name: "Kandang Kesehatan Uji", requestKey: randomUUID(), location: "" }, db)).id;
  const flockId = (await createFlock(abk.headers, { ...record(), code: "HF-F", name: "Kelompok Kesehatan Uji", barnId,
    kind: "opening", count: "80", age: "90", origin: "Peternakan Uji", reason: "Saldo awal populasi",
  }, db)).id;

  await t.test("health status, vaccine overdue and quarantine use business dates without touching herd", async () => {
    const incident = await createIncident(abk.headers, {
      ...record(), barnId, flockId, incident: "Pengamatan harian", observations: "Ada perubahan perilaku pada kelompok",
      treatment: "Pengawasan dilanjutkan", status: "open",
    }, db);
    await changeHealthStatus(abk.headers, { id: incident.id, status: "resolved", reason: "Pengamatan ditutup hari ini" }, db);
    assert.equal((await healthView(owner.headers, { from: past, to: yesterday }, db)).incidents[0].data.status, "open");
    const schedule = await scheduleVaccination(abk.headers, {
      ...record(), barnId, flockId, vaccine: "Jadwal uji", dueDate: yesterday,
    }, db);
    assert.equal((await healthView(owner.headers, period, db)).schedules.find((row) => row.id === schedule.id)?.status, "overdue");
    await executeVaccination(abk.headers, { ...record(now), scheduleId: schedule.id, outcome: "Pelaksanaan tercatat" }, db);
    assert.equal((await healthView(owner.headers, period, db)).schedules.find((row) => row.id === schedule.id)?.status, "done");
    await assert.rejects(executeVaccination(abk.headers, { ...record(now), scheduleId: schedule.id, outcome: "Pelaksanaan ganda" }, db), /sudah memiliki/);
    const quarantine = await startQuarantine(abk.headers, { ...record(), barnId, flockId, note: "Pengamatan isolasi" }, db);
    await assert.rejects(startQuarantine(abk.headers, { ...record(yesterday), barnId, flockId, note: "Jadwal bertumpang tindih" }, db), /bertumpang tindih/);
    assert.equal((await populationDashboard(owner.headers, { ...period, flockId }, db)).timeline[2].hens, 80);
    await endQuarantine(abk.headers, { id: quarantine.id, businessDate: now, reason: "Pengamatan selesai" }, db);
    assert.equal((await healthView(owner.headers, period, db)).quarantine[0].active, false);
    assert.equal((await healthView(owner.headers, { from: past, to: yesterday }, db)).quarantine[0].active, true);
    await assert.rejects(createIncident(owner.headers, {
      ...record(), barnId, flockId, incident: "Pengamatan", observations: "Pengamatan dari pemilik", status: "open",
    }, db), /tidak memiliki akses/);
  });

  let cashId: string;
  let receiptOrigin: string;
  await t.test("cash opening differs from income, financial origin uniqueness and correction compensation", async () => {
    const opening = await openCash(admin.headers, { ...record(past), amount: "200000", note: "Saldo awal pengujian" }, db);
    const manual = { ...record(yesterday), amount: "65000", category: "Pendapatan mandiri", direction: "income", origin: "egg_sale" };
    cashId = (await postCash(admin.headers, manual, db)).id;
    assert.equal((await postCash(admin.headers, manual, db)).replay, true);
    const [event] = await db.select().from(farmEvents).where(eq(farmEvents.id, cashId));
    assert.equal(event.kind, "cash_manual");
    const productId = (await createFeedProduct(admin.headers, { requestKey: randomUUID(), code: "HF-PAKAN", name: "Pakan Koreksi", kind: "complete" }, db)).id;
    const purchase = { ...record(yesterday), productId, grams: "25", total: "25000", supplier: "Pemasok Uji" };
    receiptOrigin = (await buyFeed(admin.headers, purchase, db)).id;
    assert.equal((await buyFeed(admin.headers, purchase, db)).replay, true);
    await assert.rejects(financeView(abk.headers, period, db), /tidak memiliki akses/);
    const summary = await financeSummary(owner.headers, period, db);
    assert.equal(summary.opening, BigInt(200000));
    assert.equal(summary.income, BigInt(65000));
    assert.equal(summary.expense, BigInt(25000));
    assert.equal(summary.balance, BigInt(240000));
    const correction = { id: cashId, requestKey: randomUUID(), proposed: "amount", amount: "70000", reason: "Koreksi nominal awal" };
    const result = await directCorrection(admin.headers, correction, db);
    const [change] = await db.select().from(correctionRequests).where(eq(correctionRequests.id, result.id));
    assert.ok(change.reversalId && change.replacementId);
    const entries = await db.select().from(farmCash).where(inArray(farmCash.id, [opening.id, cashId, change.reversalId!, change.replacementId!, receiptOrigin]));
    assert.equal(entries.length, 5);
    const reconciled = await financeSummary(owner.headers, period, db);
    assert.equal(reconciled.income, BigInt(70000));
    assert.equal(reconciled.balance, BigInt(245000));
    cashId = change.replacementId!;

    await issueFeed(abk.headers, { ...record(now), productId, barnId, grams: "25" }, db);
    await assert.rejects(directCorrection(admin.headers, {
      requestKey: randomUUID(), id: receiptOrigin, reason: "Pembatalan berdampak pada pengiriman", proposed: "cancel",
    }, db), /Stok pakan tidak cukup/);
    assert.equal((await financeSummary(owner.headers, period, db)).expense, BigInt(25000));
    assert.equal(await db.select().from(farmEvents).where(eq(farmEvents.reversesId, receiptOrigin)).then((rows) => rows.length), 0);
    assert.ok(await feedProjection(db));
  });

  await t.test("request, rejection, administrator approval and historical population replay", async () => {
    const initial = await addMovement(abk.headers, { ...record(yesterday), flockId, kind: "death", count: "8", reason: "Jumlah tercatat saat pengamatan" }, db);
    const submit = { id: initial.id, requestKey: randomUUID(), reason: "Koreksi hasil hitung", proposed: "count", count: "6" };
    const pending = await requestCorrection(abk.headers, submit, db);
    assert.equal((await requestCorrection(abk.headers, submit, db)).replay, true);
    assert.equal((await populationDashboard(owner.headers, { ...period, flockId }, db)).timeline[2].hens, 72);
    const review = { id: pending.id, requestKey: randomUUID(), outcome: "approved", reason: "Hasil pengamatan diperiksa ulang" };
    await assert.rejects(reviewCorrection(abk.headers, review, db), /tidak memiliki akses/);
    await reviewCorrection(admin.headers, { ...review, outcome: "rejected" }, db);
    assert.equal((await populationDashboard(owner.headers, { ...period, flockId }, db)).timeline[2].hens, 72);
    const second = await requestCorrection(abk.headers, { ...submit, requestKey: randomUUID() }, db);
    const results = await Promise.allSettled([
      reviewCorrection(admin.headers, { ...review, id: second.id, requestKey: randomUUID() }, db),
      reviewCorrection(admin.headers, { ...review, id: second.id, requestKey: randomUUID() }, db),
    ]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    const view = await correctionView(abk.headers, db);
    const applied = view.requests.find(({ request }) => request.id === second.id)?.request;
    assert.equal(applied?.reviewerId, admin.id);
    assert.equal(applied?.requesterId, abk.id);
    assert.equal(applied?.status, "approved");
    assert.deepEqual((await populationDashboard(owner.headers, { ...period, flockId }, db)).timeline.map(({ hens }) => hens), [80, 74, 74]);
  });

  await t.test("receipt limits, private delivery, replay, replacement history and orphan recovery", async () => {
    const payload = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 23, g: 40, b: 83 } } }).png().toBuffer();
    const flags = { uploads: 0, signing: 0, deleteRetries: 0 };
    const stored = new Map<string, string>();
    const provider: ReceiptProvider = {
      async upload(path) {
        flags.uploads++;
        const id = randomUUID();
        stored.set(path, id);
        return { id, path };
      },
      async remove(id) {
        for (const [path, value] of stored) if (id === value) stored.delete(path);
      },
      async find(path) { return stored.get(path) ?? null; },
      signed() { flags.signing++; return "https://private.example.test/signed"; },
    };
    await assert.rejects(validateReceipt(payload, "image/svg+xml"), /JPEG/);
    await assert.rejects(validateReceipt(payload, "image/jpeg"), /tidak valid/);
    await assert.rejects(validateReceipt(Buffer.alloc(receiptLimit + 1), "image/png"), /2 MiB/);
    const input = { cashId, requestId: randomUUID(), bytes: payload, mime: "image/png" };
    await assert.rejects(uploadReceipt(abk.headers, input, db, provider), /tidak memiliki akses/);
    const first = await uploadReceipt(admin.headers, input, db, provider);
    assert.equal((await uploadReceipt(admin.headers, input, db, provider)).replay, true);
    const second = await uploadReceipt(admin.headers, { ...input, requestId: randomUUID() }, db, provider);
    assert.equal(flags.uploads, 2);
    await assert.rejects(receiptDelivery(abk.headers, { cashId }, db, provider), /tidak memiliki akses/);
    await assert.rejects(receiptDelivery(owner.headers, { cashId: receiptOrigin, receiptId: first.id }, db, provider), /tidak ditemukan/);
    assert.equal(flags.signing, 0);
    assert.equal(await receiptDelivery(owner.headers, { cashId, receiptId: first.id }, db, provider), "https://private.example.test/signed");
    const history = await receiptHistory(owner.headers, cashId, db);
    assert.deepEqual(history.map(({ id, status }) => [id, status]), [[second.id, "active"], [first.id, "replaced"]]);

    const failingCash = (await postCash(admin.headers, { ...record(now), amount: "1000", category: "Transaksi uji pemulihan", direction: "income" }, db)).id;
    const suspect = { ...input, cashId: failingCash, requestId: randomUUID() };
    const failing: ReceiptProvider = { ...provider, async upload(path, bytes, mime) {
      const remote = await provider.upload(path, bytes, mime);
      await directCorrection(admin.headers, { id: failingCash, requestKey: randomUUID(), reason: "Pembatalan selama unggahan", proposed: "cancel" }, db);
      return remote;
    }, async remove() { flags.deleteRetries++; throw new Error("temporary provider failure"); } };
    await assert.rejects(uploadReceipt(admin.headers, suspect, db, failing), /Bukti gagal disimpan/);
    const [orphan] = await db.select().from(transactionReceipts).where(eq(transactionReceipts.id, suspect.requestId));
    assert.equal(orphan.status, "cleanup_pending");
    assert.ok(stored.has(orphan.filePath));
    assert.equal(flags.deleteRetries, 1);
    await db.update(transactionReceipts).set({ recordedAt: new Date(Date.now() - 360_000) }).where(eq(transactionReceipts.id, suspect.requestId));
    assert.equal((await reconcileReceipts(admin.headers, db, provider)).cleared, 1);
    assert.ok(!stored.has(orphan.filePath));

    const rejected = { ...input, requestId: randomUUID() };
    await assert.rejects(uploadReceipt(admin.headers, rejected, db, { ...provider, async upload() { throw new Error("unavailable"); } }), /Bukti gagal disimpan/);
    const [unchanged] = await db.select().from(transactionReceipts).where(and(eq(transactionReceipts.cashId, cashId), eq(transactionReceipts.status, "active")));
    assert.equal(unchanged.id, second.id);
  });
});
