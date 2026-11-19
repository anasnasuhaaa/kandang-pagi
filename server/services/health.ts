import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { database } from "../../db";
import { auditEvents, barns, farmEvents, flocks, healthEvents, quarantines, user, vaccinationExecutions, vaccinationSchedules } from "../../db/schema";
import {
  endQuarantineSchema, incidentSchema, quarantineSchema, updateHealthSchema,
  vaccinationExecutionSchema, vaccinationSchema, vaccinationStatus,
} from "../../lib/domain/health-input";
import { businessDate } from "../../lib/format";
import { requireRole } from "../auth/permissions";
import { ServiceError } from "./errors";
import { assertActiveBarn, farmCommand, farmOperators, farmReaders, farmWrite, isEffective, parseInput, type Store } from "./farm";
import { populationPeriodData } from "./population";
import { writeAudit } from "./transactions";

async function healthLocation(store: Store, date: string, loc: { barnId: string; flockId?: string }) {
  await assertActiveBarn(store, loc.barnId);
  if (loc.flockId) {
    const [day] = (await populationPeriodData(store, { from: date, to: date, ...loc })).timeline;
    if (!day.activeBarnIds.length) throw new ServiceError("conflict", "Kelompok tidak berada di kandang ini pada tanggal yang dipilih.");
  }
}

async function staff(store: Store, id: string) {
  const [row] = await store.select({ id: user.id }).from(user).where(and(eq(user.id, id),
    eq(user.status, "active"), inArray(user.role, ["administrator", "abk"])));
  if (!row) throw new ServiceError("invalid", "Pilih petugas farm yang aktif.");
  return row.id;
}

export async function createIncident(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "health_event", parseInput(incidentSchema, raw),
    async (tx, actor, event, input) => {
      await healthLocation(tx, event.businessDate, input);
      const responsibleId = await staff(tx, input.responsibleId ?? actor.id);
      await tx.insert(healthEvents).values({
        id: event.id, barnId: input.barnId, flockId: input.flockId, incident: input.incident, observations: input.observations,
        treatment: input.treatment, status: input.status, responsibleId,
      });
    });
}

export async function changeHealthStatus(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(updateHealthSchema, raw);
  return farmWrite(headers, farmOperators, db, async (tx, actor) => {
    const [row] = await tx.select({ status: healthEvents.status }).from(healthEvents).where(eq(healthEvents.id, input.id));
    if (!row) throw new ServiceError("not-found", "Kejadian kesehatan tidak ditemukan.");
    if (row.status === input.status) return;
    await tx.update(healthEvents).set({ status: input.status }).where(eq(healthEvents.id, input.id));
    await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, entity: "health_event", entityId: input.id,
      action: "health_status_changed", businessDate: businessDate(), before: row, after: { status: input.status }, reason: input.reason });
  });
}

export async function scheduleVaccination(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "vaccination_plan", parseInput(vaccinationSchema, raw),
    async (tx, _, event, input) => {
      await healthLocation(tx, event.businessDate, input);
      await tx.insert(vaccinationSchedules).values({
        id: event.id, barnId: input.barnId, flockId: input.flockId, vaccineName: input.vaccine, dueDate: input.dueDate,
      });
    });
}

export async function executeVaccination(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "vaccination_execution", parseInput(vaccinationExecutionSchema, raw),
    async (tx, actor, event, input) => {
      const [schedule] = await tx.select({ day: farmEvents.businessDate }).from(vaccinationSchedules)
        .innerJoin(farmEvents, eq(farmEvents.id, vaccinationSchedules.id))
        .where(and(eq(vaccinationSchedules.id, input.scheduleId), isEffective(tx)));
      if (!schedule || schedule.day > event.businessDate) throw new ServiceError("conflict", "Pelaksanaan harus mengikuti tanggal pencatatan jadwal.");
      const [done] = await tx.select({ id: vaccinationExecutions.id }).from(vaccinationExecutions)
        .innerJoin(farmEvents, eq(farmEvents.id, vaccinationExecutions.id))
        .where(and(eq(vaccinationExecutions.scheduleId, input.scheduleId), isEffective(tx)));
      if (done) throw new ServiceError("conflict", "Jadwal sudah memiliki catatan pelaksanaan.");
      await tx.insert(vaccinationExecutions).values({
        id: event.id, scheduleId: input.scheduleId, performerId: await staff(tx, input.performerId ?? actor.id), outcome: input.outcome,
      });
    });
}

export async function startQuarantine(headers: Headers, raw: unknown, db = database()) {
  return farmCommand(headers, farmOperators, db, "quarantine", parseInput(quarantineSchema, raw),
    async (tx, _, event, input) => {
      await healthLocation(tx, event.businessDate, input);
      const [overlap] = await tx.select({ id: quarantines.id }).from(quarantines)
        .innerJoin(farmEvents, eq(farmEvents.id, quarantines.id)).where(and(
          eq(quarantines.flockId, input.flockId), isEffective(tx),
          or(isNull(quarantines.endedOn), gte(quarantines.endedOn, event.businessDate)),
        )).limit(1);
      if (overlap) {
        throw new ServiceError("conflict", "Periode karantina bertumpang tindih dengan catatan yang ada.");
      }
      await tx.insert(quarantines).values({
        id: event.id, barnId: input.barnId, flockId: input.flockId, startedOn: event.businessDate, reason: input.note,
      });
    });
}

