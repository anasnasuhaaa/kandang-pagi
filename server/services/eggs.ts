import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { database, type Transaction } from "../../db";
import {
  barns, eggGradings, eggHarvests, eggSaleLines, eggSales, eggStockMovements, farmCash, farmEvents, flocks,
} from "../../db/schema";
import { InventoryConflict, reconcileEggs, type EggDelta } from "../../lib/domain/inventory";
import { eggAdjustmentSchema, gradingSchema, harvestSchema, saleSchema, sortedCategories } from "../../lib/domain/production-input";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { assertActiveBarn, farmCommand, farmOperators, farmReaders, isEffective, parseInput, type Store } from "./farm";
import { populationPeriodData } from "./population";

const eggKinds = ["egg_harvest", "egg_grading", "egg_sale", "egg_adjustment"] as const;

export async function eggProjection(store: Store, end?: string, omittedId?: string) {
  const rows = await store.select({
    harvestId: eggStockMovements.harvestId, category: eggStockMovements.category, pieces: eggStockMovements.deltaPieces,
  }).from(eggStockMovements).innerJoin(farmEvents, eq(farmEvents.id, eggStockMovements.eventId))
    .where(and(isEffective(store), inArray(farmEvents.kind, eggKinds), end ? lte(farmEvents.businessDate, end) : undefined,
      omittedId ? ne(farmEvents.id, omittedId) : undefined))
    .orderBy(asc(farmEvents.businessDate), asc(farmEvents.sequence), asc(eggStockMovements.id));
  try {
    return reconcileEggs(rows);
  } catch (error) {
    if (error instanceof InventoryConflict) throw new ServiceError("conflict", error.message);
    throw error;
  }
}

async function insertEggMoves(tx: Transaction, eventId: string, moves: EggDelta[]) {
  const rows = moves.filter(({ pieces }) => pieces !== 0);
  if (rows.length) await tx.insert(eggStockMovements).values(rows.map((row) => ({
    eventId, harvestId: row.harvestId, category: row.category, deltaPieces: row.pieces,
  })));
}

export async function harvestEggs(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "egg_harvest", parseInput(harvestSchema, raw),
    async (tx, _, event, input) => {
      await assertActiveBarn(tx, input.barnId);
      const flockId = input.attribution === "flock" ? input.flockId : null;
      const day = (await populationPeriodData(tx, { from: input.businessDate, to: input.businessDate, barnId: input.barnId, flockId: flockId ?? undefined })).timeline[0];
      if (!day.activeBarnIds.includes(input.barnId)) {
        throw new ServiceError("conflict", flockId ? "Kelompok tidak berada di kandang ini pada tanggal panen." : "Kandang tidak memiliki kelompok aktif pada tanggal panen.");
      }
      await tx.insert(eggHarvests).values({
        id: event.id, barnId: input.barnId, flockId, pieces: input.count, measuredGrams: input.weighed,
        massIncomplete: input.massStatus === "incomplete",
      });
      await insertEggMoves(tx, event.id, [{ category: "ungraded", harvestId: event.id, pieces: input.count }]);
      await eggProjection(tx);
    });
}

export async function gradeEggs(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "egg_grading", parseInput(gradingSchema, raw),
    async (tx, _, event, input) => {
      const [lot] = await tx.select({ id: eggHarvests.id }).from(eggHarvests)
        .innerJoin(farmEvents, eq(farmEvents.id, eggHarvests.id))
        .where(and(eq(eggHarvests.id, input.harvestId), isEffective(tx), lte(farmEvents.businessDate, event.businessDate)));
      if (!lot) throw new ServiceError("not-found", "Lot panen tidak tersedia pada tanggal sortir.");
      const count = sortedCategories.reduce((total, category) => total + input[category], 0);
      await tx.insert(eggGradings).values({
        id: event.id, harvestId: lot.id, brown: input.coklat, white: input.putih, defective: input.cacat,
      });
      await insertEggMoves(tx, event.id, [
        { category: "ungraded", harvestId: lot.id, pieces: -count },
        ...sortedCategories.map((category) => ({ category, harvestId: lot.id, pieces: input[category] })),
      ]);
      await eggProjection(tx);
    });
}

