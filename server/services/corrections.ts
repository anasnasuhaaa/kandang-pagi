import { and, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { database, type Transaction } from "../../db";
import {
  barnFeedCloses, correctionRequests, eggStockMovements, farmCash, farmEvents,
  feedMovements, populationMovements, user,
} from "../../db/schema";
import { correctionInputSchema, correctionReviewSchema } from "../../lib/domain/finance-input";
import { requireRole, type Actor } from "../auth/permissions";
import { eggProjection } from "./eggs";
import { ServiceError } from "./errors";
import { farmOperators, farmWrite, isEffective, parseInput, postFarmEvent, type Store } from "./farm";
import { feedProjection } from "./feed";
import { validateDatedHarvests, validatePopulationHistory } from "./population";
import { recordOnce, writeAudit } from "./transactions";

export const operatorSubjects = ["population", "feed_mix", "feed_issue", "feed_close", "egg_harvest", "egg_grading", "egg_adjustment"] as const;
const administratorSubjects = [...operatorSubjects, "feed_opening", "feed_purchase", "feed_adjustment", "egg_sale", "cash_manual", "cash_opening"] as const;
type Proposal = { method: "cancel" } | { method: "amount"; value: string } | { method: "count" | "closing"; value: number };

function proposal(input: ReturnType<typeof correctionInputSchema.parse>): Proposal {
  if (input.proposed === "amount" && input.amount !== undefined) return { method: "amount", value: input.amount.toString() };
  if (input.proposed === "count" && input.count !== undefined) return { method: "count", value: input.count };
  if (input.proposed === "closing" && input.closing !== undefined) return { method: "closing", value: input.closing };
  return { method: "cancel" };
}

function savedProposal(raw: typeof correctionRequests.$inferSelect.proposed): Proposal {
  if (raw.method === "amount" && typeof raw.value === "string") return { method: "amount", value: raw.value };
  if ((raw.method === "count" || raw.method === "closing") && typeof raw.value === "number") return { method: raw.method, value: raw.value };
  return { method: "cancel" };
}

async function subject(store: Store, id: string, actor: Actor, proposed: Proposal) {
  const permitted = actor.role === "abk" ? operatorSubjects : administratorSubjects;
  const [event] = await store.select().from(farmEvents)
    .where(and(eq(farmEvents.id, id), inArray(farmEvents.kind, permitted), isEffective(store)));
  if (!event || (actor.role === "abk" && event.actorId !== actor.id)) {
    throw new ServiceError("not-found", "Catatan yang dapat dikoreksi tidak ditemukan.");
  }
  const [population] = event.kind === "population"
    ? await store.select().from(populationMovements).where(eq(populationMovements.id, event.id)) : [];
  const [cash] = actor.role === "administrator" ? await store.select().from(farmCash).where(eq(farmCash.id, event.id)) : [];
  const [close] = event.kind === "feed_close"
    ? await store.select().from(barnFeedCloses).where(eq(barnFeedCloses.id, event.id)) : [];
  if (population && (population.kind === "opening" || population.kind === "arrival")) {
    throw new ServiceError("conflict", "Koreksi ini tidak berlaku untuk jumlah awal kelompok.");
  }
  if ((proposed.method === "amount" && (event.kind !== "cash_manual" || !cash))
      || (proposed.method === "count" && (!population || population.kind === "transfer"))
      || (proposed.method === "closing" && !close)) {
    throw new ServiceError("invalid", "Jenis koreksi tidak cocok dengan catatan ini.");
  }
  const inventory = event.kind.startsWith("feed_") ? await store.select({
    product: feedMovements.productId, barn: feedMovements.barnId, grams: feedMovements.deltaGrams,
  }).from(feedMovements).where(eq(feedMovements.eventId, event.id)) : event.kind.startsWith("egg_") ? await store.select({
    category: eggStockMovements.category, lot: eggStockMovements.harvestId, pieces: eggStockMovements.deltaPieces,
  }).from(eggStockMovements).where(eq(eggStockMovements.eventId, event.id)) : [];
  return {
    event, cash, population, close,
    original: {
      kind: event.kind, date: event.businessDate,
      ...(inventory.length ? { stockMovements: JSON.stringify(inventory) } : {}),
      ...(population ? { count: population.count } : {}),
      ...(close ? { closing: close.observedGrams } : {}),
      ...(cash ? { amount: cash.deltaIdr.toString() } : {}),
    },
  };
}

async function applyCorrection(tx: Transaction, actor: Actor, target: Awaited<ReturnType<typeof subject>>, change: Proposal, reason: string, requestKey: string) {
  const { event, cash, population, close } = target;
  const reversal = await postFarmEvent(tx, actor, {
    kind: "reversal", date: event.businessDate, note: reason, requestKey, reversesId: event.id,
  });
  if (cash) await tx.insert(farmCash).values({
    id: reversal.id, direction: "reversal", deltaIdr: -cash.deltaIdr, category: cash.category, reversesId: cash.id,
  });

  const feedRows = event.kind.startsWith("feed_") ? await tx.select().from(feedMovements).where(eq(feedMovements.eventId, event.id)) : [];
  if (feedRows.length) await tx.insert(feedMovements).values(feedRows.map((row) => ({
    eventId: reversal.id, productId: row.productId, barnId: row.barnId, kind: "reversal" as const, deltaGrams: -row.deltaGrams,
  })));
  if (event.kind.startsWith("egg_")) {
    const eggs = await tx.select().from(eggStockMovements).where(eq(eggStockMovements.eventId, event.id));
    if (eggs.length) await tx.insert(eggStockMovements).values(eggs.map((row) => ({
      eventId: reversal.id, harvestId: row.harvestId, category: row.category, deltaPieces: -row.deltaPieces,
    })));
  }

  let replacementId: string | undefined;
  if (change.method !== "cancel") {
    const replacement = await postFarmEvent(tx, actor, {
      kind: event.kind, date: event.businessDate, requestKey, note: reason,
      replacesId: event.id, effectiveSequence: event.effectiveSequence ?? event.sequence,
    });
    replacementId = replacement.id;
    if (change.method === "amount" && cash) {
      const amount = BigInt(change.value);
      await tx.insert(farmCash).values({ ...cash, id: replacementId, deltaIdr: cash.direction === "expense" ? -amount : amount });
    }
    if (change.method === "count" && population) {
      await tx.insert(populationMovements).values({ ...population, id: replacementId, count: change.value });
    }
    if (change.method === "closing" && close) {
      const [latest] = await tx.select({ revision: max(barnFeedCloses.revision) }).from(barnFeedCloses).where(and(
        eq(barnFeedCloses.barnId, close.barnId), eq(barnFeedCloses.productId, close.productId), eq(barnFeedCloses.businessDate, close.businessDate),
      ));
      await tx.insert(barnFeedCloses).values({ ...close, id: replacementId, observedGrams: change.value, revision: (latest.revision ?? 0) + 1 });
      if (feedRows.length) await tx.insert(feedMovements).values(feedRows.map((row) => ({
        eventId: replacement.id, productId: row.productId, barnId: row.barnId, kind: row.kind, deltaGrams: row.deltaGrams, valueIdr: row.valueIdr,
      })));
    }
  }

  if (event.kind.startsWith("feed_")) await feedProjection(tx);
  if (event.kind.startsWith("egg_")) await eggProjection(tx);
  if (population) {
    await validatePopulationHistory(tx, population.flockId);
    await validateDatedHarvests(tx, event.businessDate, population.flockId);
  }
  await writeAudit(tx, {
    actorId: actor.id, actorRole: actor.role, action: "correction_applied", entity: "farm_event", entityId: event.id,
    businessDate: event.businessDate, before: target.original, after: { ...change, reversalId: reversal.id, replacementId: replacementId ?? null },
    reason, correlationId: reversal.id,
  });
  return { reversalId: reversal.id, replacementId };
}

export async function requestCorrection(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(correctionInputSchema, raw);
  const change = proposal(input);
  return farmWrite(headers, farmOperators, db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "request_correction", requestKey: input.requestKey }, input, async () => {
      const target = await subject(tx, input.id, actor, change);
      const [request] = await tx.insert(correctionRequests).values({
        subjectId: input.id, requesterId: actor.id, original: target.original, proposed: change, reason: input.reason,
      }).onConflictDoNothing().returning();
      if (!request) throw new ServiceError("conflict", "Catatan ini sudah memiliki permintaan koreksi yang menunggu.");
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "correction_requested", entity: "correction",
        entityId: request.id, businessDate: target.event.businessDate, before: target.original, after: change,
        reason: input.reason });
      return request.id;
    }));
}