export async function endQuarantine(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(endQuarantineSchema, raw);
  return farmWrite(headers, farmOperators, db, async (tx, actor) => {
    const [item] = await tx.select().from(quarantines).where(eq(quarantines.id, input.id));
    if (!item || item.endedOn) throw new ServiceError("conflict", "Karantina aktif tidak ditemukan.");
    if (input.businessDate < item.startedOn) throw new ServiceError("invalid", "Tanggal akhir harus pada atau setelah tanggal mulai.");
    await tx.update(quarantines).set({ endedOn: input.businessDate }).where(eq(quarantines.id, input.id));
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "quarantine_ended", entity: "quarantine", entityId: input.id,
      businessDate: input.businessDate, before: { endedOn: null }, after: { endedOn: input.businessDate }, reason: input.reason,
    });
  });
}

export async function healthView(headers: Headers, period: { from: string; to: string }, db = database()) {
  await requireRole(headers, farmReaders, db);
  const [barnRows, flockRows, people, incidents, plans, runs, isolation, laterStatuses] = await Promise.all([
    db.select({ id: barns.id, name: barns.name, active: barns.active }).from(barns).orderBy(barns.name),
    db.select({ id: flocks.id, name: flocks.name, code: flocks.code }).from(flocks).orderBy(flocks.name),
    db.select({ id: user.id, name: user.name, status: user.status }).from(user).where(inArray(user.role, ["administrator", "abk"])).orderBy(user.name),
    db.select({ data: healthEvents, day: farmEvents.businessDate, note: farmEvents.note }).from(healthEvents)
      .innerJoin(farmEvents, eq(farmEvents.id, healthEvents.id)).where(and(isEffective(db), lte(farmEvents.businessDate, period.to)))
      .orderBy(desc(farmEvents.businessDate)),
    db.select({ data: vaccinationSchedules, note: farmEvents.note }).from(vaccinationSchedules)
      .innerJoin(farmEvents, eq(farmEvents.id, vaccinationSchedules.id)).where(and(isEffective(db), lte(farmEvents.businessDate, period.to)))
      .orderBy(vaccinationSchedules.dueDate),
    db.select({ data: vaccinationExecutions, day: farmEvents.businessDate, note: farmEvents.note }).from(vaccinationExecutions)
      .innerJoin(farmEvents, eq(farmEvents.id, vaccinationExecutions.id)).where(and(isEffective(db), lte(farmEvents.businessDate, period.to)))
      .orderBy(desc(farmEvents.businessDate)),
    db.select({ data: quarantines }).from(quarantines)
      .innerJoin(farmEvents, eq(farmEvents.id, quarantines.id)).where(and(isEffective(db), lte(farmEvents.businessDate, period.to)))
      .orderBy(desc(quarantines.startedOn)),
    db.select({ id: auditEvents.entityId, before: auditEvents.before }).from(auditEvents).where(and(
      eq(auditEvents.action, "health_status_changed"), gt(auditEvents.businessDate, period.to),
    )).orderBy(asc(auditEvents.businessDate), asc(auditEvents.recordedAt)),
  ]);
  const completed = new Set(runs.map(({ data }) => data.scheduleId));
  const schedules = plans.map(({ data, note }) => ({ ...data, note, status: vaccinationStatus(data.dueDate, completed.has(data.id), period.to) }));
  const quarantine = isolation.map(({ data }) => ({ ...data, active: !data.endedOn || data.endedOn > period.to }));
  const history = incidents.map((incident) => {
    const previous = laterStatuses.find(({ id }) => id === incident.data.id)?.before?.status;
    const status = previous === "open" || previous === "monitoring" || previous === "resolved" ? previous : incident.data.status;
    return { ...incident, data: { ...incident.data, status } };
  });
  return { barns: barnRows, flocks: flockRows, people, incidents: history, schedules, runs, quarantine };
}

export async function overdueVaccines(headers: Headers, asOf: string, db = database(), barnId?: string, flockId?: string) {
  await requireRole(headers, farmReaders, db);
  const [schedules, executions] = await Promise.all([
    db.select({ id: vaccinationSchedules.id, due: vaccinationSchedules.dueDate }).from(vaccinationSchedules)
      .innerJoin(farmEvents, eq(farmEvents.id, vaccinationSchedules.id)).where(and(
        isEffective(db), lte(farmEvents.businessDate, asOf),
        barnId ? eq(vaccinationSchedules.barnId, barnId) : undefined,
        flockId ? eq(vaccinationSchedules.flockId, flockId) : undefined,
      )),
    db.select({ id: vaccinationExecutions.scheduleId }).from(vaccinationExecutions)
      .innerJoin(farmEvents, eq(farmEvents.id, vaccinationExecutions.id)).where(and(isEffective(db), lte(farmEvents.businessDate, asOf))),
  ]);
  const done = new Set(executions.map(({ id }) => id));
  const pending = schedules.filter(({ id }) => !done.has(id));
  return { overdue: pending.filter(({ due }) => due < asOf).length, due: pending.filter(({ due }) => due >= asOf).length };
}
