import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { database, type Transaction } from "../../db";
import { barns, eggHarvests, farmEvents, flocks, populationMovements, user } from "../../db/schema";
import { datesBetween } from "../../lib/format";
import { applyMovement, PopulationConflict, productionRates, type Movement, type Placement } from "../../lib/domain/livestock";
import { barnSchema, barnStatusSchema, cancelMovementSchema, flockSchema, movementSchema } from "../../lib/domain/population-input";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { feedBarnBalance } from "./feed";
import { farmOperators, farmReaders, farmWrite, isEffective, parseInput, postFarmEvent, type Store } from "./farm";
import { recordOnce, writeAudit } from "./transactions";

type DatedMovement = Movement & { id: string; day: string; sequence: bigint };
type Scope = { barnId?: string; flockId?: string };
type Period = Scope & { from: string; to: string };

function movementRows(store: Store, flockId?: string, end?: string) {
  return store.select({
    id: farmEvents.id, day: farmEvents.businessDate, sequence: farmEvents.sequence,
    flockId: populationMovements.flockId, kind: populationMovements.kind, count: populationMovements.count,
    fromBarnId: populationMovements.fromBarnId, toBarnId: populationMovements.toBarnId,
  }).from(populationMovements)
    .innerJoin(farmEvents, eq(farmEvents.id, populationMovements.id))
    .where(and(isEffective(store), flockId ? eq(populationMovements.flockId, flockId) : undefined, end ? lte(farmEvents.businessDate, end) : undefined))
    .orderBy(asc(farmEvents.businessDate), asc(farmEvents.sequence));
}

function applySafe(current: Placement | undefined, movement: Movement) {
  try {
    return applyMovement(current, movement);
  } catch (error) {
    if (error instanceof PopulationConflict) throw new ServiceError("conflict", error.message);
    throw error;
  }
}

function replayFlock(rows: readonly DatedMovement[]) {
  let placement: Placement | undefined;
  for (const row of rows) placement = applySafe(placement, row);
  return placement;
}

async function activeBarn(tx: Transaction, barnId: string) {
  const [barn] = await tx.select({ id: barns.id }).from(barns).where(and(eq(barns.id, barnId), eq(barns.active, true)));
  if (!barn) throw new ServiceError("invalid", "Pilih kandang yang aktif.");
  return barn.id;
}

export async function createBarn(headers: Headers, raw: unknown, db = database()) {
  const { requestKey, ...values } = parseInput(barnSchema, raw);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "create_barn", requestKey }, values, async () => {
      const [barn] = await tx.insert(barns).values(values).onConflictDoNothing().returning();
      if (!barn) throw new ServiceError("conflict", "Kode kandang sudah digunakan.");
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "barn_created", entity: "barn", entityId: barn.id, after: values });
      return barn.id;
    }));
}

export async function setBarnStatus(headers: Headers, raw: unknown, db = database()) {
  const { barnId, active, reason } = parseInput(barnStatusSchema, raw);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) => {
    const [barn] = await tx.select().from(barns).where(eq(barns.id, barnId));
    if (!barn) throw new ServiceError("not-found", "Kandang tidak ditemukan.");
    if (barn.active === active) return;
    if (!active) {
      const placements = new Map<string, Placement>();
      for (const movement of await movementRows(tx)) placements.set(movement.flockId, applySafe(placements.get(movement.flockId), movement));
      if ([...placements.values()].some((position) => position.barnId === barnId && position.alive > 0)) {
        throw new ServiceError("conflict", "Pindahkan ternak hidup dari kandang ini sebelum menonaktifkannya.");
      }
      if (await feedBarnBalance(tx, barnId)) throw new ServiceError("conflict", "Selesaikan stok pakan kandang sebelum menonaktifkannya.");
    }
    await tx.update(barns).set({ active }).where(eq(barns.id, barnId));
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "barn_status", entity: "barn", entityId: barnId,
      before: { active: barn.active }, after: { active }, reason,
    });
  });
}

