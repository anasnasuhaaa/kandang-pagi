import assert from "node:assert/strict";
import { test } from "node:test";
import { businessDate, formatIDR } from "../../lib/format";
import { canViewModule, modules } from "../../lib/navigation";
import { emailSchema, kilogramsSchema, rupiahSchema } from "../../lib/validation";
import { changePasswordSchema } from "../../lib/account-validation";

test("Jakarta business date switches at 17:00 UTC", () => {
  assert.equal(businessDate(new Date("2026-11-18T16:59:59.999Z")), "2026-11-18");
  assert.equal(businessDate(new Date("2026-11-18T17:00:00.000Z")), "2026-11-19");
});

test("rupiah and weights normalize without rounding", () => {
  assert.equal(rupiahSchema.parse("Rp 123.456.700"), BigInt(123456700));
  assert.match(formatIDR(BigInt(123456700)), /123\.456\.700/);
  assert.equal(kilogramsSchema.parse("12,003"), 12003);
  for (const amount of ["-1", "1,5", "1.00", "1e3"]) assert.equal(rupiahSchema.safeParse(amount).success, false);
  for (const weight of ["0.0001", "10,000.5", "-1", "1e3"]) assert.equal(kilogramsSchema.safeParse(weight).success, false);
});

test("email normalization and password confirmation enforce field rules", () => {
  assert.equal(emailSchema.parse("  OPERATOR@example.test "), "operator@example.test");
  assert.equal(changePasswordSchema.safeParse({ current: "a".repeat(12), password: "a".repeat(12), confirmation: "a".repeat(12) }).success, false);
  assert.equal(changePasswordSchema.safeParse({ current: "a".repeat(12), password: "b".repeat(12), confirmation: "c".repeat(12) }).success, false);
  assert.equal(changePasswordSchema.safeParse({ current: "a".repeat(12), password: "b".repeat(12), confirmation: "b".repeat(12) }).success, true);
});

test("module visibility follows the documented scope", () => {
  assert.equal(modules.filter((module) => canViewModule("administrator", module)).length, 8);
  assert.deepEqual(modules.filter((module) => canViewModule("reseller", module)).map(({ slug }) => slug), ["reseller", "laporan", "pengaturan"]);
  assert.equal(modules.some((module) => module.slug === "keuangan" && canViewModule("abk", module)), false);
});