export async function reviewCorrection(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(correctionReviewSchema, raw);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "review_correction", requestKey: input.requestKey }, input, async () => {
      const [request] = await tx.select().from(correctionRequests).where(eq(correctionRequests.id, input.id));
      if (!request || request.status !== "pending") throw new ServiceError("conflict", "Permintaan tidak ditemukan atau sudah ditinjau.");
      const change = savedProposal(request.proposed);
      const links: { reversalId?: string; replacementId?: string } = input.outcome === "approved"
        ? await applyCorrection(tx, actor, await subject(tx, request.subjectId, actor, change), change, input.reason, input.requestKey) : {};
      await tx.update(correctionRequests).set({
        ...links, status: input.outcome, reviewReason: input.reason, reviewerId: actor.id, reviewedAt: new Date(),
      }).where(eq(correctionRequests.id, request.id));
      await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "correction_reviewed", entity: "correction",
        entityId: request.id, correlationId: links.reversalId, reason: input.reason, after: { status: input.outcome } });
      return request.id;
    }));
}

export async function directCorrection(headers: Headers, raw: unknown, db = database()) {
  const input = parseInput(correctionInputSchema, raw);
  const change = proposal(input);
  return farmWrite(headers, ["administrator"], db, async (tx, actor) =>
    recordOnce(tx, { actorId: actor.id, command: "direct_correction", requestKey: input.requestKey }, input, async () => {
      const [pending] = await tx.select({ id: correctionRequests.id }).from(correctionRequests)
        .where(and(eq(correctionRequests.subjectId, input.id), eq(correctionRequests.status, "pending")));
      if (pending) throw new ServiceError("conflict", "Tinjau permintaan koreksi yang masih menunggu terlebih dahulu.");
      const target = await subject(tx, input.id, actor, change);
      const links = await applyCorrection(tx, actor, target, change, input.reason, input.requestKey);
      const [record] = await tx.insert(correctionRequests).values({
        ...links, subjectId: input.id, requesterId: actor.id, reviewerId: actor.id, reason: input.reason, reviewReason: input.reason,
        proposed: change, original: target.original, status: "approved", reviewedAt: new Date(),
      }).returning({ id: correctionRequests.id });
      return record.id;
    }));
}

