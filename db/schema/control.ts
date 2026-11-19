import { sql } from "drizzle-orm";
import {
  check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { roles } from "../../lib/roles";
import { user } from "./auth";
import { farmEvents } from "./farm";
import { resellerSpaces } from "./reseller";

const now = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const time = (name: string) => timestamp(name, { withTimezone: true });
type SafeFields = Record<string, string | boolean | number | null>;

export const adminBootstrap = pgTable("admin_bootstrap", {
  singleton: integer().primaryKey().default(1),
  userId: text("user_id").notNull().references(() => user.id),
  createdAt: now("created_at"),
}, (table) => [check("bootstrap_singleton", sql`${table.singleton} = 1`)]);

export const tokenPurposes = ["activation", "reset"] as const;
export const tokenPurpose = pgEnum("account_token_purpose", tokenPurposes);
export const accountLinks = pgTable("account_links", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id),
  purpose: tokenPurpose().notNull(),
  digest: text().notNull().unique(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  expiresAt: time("expires_at").notNull(),
  usedAt: time("used_at"),
  revokedAt: time("revoked_at"),
}, (table) => [
  uniqueIndex("account_link_one_current").on(table.userId, table.purpose).where(sql`${table.usedAt} is null and ${table.revokedAt} is null`),
  check("account_link_validity", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const linkAttempts = pgTable("account_link_attempts", {
  subject: text().primaryKey(),
  attempts: integer().notNull(),
  windowStartedAt: time("window_started_at").notNull(),
}, (table) => [index("account_link_attempts_time_idx").on(table.windowStartedAt)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid().primaryKey().defaultRandom(),
  actorId: text("actor_id").notNull().references(() => user.id),
  actorRole: text("actor_role", { enum: roles }).notNull(),
  action: text().notNull(),
  entity: text().notNull(),
  entityId: text("entity_id").notNull(),
  spaceId: uuid("space_id").references(() => resellerSpaces.id),
  businessDate: date("business_date", { mode: "string" }),
  recordedAt: now("recorded_at"),
  before: jsonb().$type<SafeFields>(),
  after: jsonb().$type<SafeFields>(),
  reason: text(),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
}, (table) => [
  index("audit_actor_time_idx").on(table.actorId, table.recordedAt),
  index("audit_entity_time_idx").on(table.entity, table.entityId, table.recordedAt),
  index("audit_space_time_idx").on(table.spaceId, table.recordedAt),
]);

export const correctionStatus = pgEnum("correction_status", ["pending", "approved", "rejected"]);
export const correctionRequests = pgTable("correction_requests", {
  id: uuid().primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull().references(() => farmEvents.id),
  requesterId: text("requester_id").notNull().references(() => user.id),
  reviewerId: text("reviewer_id").references(() => user.id),
  reason: text().notNull(),
  reviewReason: text("review_reason"),
  original: jsonb().$type<SafeFields>().notNull(),
  proposed: jsonb().$type<SafeFields>().notNull(),
  status: correctionStatus().notNull().default("pending"),
  createdAt: now("created_at"),
  reviewedAt: time("reviewed_at"),
  reversalId: uuid("reversal_id").references(() => farmEvents.id).unique(),
  replacementId: uuid("replacement_id").references(() => farmEvents.id).unique(),
}, (table) => [
  index("correction_queue_idx").on(table.status, table.createdAt),
  uniqueIndex("one_pending_correction").on(table.subjectId).where(sql`${table.status} = 'pending'`),
  check("correction_resolution_fields", sql`
    (${table.status} = 'pending' and ${table.reviewerId} is null and ${table.reviewedAt} is null) or
    (${table.status} <> 'pending' and ${table.reviewerId} is not null and ${table.reviewedAt} is not null and ${table.reviewReason} is not null)
  `),
]);

export const idempotency = pgTable("idempotency", {
  actorId: text("actor_id").notNull().references(() => user.id),
  command: text().notNull(),
  requestKey: uuid("request_key").notNull(),
  fingerprint: text().notNull(),
  resultId: text("result_id"),
  recordedAt: now("recorded_at"),
}, (table) => [primaryKey({ columns: [table.actorId, table.command, table.requestKey] })]);
