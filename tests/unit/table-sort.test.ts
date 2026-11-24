import assert from "node:assert/strict";
import { test } from "node:test";
import { rawReportSortValue, reportCell, reportSection, selectReportRows } from "../../lib/domain/report";
import { compareSortValues, nextTableSort, readTableSort, sortTableRows, tableColumn } from "../../lib/domain/table-sort";

test("table sorting preserves exact amounts, stable ties and missing values", () => {
  const items = [
    { id: "high", value: BigInt("9007199254740993") },
    { id: "missing", value: null },
    { id: "first", value: BigInt("9007199254740992") },
    { id: "zero", value: BigInt(0) },
    { id: "second", value: BigInt("9007199254740992") },
  ];
  const ids = (direction: "asc" | "desc") => sortTableRows(items, direction, (item) => item.value).map(({ id }) => id);
  assert.deepEqual(ids("asc"), ["zero", "first", "second", "high", "missing"]);
  assert.deepEqual(ids("desc"), ["high", "first", "second", "zero", "missing"]);
  assert.equal(items[0].id, "high");
});

test("table sorting compares dates, Indonesian text and quantities within each unit", () => {
  assert.ok(compareSortValues("2026-01-31", "2026-02-01") < 0);
  assert.ok(compareSortValues(new Date("2026-02-01T00:30:00+07:00"), new Date("2026-01-31T20:00:00Z")) < 0);
  assert.ok(compareSortValues("Kandang 2", "kandang 12") < 0);
  assert.ok(compareSortValues("Disetujui", "Menunggu") < 0);
  assert.ok(compareSortValues(2, 10) < 0);
  assert.ok(compareSortValues({ unit: "kg", amount: 500 }, { unit: "kg", amount: 3000 }) < 0);
  assert.ok(compareSortValues({ unit: "butir", amount: 5000 }, { unit: "kg", amount: 2 }) < 0);
});

test("query validation and explicit sorting reset keep default order available", () => {
  const sort = readTableSort({ urut: "amount", arah: "asc" });
  assert.deepEqual(sort, { column: "amount", direction: "asc" });
  assert.deepEqual(nextTableSort("amount", sort), { column: "amount", direction: "desc" });
  assert.equal(nextTableSort("amount", nextTableSort("amount", sort)), undefined);
  assert.equal(readTableSort({ urut: ["amount", "name"], arah: "asc" }), undefined);
  assert.equal(readTableSort({ urut: "name", arah: "invalid" }), undefined);
  assert.equal(readTableSort({ urut: "name desc", arah: "asc" }), undefined);
});

test("report filtering and truncation retain stable row IDs and exact browser sort values", () => {
  const large = BigInt("9007199254740993");
  const report = reportSection("Uji", [tableColumn("amount", "Jumlah", "number")], [
    { id: "a", cells: [reportCell(100, "Di luar filter")] },
    { id: "b", cells: [reportCell(large, "Saldo besar")] },
    { id: "c", cells: [reportCell(0, "Saldo nol")] },
  ]);
  const { section, truncated } = selectReportRows(report, (row) => row[0].startsWith("Saldo"), 1);
  assert.equal(truncated, true);
  assert.deepEqual(section.rows, [["Saldo besar"]]);
  assert.equal(section.rowMeta[0].id, "b");
  assert.equal(rawReportSortValue(section.rowMeta[0].values[0]), large);
  assert.doesNotThrow(() => JSON.stringify(section));
  assert.equal(report.rows.length, 3);
});
