import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { database } from "../../db";
import { farmCash, farmEvents, transactionReceipts } from "../../db/schema";
import { cashOpeningSchema, manualCashSchema } from "../../lib/domain/finance-input";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { farmCommand, isEffective, parseInput, type Store } from "./farm";

export const financeReaders = ["administrator", "pemilik"] as const;

export async function openCash(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "cash_opening", parseInput(cashOpeningSchema, raw),
    async (tx, _, event, input) => {
      const [previous] = await tx.select({ id: farmCash.id }).from(farmCash).innerJoin(farmEvents, eq(farmEvents.id, farmCash.id))
        .where(and(eq(farmCash.direction, "opening"), isEffective(tx))).limit(1);
      if (previous) throw new ServiceError("conflict", "Kas farm sudah memiliki saldo awal.");
      const [earlier] = await tx.select({ id: farmCash.id }).from(farmCash).innerJoin(farmEvents, eq(farmEvents.id, farmCash.id))
        .where(and(isEffective(tx), lt(farmEvents.businessDate, input.businessDate))).limit(1);
      if (earlier) throw new ServiceError("conflict", "Saldo awal harus dicatat sebelum transaksi kas pertama.");
      await tx.insert(farmCash).values({ id: event.id, direction: "opening", deltaIdr: input.amount, category: "Saldo awal" });
    });
}

export async function postCash(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "cash_manual", parseInput(manualCashSchema, raw),
    async (tx, _, event, input) => {
      await tx.insert(farmCash).values({
        id: event.id, direction: input.direction, category: input.category,
        deltaIdr: input.direction === "income" ? input.amount : -input.amount,
      });
    });
}

export async function farmCashSummary(store: Store, period: { from: string; to: string }) {
  const original = alias(farmCash, "cash_original");
  const movements = await store.select({
    delta: farmCash.deltaIdr, direction: farmCash.direction, day: farmEvents.businessDate, original: original.direction,
  }).from(farmCash).innerJoin(farmEvents, eq(farmEvents.id, farmCash.id))
    .leftJoin(original, eq(farmCash.reversesId, original.id)).where(lte(farmEvents.businessDate, period.to));
  let balance = BigInt(0);
  let income = BigInt(0);
  let expense = BigInt(0);
  let opening = BigInt(0);
  let activeOpenings = 0;
  let starting = BigInt(0);
  for (const row of movements) {
    balance += row.delta;
    if (row.day < period.from) starting += row.delta;
    const direction = row.original ?? row.direction;
    if (direction === "opening") {
      opening += row.delta;
      activeOpenings += row.direction === "reversal" ? -1 : 1;
    }
    if (row.day < period.from) continue;
    if (direction === "income") income += row.delta;
    if (direction === "expense") expense -= row.delta;
  }
  return { balance, income, expense, opening, starting, hasOpening: activeOpenings > 0, count: movements.length, net: income - expense };
}

export async function financeView(headers: Headers, period: { from: string; to: string }, db = database()) {
  await requireRole(headers, financeReaders, db);
  const [summary, rows] = await Promise.all([
    farmCashSummary(db, period),
    db.select({
      id: farmCash.id, direction: farmCash.direction, category: farmCash.category, delta: farmCash.deltaIdr,
      reversesId: farmCash.reversesId, date: farmEvents.businessDate, origin: farmEvents.kind, note: farmEvents.note,
      effective: isEffective(db), attachment: transactionReceipts.id,
    }).from(farmCash).innerJoin(farmEvents, eq(farmCash.id, farmEvents.id))
      .leftJoin(transactionReceipts, and(eq(transactionReceipts.cashId, farmCash.id), eq(transactionReceipts.status, "active")))
      .where(and(gte(farmEvents.businessDate, period.from), lte(farmEvents.businessDate, period.to)))
      .orderBy(desc(farmEvents.businessDate), desc(farmEvents.sequence)),
  ]);
  return { ...summary, rows };
}

export async function financeSummary(headers: Headers, period: { from: string; to: string }, db = database()) {
  await requireRole(headers, financeReaders, db);
  return farmCashSummary(db, period);
}