export async function createFlock(headers: Headers, raw: unknown, db = database()) {
  const { requestKey, ...values } = parseInput(flockSchema, raw);
  return farmWrite(headers, farmOperators, db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "place_flock", requestKey }, values, async () => {
      const barnId = await activeBarn(tx, values.barnId);
      const [flock] = await tx.insert(flocks).values({
        code: values.code, name: values.name, openingBarnId: barnId, origin: values.origin, placedOn: values.businessDate,
        initialHenHoused: values.count, initialAgeDays: values.age,
      }).onConflictDoNothing().returning();
      if (!flock) throw new ServiceError("conflict", "Kode kelompok sudah digunakan.");
      const event = await postFarmEvent(tx, actor, { kind: "population", date: values.businessDate, requestKey, note: values.reason });
      await tx.insert(populationMovements).values({ id: event.id, flockId: flock.id, kind: values.kind, count: values.count, toBarnId: barnId });
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, entity: "population", entityId: event.id,
        action: "flock_placed", businessDate: values.businessDate, after: { flockId: flock.id, barnId, count: values.count }, reason: values.reason });
      return flock.id;
    }));
}

export async function addMovement(headers: Headers, raw: unknown, db = database()) {
  const { requestKey, ...values } = parseInput(movementSchema, raw);
  return farmWrite(headers, farmOperators, db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "move_population", requestKey }, values, async () => {
      const rows = await movementRows(tx, values.flockId);
      const previous = rows.filter(({ day }) => day <= values.businessDate);
      const current = replayFlock(previous);
      if (!current?.alive) throw new ServiceError("conflict", "Kelompok tidak memiliki ternak hidup pada tanggal tersebut.");
      const toBarnId = values.kind === "transfer" ? await activeBarn(tx, values.toBarnId) : null;
      const movement: Movement = {
        flockId: values.flockId, kind: values.kind, count: values.kind === "transfer" ? current.alive : values.count,
        fromBarnId: current.barnId, toBarnId,
      };
      const next = applySafe(current, movement);
      let final = next;
      for (const row of rows.slice(previous.length)) final = applySafe(final, row);

      const event = await postFarmEvent(tx, actor, { kind: "population", date: values.businessDate, requestKey, note: values.reason });
      await tx.insert(populationMovements).values({ id: event.id, ...movement });
      await validateDatedHarvests(tx, values.businessDate, values.flockId);
      await writeAudit(tx, {
        actorId: actor.id, actorRole: actor.role, entity: "population", entityId: event.id, action: "movement_posted",
        businessDate: values.businessDate, before: current, after: next, reason: values.reason,
      });
      return event.id;
    }));
}

export async function validatePopulationReversal(tx: Transaction, eventId: string) {
  const [target] = await tx.select({
    day: farmEvents.businessDate, flockId: populationMovements.flockId, kind: populationMovements.kind,
  }).from(populationMovements).innerJoin(farmEvents, eq(farmEvents.id, populationMovements.id))
    .where(and(eq(farmEvents.id, eventId), isEffective(tx)));
  if (!target) throw new ServiceError("not-found", "Mutasi aktif tidak ditemukan.");
  if (target.kind === "arrival" || target.kind === "opening") {
    throw new ServiceError("conflict", "Penempatan awal kelompok tidak dapat dibatalkan dari daftar mutasi.");
  }
  const remaining = (await movementRows(tx, target.flockId)).filter(({ id }) => id !== eventId);
  const final = replayFlock(remaining);
  if (final?.alive) await activeBarn(tx, final.barnId);
  return target;
}

export async function cancelMovement(headers: Headers, raw: unknown, db = database()) {
  const { requestKey, ...values } = parseInput(cancelMovementSchema, raw);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "cancel_population", requestKey }, values, async () => {
      const target = await validatePopulationReversal(tx, values.eventId);
      const event = await postFarmEvent(tx, actor, { kind: "reversal", date: target.day, requestKey, note: values.reason, reversesId: values.eventId });
      await validateDatedHarvests(tx, target.day, target.flockId);
      await writeAudit(tx, {
        actorId: actor.id, actorRole: actor.role, action: "movement_cancelled", entity: "population", entityId: values.eventId,
        businessDate: target.day, reason: values.reason, correlationId: event.id,
      });
      return event.id;
    }));
}

export async function validateDatedHarvests(store: Store, from: string, flockId: string) {
  const rows = await store.select({
    barnId: eggHarvests.barnId, flockId: eggHarvests.flockId, date: farmEvents.businessDate,
  }).from(eggHarvests).innerJoin(farmEvents, eq(farmEvents.id, eggHarvests.id)).where(and(
    isEffective(store), gte(farmEvents.businessDate, from),
    or(eq(eggHarvests.flockId, flockId), sql`${eggHarvests.flockId} is null`),
  )).groupBy(eggHarvests.barnId, eggHarvests.flockId, farmEvents.businessDate);
  for (const row of rows) {
    const { timeline: [day] } = await populationPeriodData(store, {
      from: row.date, to: row.date, barnId: row.barnId, flockId: row.flockId ?? undefined,
    });
    if (!day.activeBarnIds.length) throw new ServiceError("conflict", "Mutasi membuat penempatan pada catatan panen yang sudah ada menjadi tidak sah.");
  }
}

