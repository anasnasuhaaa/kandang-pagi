import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMovement, productionRates, type Movement } from "../../lib/domain/livestock";

const defaults = { flockId: "flock", fromBarnId: null, toBarnId: null };
function move(input: Partial<Movement> & Pick<Movement, "kind" | "count">) {
  return { ...defaults, ...input };
}

test("dated movement replay preserves headcount during full transfer", () => {
  const placed = applyMovement(undefined, move({ kind: "arrival", count: 100, toBarnId: "A" }));
  const afterDeath = applyMovement(placed, move({ kind: "death", count: 15, fromBarnId: "A" }));
  const transferred = applyMovement(afterDeath, move({ kind: "transfer", count: 85, fromBarnId: "A", toBarnId: "B" }));
  assert.deepEqual(placed, { barnId: "A", alive: 100 });
  assert.deepEqual(transferred, { barnId: "B", alive: 85 });
  assert.throws(() => applyMovement(afterDeath, move({ kind: "transfer", count: 15, fromBarnId: "A", toBarnId: "B" })));
  assert.throws(() => applyMovement(transferred, move({ kind: "death", count: 86, fromBarnId: "B" })), /negatif/);
  assert.throws(() => applyMovement(transferred, move({ kind: "arrival", count: 10, toBarnId: "B" })), /penempatan awal/);
});

test("HDP and HHP weight valid dates by livestock exposure", () => {
  const days = [
    { eggs: 850, hens: 1000, housed: 1000, recorded: true, mixed: false },
    { eggs: 100, hens: 200, housed: 1000, recorded: true, mixed: false },
    { eggs: 0, hens: 200, housed: 1000, recorded: false, mixed: false },
  ];
  assert.equal(productionRates(days.slice(0, 1), "flock").hdp, 85);
  const result = productionRates(days, "flock");
  assert.equal(result.hdp, 950 * 100 / 1200);
  assert.equal(result.hhp, 47.5);
  assert.equal(result.measuredDays, 2);
  assert.equal(result.activeDays, 3);
});

test("mixed harvest cannot attribute to a flock and zero hens leave HDP unavailable", () => {
  const mixed = { eggs: 80, hens: 100, housed: 100, recorded: true, mixed: true };
  assert.equal(productionRates([mixed], "farm").hdp, 80);
  assert.equal(productionRates([mixed], "barn").hdp, 80);
  assert.equal(productionRates([mixed], "flock").hdp, null);
  assert.equal(productionRates([mixed], "flock").hhp, null);
  const last = { eggs: 20, hens: 0, housed: 100, recorded: true, mixed: false };
  assert.equal(productionRates([last], "flock").hdp, null);
  assert.equal(productionRates([last], "flock").hhp, 20);
});
