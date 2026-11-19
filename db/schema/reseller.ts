import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, check, date, foreignKey, index, integer, pgEnum, pgTable,
  primaryKey, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const resellerSpaces = pgTable("reseller_spaces", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resellerUnits = pgTable("reseller_units", {
  id: uuid().primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull().references(() => resellerSpaces.id),
  code: text().notNull(),
  name: text().notNull(),
  effectiveDate: date("effective_date", { mode: "string" }).notNull(),
  revision: integer().notNull(),
  piecesPerUnit: integer("pieces_per_unit").notNull(),
  active: boolean().notNull().default(true),
}, (table) => [
  unique("reseller_unit_scope").on(table.spaceId, table.id),
  unique("reseller_unit_revision").on(table.spaceId, table.code, table.revision),
  index("reseller_unit_date_idx").on(table.spaceId, table.code, table.effectiveDate),
  check("reseller_unit_values", sql`${table.revision} > 0 and ${table.piecesPerUnit} > 0 and ${table.code} not in ('kg', 'butir')`),
]);

export const resellerEventKind = pgEnum("reseller_event_kind", ["stock_opening", "intake", "sale", "cash_opening", "cash_manual", "stock_adjustment", "reversal"]);
export const resellerEvents = pgTable("reseller_events", {
  id: uuid().primaryKey().defaultRandom(),
  sequence: bigserial({ mode: "bigint" }).notNull().unique(),
  spaceId: uuid("space_id").notNull().references(() => resellerSpaces.id),
  actorId: text("actor_id").notNull().references(() => user.id),
  kind: resellerEventKind().notNull(),
  businessDate: date("business_date", { mode: "string" }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  requestKey: uuid("request_key").notNull(),
  note: text().notNull().default(""),
  reversesId: uuid("reverses_id"),
}, (table) => [
  unique("reseller_event_scope").on(table.spaceId, table.id),
  unique("reseller_event_idempotency").on(table.spaceId, table.requestKey),
  unique("reseller_event_reversal").on(table.spaceId, table.reversesId),
  foreignKey({ columns: [table.spaceId, table.reversesId], foreignColumns: [table.spaceId, table.id] }),
  index("reseller_event_date_idx").on(table.spaceId, table.businessDate, table.sequence),
  check("reseller_reversal_link", sql`(${table.kind} = 'reversal') = (${table.reversesId} is not null)`),
]);

export const resellerQuantityUnit = pgEnum("reseller_quantity_unit", ["pieces", "packaging", "kg"]);
export const resellerStock = pgTable("reseller_stock", {
  spaceId: uuid("space_id").notNull(),
  id: uuid().notNull(),
  category: text().notNull(),
  deltaPieces: bigint("delta_pieces", { mode: "number" }).notNull(),
  unit: resellerQuantityUnit().notNull(),
  unitId: uuid("unit_id"),
  unitCount: integer("unit_count"),
  piecesPerUnit: integer("pieces_per_unit"),
  actualGrams: bigint("actual_grams", { mode: "number" }),
}, (table) => [
  primaryKey({ columns: [table.spaceId, table.id, table.category] }),
  foreignKey({ columns: [table.spaceId, table.id], foreignColumns: [resellerEvents.spaceId, resellerEvents.id] }),
  foreignKey({ columns: [table.spaceId, table.unitId], foreignColumns: [resellerUnits.spaceId, resellerUnits.id] }),
  index("reseller_stock_category_idx").on(table.spaceId, table.category),
  check("reseller_stock_piece_check", sql`${table.deltaPieces} <> 0`),
  check("reseller_stock_unit_check", sql`
    (${table.unit} = 'pieces' and ${table.unitId} is null and ${table.unitCount} is null
        and ${table.piecesPerUnit} is null and ${table.actualGrams} is null) or
    (${table.unit} = 'packaging' and ${table.unitId} is not null and coalesce(${table.unitCount}, 0) > 0
        and coalesce(${table.piecesPerUnit}, 0) > 0 and ${table.actualGrams} is null
        and abs(${table.deltaPieces}) = ${table.unitCount}::bigint * ${table.piecesPerUnit}) or
    (${table.unit} = 'kg' and ${table.unitId} is null and ${table.unitCount} is null
        and ${table.piecesPerUnit} is null and coalesce(${table.actualGrams}, 0) > 0)
  `),
]);

export const resellerCashDirection = pgEnum("reseller_cash_direction", ["opening", "income", "expense", "reversal"]);
export const resellerCash = pgTable("reseller_cash", {
  spaceId: uuid("space_id").notNull(),
  id: uuid().notNull(),
  direction: resellerCashDirection().notNull(),
  deltaIdr: bigint("delta_idr", { mode: "bigint" }).notNull(),
  category: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.spaceId, table.id] }),
  foreignKey({ columns: [table.spaceId, table.id], foreignColumns: [resellerEvents.spaceId, resellerEvents.id] }),
  check("reseller_cash_direction_values", sql`
    (${table.direction} = 'income' and ${table.deltaIdr} > 0) or
    (${table.direction} = 'expense' and ${table.deltaIdr} < 0) or
    (${table.direction} = 'opening' and ${table.deltaIdr} >= 0) or
    ${table.direction} = 'reversal'
  `),
]);