function sum(values: Iterable<number>) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export async function populationPeriodData(store: Store, period: Period) {
  const [rows, masters, harvests] = await Promise.all([
    movementRows(store, period.flockId, period.to),
    store.select().from(flocks).where(period.flockId ? eq(flocks.id, period.flockId) : undefined),
    store.select({
      day: farmEvents.businessDate, barnId: eggHarvests.barnId, flockId: eggHarvests.flockId,
      pieces: eggHarvests.pieces, grams: eggHarvests.measuredGrams, incomplete: eggHarvests.massIncomplete,
    }).from(eggHarvests).innerJoin(farmEvents, eq(farmEvents.id, eggHarvests.id)).where(and(
      gte(farmEvents.businessDate, period.from), lte(farmEvents.businessDate, period.to), isEffective(store),
      period.barnId ? eq(eggHarvests.barnId, period.barnId) : undefined,
      period.flockId ? or(eq(eggHarvests.flockId, period.flockId), sql`${eggHarvests.flockId} is null`) : undefined,
    )),
  ]);
  const states = new Map<string, Placement>();
  const observedBarns = new Set<string>();
  const baselines = new Map(masters.map((flock) => [flock.id, flock.initialHenHoused]));
  const scoped = (placement: Placement) => !period.barnId || period.barnId === placement.barnId;
  let offset = 0;
  const timeline = datesBetween(period.from, period.to).map((day) => {
    const present = new Set<string>();
    const visitedBarns = new Set<string>();
    const activeBarnIds = new Set<string>();
    const observe = (id: string, placement: Placement) => {
      if (period.flockId === id) visitedBarns.add(placement.barnId);
      if (placement.alive > 0 && scoped(placement)) {
        present.add(id);
        activeBarnIds.add(placement.barnId);
      }
    };
    let deaths = 0;
    let transfers = 0;
    while (offset < rows.length && rows[offset].day < day) {
      const row = rows[offset++];
      const position = applySafe(states.get(row.flockId), row);
      states.set(row.flockId, position);
      observedBarns.add(position.barnId);
    }
    for (const [id, placement] of states) if (placement.alive > 0) observe(id, placement);
    while (offset < rows.length && rows[offset].day === day) {
      const row = rows[offset++];
      const position = applySafe(states.get(row.flockId), row);
      states.set(row.flockId, position);
      observedBarns.add(position.barnId);
      observe(row.flockId, position);
      if (row.kind === "death" && (!period.barnId || period.barnId === row.fromBarnId)) deaths += row.count;
      if (row.kind === "transfer" && (!period.barnId || period.barnId === row.fromBarnId || period.barnId === row.toBarnId)) transfers += row.count;
    }
    const placements = [...states].filter(([, placement]) => scoped(placement));
    const alive = placements.filter(([, placement]) => placement.alive > 0);
    const relevantHarvests = harvests.filter((harvest) => harvest.day === day &&
      (!period.flockId || harvest.flockId === period.flockId || (!harvest.flockId && visitedBarns.has(harvest.barnId))));
    const mixed = relevantHarvests.some(({ flockId }) => !flockId);
    const attributed = relevantHarvests.filter(({ flockId }) => !period.flockId || flockId === period.flockId);
    return {
      day, activeBarnIds: [...activeBarnIds], visitedBarns: [...visitedBarns], hens: sum(alive.map(([, position]) => position.alive)), housed: sum([...present].map((id) => baselines.get(id) ?? 0)),
      activeFlocks: alive.length, known: period.barnId ? observedBarns.has(period.barnId) : states.size > 0, deaths, transfers,
      eggs: sum(attributed.map(({ pieces }) => pieces)), recorded: attributed.length > 0, mixed,
      measuredGrams: attributed.length && attributed.every(({ grams, incomplete }) => grams !== null && !incomplete)
        ? sum(attributed.map(({ grams }) => grams ?? 0)) : null,
    };
  });
  const scope = period.flockId ? "flock" : period.barnId ? "barn" : "farm";
  return { timeline, rates: productionRates(timeline, scope), placements: states };
}

