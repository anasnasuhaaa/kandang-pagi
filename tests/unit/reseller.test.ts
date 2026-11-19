import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { packagingPieces, resellerStockAmount, resellerTransactionSchema, unitDefinitionSchema } from "../../lib/domain/reseller";
import { businessDate } from "../../lib/format";
import { reportQuerySchema } from "../../lib/domain/report";

test("configured packaging conversion is integer and guards unsafe multiplication", () => {
  assert.equal(packagingPieces(3, 24), 72);
  assert.throws(() => packagingPieces(10.2, 24), /bilangan bulat/);
  assert.throws(() => packagingPieces(12, 0), /bilangan bulat/);
  assert.throws(() => packagingPieces(Number.MAX_SAFE_INTEGER, 2), /terlalu besar/);
  assert.equal(unitDefinitionSchema.safeParse({
    requestKey: randomUUID(), businessDate: businessDate(), name: "Kilogram", code: "kg", piecesPerUnit: "7", status: "active",
  }).success, false);
});

test("kilograms are weighed separately from independent physical piece count", () => {
  assert.equal(resellerStockAmount("kg", 25, 1800), 25);
  assert.throws(() => resellerStockAmount("kg", 0, 1800), /jumlah butir/);
  assert.throws(() => resellerStockAmount("kg", 25), /berat aktual/);
  const fields = { requestKey: randomUUID(), businessDate: businessDate(), category: "campur", unit: "kg", amount: "10000", weight: "1,8" };
  assert.equal(resellerTransactionSchema.safeParse(fields).success, false);
  assert.equal(resellerTransactionSchema.safeParse({ ...fields, pieces: "25" }).success, true);
});

test("report filter restricts invalid dates and more than 90 business days", () => {
  assert.equal(reportQuerySchema.safeParse({ jenis: "operasional", mulai: "2026-01-01", akhir: "2026-04-01" }).success, false);
  assert.equal(reportQuerySchema.safeParse({ jenis: "operasional", mulai: "2026-02-30" }).success, false);
  assert.equal(reportQuerySchema.safeParse({ jenis: "operasional", mulai: businessDate(), akhir: businessDate() }).success, true);
});
