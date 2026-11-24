import assert from "node:assert/strict";
import { test } from "node:test";
import { businessDate, formatIDR } from "../../lib/format";
import { canViewModule, modules } from "../../lib/navigation";
import { emailSchema, kilogramsSchema, rupiahSchema } from "../../lib/validation";
import { bootstrapSchema, changePasswordSchema, completeLinkSchema, loginSchema } from "../../lib/account-validation";

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
  const password = " awal 8 ";
  assert.equal(changePasswordSchema.safeParse({ current: password, password, confirmation: password }).success, false);
  assert.equal(changePasswordSchema.safeParse({ current: "old", password, confirmation: password.trim() }).success, false);
  assert.equal(changePasswordSchema.parse({ current: "old", password, confirmation: password }).password, password);
});

test("new passwords use the same boundaries for bootstrap, activation, reset, and profile", () => {
  const email = "operator@example.test";
  for (const [length, accepted] of [[7, false], [8, true], [128, true], [129, false]] as const) {
    const password = "a".repeat(length);
    const values = { password, confirmation: password };
    assert.equal(bootstrapSchema.safeParse({ email, name: "Operator", password }).success, accepted);
    assert.equal(changePasswordSchema.safeParse({ current: "old", ...values }).success, accepted);
    for (const purpose of ["activation", "reset"]) {
      assert.equal(completeLinkSchema.safeParse({ purpose, token: "a".repeat(24), ...values }).success, accepted);
    }
  }
  assert.equal(loginSchema.parse({ email, password: " lama " }).password, " lama ");
});

test("module visibility follows the documented scope", () => {
  assert.equal(modules.filter((module) => canViewModule("administrator", module)).length, 8);
  assert.deepEqual(modules.filter((module) => canViewModule("reseller", module)).map(({ slug }) => slug), ["reseller", "laporan", "pengaturan"]);
  assert.equal(modules.some((module) => module.slug === "keuangan" && canViewModule("abk", module)), false);
});