export async function populationDashboard(headers: Headers, period: Period, db = database()) {
  await requireRole(headers, farmReaders, db);
  const [{ timeline, rates }, barnRows, flockRows] = await Promise.all([
    populationPeriodData(db, period),
    db.select({ id: barns.id, label: barns.name }).from(barns).orderBy(barns.name),
    db.select({ id: flocks.id, label: flocks.name }).from(flocks).orderBy(flocks.name),
  ]);
  return { timeline, rates, barnRows, flockRows };
}

export async function populationPage(headers: Headers, input: {
  date: string; from: string; barnId?: string; flockId?: string; search: string; page: number; tab: string;
}, db = database()) {
  await requireRole(headers, farmReaders, db);
  const [barnRows, flockRows, snapshot] = await Promise.all([
    db.select().from(barns).orderBy(asc(barns.code)),
    db.select().from(flocks).orderBy(asc(flocks.code)),
    populationPeriodData(db, { from: input.date, to: input.date, barnId: input.barnId, flockId: input.flockId }),
  ]);
  const pageSize = 12;
  const source = alias(barns, "source_barn");
  const destination = alias(barns, "target_barn");
  const reversal = alias(farmEvents, "reversal_event");
  const scope = input.barnId ? or(eq(populationMovements.fromBarnId, input.barnId), eq(populationMovements.toBarnId, input.barnId)) : undefined;
  const needle = input.search.toLocaleLowerCase("id-ID").replace(/[\\%_]/g, "\\$&");
  const query = and(
    gte(farmEvents.businessDate, input.from), lte(farmEvents.businessDate, input.date), scope,
    input.flockId ? eq(populationMovements.flockId, input.flockId) : undefined,
    needle ? or(ilike(flocks.name, `%${needle}%`), ilike(flocks.code, `%${needle}%`), ilike(farmEvents.note, `%${needle}%`)) : undefined,
    input.tab === "mutasi" ? isEffective(db) : undefined,
  );
  const movements = db.select({
    id: farmEvents.id, day: farmEvents.businessDate, recordedAt: farmEvents.recordedAt, note: farmEvents.note,
    actor: user.name, flock: flocks.name, kind: populationMovements.kind, count: populationMovements.count,
    from: source.name, to: destination.name, reversal: reversal.id, reversalReason: reversal.note,
  }).from(farmEvents)
    .innerJoin(populationMovements, eq(populationMovements.id, farmEvents.id))
    .innerJoin(flocks, eq(flocks.id, populationMovements.flockId))
    .innerJoin(user, eq(user.id, farmEvents.actorId))
    .leftJoin(source, eq(source.id, populationMovements.fromBarnId))
    .leftJoin(destination, eq(destination.id, populationMovements.toBarnId))
    .leftJoin(reversal, eq(reversal.reversesId, farmEvents.id))
    .where(query);
  let history: Awaited<typeof movements> = [];
  let total: number;
  const matches = (item: { name: string; code: string }) =>
    `${item.code} ${item.name}`.toLocaleLowerCase("id-ID").includes(input.search.toLocaleLowerCase("id-ID"));
  const barnTable = barnRows.filter(matches);
  const flockTable = flockRows.filter((flock) => matches(flock)
    && (!input.flockId || input.flockId === flock.id)
    && (!input.barnId || snapshot.placements.get(flock.id)?.barnId === input.barnId));
  if (input.tab === "mutasi" || input.tab === "riwayat") {
    const [result] = await db.select({ total: count() }).from(farmEvents)
      .innerJoin(populationMovements, eq(populationMovements.id, farmEvents.id))
      .innerJoin(flocks, eq(flocks.id, populationMovements.flockId)).where(query);
    total = result.total;
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / pageSize)));
    history = await movements.orderBy(desc(farmEvents.businessDate), desc(farmEvents.sequence)).limit(pageSize).offset((page - 1) * pageSize);
  } else {
    total = input.tab === "kandang" ? barnTable.length : flockTable.length;
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(input.page, pages);
  const start = (current - 1) * pageSize;
  return {
    barns: barnTable.slice(start, start + pageSize), flocks: flockTable.slice(start, start + pageSize),
    barnOptions: barnRows, flockOptions: flockRows, history, snapshot, current, pages, total,
  };
}
