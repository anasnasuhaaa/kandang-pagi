import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { connectDatabase } from "../../db";
import { resellerCash, resellerSpaces, resellerStock } from "../../db/schema";
import { businessDate, formatIDR, shiftBusinessDate } from "../../lib/format";
import { financeView } from "../../server/services/finance";
import { addMovement, createBarn, createFlock } from "../../server/services/population";
import { renderReportPdf } from "../../server/services/report-pdf";
import { reportData, reportFilters } from "../../server/services/reports";
import { cancelResellerEvent, defineResellerUnit, openResellerCash, postResellerCash, postResellerStock, resellerView } from "../../server/services/reseller";
import { fixtureActor } from "./fixtures";
import { testDatabaseUrl } from "./test-database";

test("independent reseller ledgers and authorized historical PDF reports", async (t) => {
  const { client, db } = connectDatabase(testDatabaseUrl());
  t.after(() => client.end());
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const admin = await fixtureActor(db, "administrator");
  const abk = await fixtureActor(db, "abk");
  const owner = await fixtureActor(db, "pemilik");
  const resellerA = await fixtureActor(db, "reseller");
  const resellerB = await fixtureActor(db, "reseller");
  const [spaceA, spaceB] = await db.insert(resellerSpaces).values([{ userId: resellerA.id }, { userId: resellerB.id }]).returning();
  const today = businessDate();
  const d1 = shiftBusinessDate(today, -4);
  const d2 = shiftBusinessDate(today, -3);
  const period = { from: d1, to: today };
  const entry = (businessDate = d1) => ({ requestKey: randomUUID(), businessDate, note: "" });
  let tray: string;
  let bUnit: string;
  let intakeA: string;
  let saleId: string;

  await t.test("factor versions, own stock and measured kg are independent", async () => {
    tray = (await defineResellerUnit(resellerA.headers, { ...entry(), code: "wadah", name: "Kotak usaha A", piecesPerUnit: "24", status: "active" }, db)).id;
    bUnit = (await defineResellerUnit(resellerB.headers, { ...entry(), code: "wadah", name: "Kotak rahasia B", piecesPerUnit: "15", status: "active" }, db)).id;
    await openResellerCash(resellerA.headers, { ...entry(), amount: "400000", note: "Dana awal usaha A" }, db);
    const stock = { ...entry(), category: "coklat", unit: "packaging", unitId: tray, unitCount: "4", amount: "100000", note: "Penerimaan usaha A" };
    intakeA = (await postResellerStock(resellerA.headers, stock, "intake", db)).id;
    assert.equal((await postResellerStock(resellerA.headers, stock, "intake", db)).replay, true);
    await defineResellerUnit(resellerA.headers, { ...entry(d2), code: "wadah", name: "Kotak A versi berikut", piecesPerUnit: "20", status: "active" }, db);
    const [received] = await db.select().from(resellerStock).where(and(eq(resellerStock.spaceId, spaceA.id), eq(resellerStock.id, intakeA)));
    assert.equal(received.piecesPerUnit, 24);
    assert.equal(received.deltaPieces, 96);
    await assert.rejects(postResellerStock(resellerA.headers, { ...entry(d2), category: "putih", unit: "kg", weight: "2", amount: "0" }, "intake", db));
    await postResellerStock(resellerA.headers, { ...entry(d2), category: "putih", unit: "kg", weight: "2", pieces: "31", amount: "0" }, "intake", db);
    await postResellerStock(resellerB.headers, { ...entry(), category: "coklat", unit: "packaging", unitId: bUnit, unitCount: "1", amount: "0", note: "Data privat ruang B" }, "intake", db);
    assert.equal((await resellerView(resellerA.headers, period, db)).balances.putih, 31);
    assert.equal((await resellerView(resellerB.headers, period, db)).balances.coklat, 15);
  });

  await t.test("tenant guard blocks foreign units, entries and financial reads", async () => {
    const payload = { ...entry(), category: "coklat", unit: "packaging", unitId: bUnit, unitCount: "1", amount: "0", spaceId: spaceB.id };
    await assert.rejects(postResellerStock(resellerA.headers, payload, "intake", db), /Satuan reseller tidak ditemukan/);
    await assert.rejects(cancelResellerEvent(resellerB.headers, { id: intakeA, requestKey: randomUUID(), reason: "Catatan di ruang lain" }, db), /tidak ditemukan/);
    await assert.rejects(resellerView(admin.headers, period, db), /tidak memiliki akses/);
    await assert.rejects(financeView(resellerA.headers, period, db), /tidak memiliki akses/);
    const data = await resellerView(resellerA.headers, period, db);
    assert.ok(!data.units.some((unit) => unit.id === bUnit));
    assert.ok(data.events.every((row) => !row.note.includes("ruang B")));
  });

  await t.test("parallel cash sales, reversals and dated balances preserve independent positions", async () => {
    const historic = await resellerView(resellerA.headers, { from: d1, to: d1 }, db);
    assert.equal(historic.balances.coklat, 96);
    assert.equal(historic.finance.balance, BigInt(300000));
    assert.equal(historic.finance.income, BigInt(0));
    const sale = { ...entry(d2), category: "coklat", unit: "packaging", unitId: tray, unitCount: "3", amount: "60000" };
    const different = { ...sale, requestKey: randomUUID() };
    const concurrent = await Promise.allSettled([
      postResellerStock(resellerA.headers, sale, "sale", db), postResellerStock(resellerA.headers, different, "sale", db),
    ]);
    assert.equal(concurrent.filter(({ status }) => status === "fulfilled").length, 1);
    const winning = concurrent[0].status === "fulfilled" ? sale : different;
    const replay = await postResellerStock(resellerA.headers, winning, "sale", db);
    assert.equal(replay.replay, true);
    saleId = replay.id;
    const [line] = await db.select().from(resellerStock).where(and(eq(resellerStock.spaceId, spaceA.id), eq(resellerStock.id, saleId)));
    assert.equal(line.piecesPerUnit, 20);
    assert.equal(line.deltaPieces, -60);
    assert.equal((await db.select().from(resellerCash).where(and(eq(resellerCash.spaceId, spaceA.id), eq(resellerCash.id, saleId)))).length, 1);
    await assert.rejects(cancelResellerEvent(resellerA.headers, { id: intakeA, requestKey: randomUUID(), reason: "Batalkan stok sumber" }, db), /Stok reseller tidak cukup/);
    await postResellerCash(resellerA.headers, { ...entry(today), amount: "5000", direction: "expense", category: "Transportasi usaha" }, db);
    await cancelResellerEvent(resellerA.headers, { id: saleId, requestKey: randomUUID(), reason: "Penjualan dibatalkan" }, db);
    assert.equal((await resellerView(resellerA.headers, period, db)).balances.coklat, 96);
    assert.equal((await resellerView(resellerA.headers, period, db)).finance.balance, BigInt(295000));
    assert.equal((await resellerView(resellerB.headers, period, db)).finance.balance, BigInt(0));
  });

  await t.test("role-specific reports and actual PDF use matching historical data", async () => {
    const barn = await createBarn(admin.headers, { requestKey: randomUUID(), code: "RP-B", name: "Kandang Laporan Uji", location: "" }, db);
    const flock = await createFlock(admin.headers, { ...entry(), code: "RP-F", name: "Kelompok Laporan Uji", barnId: barn.id,
      kind: "arrival", count: "75", age: "90", origin: "Peternakan Uji", reason: "Masuk kelompok laporan",
    }, db);
    await addMovement(admin.headers, { ...entry(d2), kind: "death", count: "5", flockId: flock.id, reason: "Mutasi setelah tanggal laporan" }, db);
    const inputs = { jenis: "operasional", mulai: d1, akhir: d1, kandang: barn.id };
    const historic = await reportData(abk.headers, inputs, db);
    assert.equal(historic.sections[0].rows[0][1], "75");
    assert.equal((await reportData(abk.headers, { ...inputs, akhir: d2 }, db)).sections[0].rows[1][1], "70");
    assert.deepEqual((await reportFilters(resellerA.headers, db)).families, ["reseller"]);
    await assert.rejects(reportData(resellerA.headers, inputs, db), /tidak memiliki akses/);
    await assert.rejects(reportData(abk.headers, { jenis: "keuangan" }, db), /tidak memiliki akses/);
    await assert.rejects(reportData(admin.headers, { jenis: "reseller", reseller: spaceB.id }, db), /tidak memiliki akses/);
    const farmFinance = await reportData(owner.headers, { jenis: "keuangan", mulai: d1, akhir: today, transaksi: "expense" }, db);
    assert.ok(farmFinance.sections[0].rows.every((row) => row[1] === "Pengeluaran"));

    const own = await reportData(resellerA.headers, { jenis: "reseller", mulai: d1, akhir: today, tenantId: spaceB.id }, db);
    assert.equal(own.metrics.find(({ label }) => label === "Saldo akhir kas")?.value, formatIDR(BigInt(295000)));
    assert.ok(!JSON.stringify(own).includes("Kotak rahasia B"));
    assert.ok(!JSON.stringify(own).includes("Data privat ruang B"));
    const bytes = await renderReportPdf(own);
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    const loaded = await PDFDocument.load(bytes);
    assert.match(loaded.getTitle() ?? "", /Usaha reseller/i);
    assert.ok(loaded.getPageCount() > 0);
    const long = await renderReportPdf({ ...own, sections: [{
      title: "Rincian panjang", columns: ["Tanggal", "Keterangan"], rows: Array.from({ length: 90 }, () => ["Tanggal kerja", "Rincian teruji"]),
    }] });
    assert.ok((await PDFDocument.load(long)).getPageCount() >= 3);
  });
});