export async function sellEggs(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, ["administrator"], db, "egg_sale", parseInput(saleSchema, raw),
    async (tx, _, event, input) => {
      await tx.insert(eggSales).values({ id: event.id, buyer: input.buyer, paidIdr: input.paid });
      await tx.insert(eggSaleLines).values(input.lines.map((line) => ({
        saleId: event.id, category: line.category, pieces: line.count, unitPriceIdr: line.price,
      })));
      await insertEggMoves(tx, event.id, input.lines.map((line) => ({ category: line.category, harvestId: null, pieces: -line.count })));
      await tx.insert(farmCash).values({ id: event.id, direction: "income", category: "Penjualan telur", deltaIdr: input.paid });
      await eggProjection(tx);
    });
}

export async function adjustEggs(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(eggAdjustmentSchema, raw);
  const allowed = input.mode === "loss" ? farmOperators : ["administrator"] as const;
  return farmCommand(headers, allowed, db, "egg_adjustment", input,
    async (tx, _, event, input) => {
      if (input.mode === "opening") {
        const [prior] = await tx.select({ id: eggStockMovements.id }).from(eggStockMovements)
          .innerJoin(farmEvents, eq(farmEvents.id, eggStockMovements.eventId)).where(and(
            eq(eggStockMovements.category, input.category), isEffective(tx),
            lte(farmEvents.businessDate, event.businessDate), ne(farmEvents.id, event.id),
          )).limit(1);
        if (prior) throw new ServiceError("conflict", "Saldo awal harus mendahului pergerakan stok pertama.");
      }
      const increase = input.mode === "increase" || input.mode === "opening";
      await insertEggMoves(tx, event.id, [{ category: input.category, harvestId: input.harvestId ?? null, pieces: increase ? input.count : -input.count }]);
      await eggProjection(tx);
    });
}

export async function eggView(headers: Headers, period: { from: string; to: string }, db = database()) {
  const actor = await requireRole(headers, farmReaders, db);
  const includeMoney = actor.role !== "abk";
  const [stock, barnRows, flockRows, harvests, graded, sales, lines, moves, events] = await Promise.all([
    eggProjection(db, period.to),
    db.select({ id: barns.id, name: barns.name, active: barns.active }).from(barns).orderBy(barns.name),
    db.select({ id: flocks.id, name: flocks.name, code: flocks.code }).from(flocks).orderBy(flocks.name),
    db.select({ ...{
      id: eggHarvests.id, barnId: eggHarvests.barnId, flockId: eggHarvests.flockId, pieces: eggHarvests.pieces,
      grams: eggHarvests.measuredGrams, incomplete: eggHarvests.massIncomplete, day: farmEvents.businessDate,
    }, current: isEffective(db) }).from(eggHarvests)
      .innerJoin(farmEvents, eq(farmEvents.id, eggHarvests.id)).where(lte(farmEvents.businessDate, period.to))
      .orderBy(asc(farmEvents.businessDate), asc(farmEvents.sequence)),
    db.select().from(eggGradings),
    db.select({ id: eggSales.id, ...(includeMoney ? { buyer: eggSales.buyer, paid: eggSales.paidIdr } : {}) }).from(eggSales),
    db.select({ saleId: eggSaleLines.saleId, category: eggSaleLines.category, pieces: eggSaleLines.pieces }).from(eggSaleLines),
    db.select().from(eggStockMovements).innerJoin(farmEvents, eq(farmEvents.id, eggStockMovements.eventId))
      .where(and(gte(farmEvents.businessDate, period.from), lte(farmEvents.businessDate, period.to), inArray(farmEvents.kind, eggKinds))),
    db.select({
      id: farmEvents.id, day: farmEvents.businessDate, kind: farmEvents.kind, note: farmEvents.note, recordedAt: farmEvents.recordedAt, effective: isEffective(db),
    }).from(farmEvents).where(and(inArray(farmEvents.kind, eggKinds), gte(farmEvents.businessDate, period.from), lte(farmEvents.businessDate, period.to)))
      .orderBy(asc(farmEvents.businessDate), asc(farmEvents.sequence)),
  ]);
  return {
    stock, barns: barnRows, flocks: flockRows, harvests,
    events: events.reverse().map((event) => ({
      ...event, ...(actor.role === "abk" && event.kind === "egg_sale" ? { note: "" } : {}),
      harvest: harvests.find(({ id }) => id === event.id),
      grading: graded.find(({ id }) => id === event.id),
      sale: sales.find(({ id }) => id === event.id),
      lines: lines.filter(({ saleId }) => saleId === event.id),
      moves: moves.filter(({ egg_stock_movements }) => egg_stock_movements.eventId === event.id).map(({ egg_stock_movements }) => egg_stock_movements),
    })),
  };
}