export async function correctionView(headers: Headers, db = database()) {
  const actor = await requireRole(headers, farmOperators, db);
  const admin = actor.role === "administrator";
  const [requests, candidates] = await Promise.all([
    db.select({ request: correctionRequests, kind: farmEvents.kind, day: farmEvents.businessDate, requester: user.name })
      .from(correctionRequests).innerJoin(farmEvents, eq(farmEvents.id, correctionRequests.subjectId))
      .innerJoin(user, eq(user.id, correctionRequests.requesterId))
      .where(admin ? undefined : eq(correctionRequests.requesterId, actor.id)).orderBy(desc(correctionRequests.createdAt)),
    db.select({
      id: farmEvents.id, day: farmEvents.businessDate, kind: farmEvents.kind,
      note: farmEvents.note, populationKind: populationMovements.kind, isClose: isNotNull(barnFeedCloses.id),
    }).from(farmEvents).leftJoin(populationMovements, eq(populationMovements.id, farmEvents.id))
      .leftJoin(barnFeedCloses, eq(barnFeedCloses.id, farmEvents.id))
      .where(and(inArray(farmEvents.kind, admin ? administratorSubjects : operatorSubjects), isEffective(db),
        admin ? undefined : eq(farmEvents.actorId, actor.id)))
      .orderBy(desc(farmEvents.businessDate), desc(farmEvents.sequence)).limit(120),
  ]);
  return { requests, candidates: candidates.filter(({ populationKind }) => populationKind !== "opening" && populationKind !== "arrival") };
}
