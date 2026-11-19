import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, check, date, index, integer, pgEnum, pgTable,
  primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const id = () => uuid().primaryKey().defaultRandom();
const qty = (name: string) => bigint(name, { mode: "number" });
const rupiah = (name: string) => bigint(name, { mode: "bigint" });
const timestampUtc = (name: string) => timestamp(name, { withTimezone: true });
const dateOnly = (name: string) => date(name, { mode: "string" });

export const farmEventKinds = [
  "population", "feed_opening", "feed_purchase", "feed_mix", "feed_issue", "feed_close", "feed_adjustment",
  "egg_harvest", "egg_grading", "egg_sale", "egg_adjustment",
  "health_event", "vaccination_plan", "vaccination_execution", "quarantine",
  "cash_opening", "cash_manual", "reversal",
] as const;

export const farmEventKind = pgEnum("farm_event_kind", farmEventKinds);
export const farmEvents = pgTable("farm_events", {
  id: id(),
  sequence: bigserial({ mode: "bigint" }).notNull().unique(),
  kind: farmEventKind().notNull(),
  businessDate: dateOnly("business_date").notNull(),
  occurredAt: timestampUtc("occurred_at").notNull(),
  recordedAt: timestampUtc("recorded_at").defaultNow().notNull(),
  actorId: text("actor_id").notNull().references(() => user.id),
  requestKey: uuid("request_key").notNull(),
  note: text().notNull().default(""),
  reversesId: uuid("reverses_id").references((): AnyPgColumn => farmEvents.id).unique(),
}, (table) => [
  unique("farm_event_idempotency").on(table.actorId, table.kind, table.requestKey),
  index("farm_events_date_idx").on(table.businessDate, table.sequence),
  index("farm_events_kind_date_idx").on(table.kind, table.businessDate),
  check("farm_events_reversal_link", sql`(${table.kind} = 'reversal') = (${table.reversesId} is not null)`),
]);

export const barns = pgTable("barns", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  location: text().notNull().default(""),
  active: boolean().notNull().default(true),
  recordedAt: timestampUtc("recorded_at").defaultNow().notNull(),
});

export const flocks = pgTable("flocks", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  openingBarnId: uuid("opening_barn_id").notNull().references(() => barns.id),
  origin: text().notNull(),
  placedOn: dateOnly("placed_on").notNull(),
  initialHenHoused: integer("initial_hen_housed").notNull(),
  initialAgeDays: integer("initial_age_days").notNull(),
  recordedAt: timestampUtc("recorded_at").defaultNow().notNull(),
}, (table) => [
  check("flock_positive_hen_housed", sql`${table.initialHenHoused} > 0`),
  check("flock_nonnegative_age", sql`${table.initialAgeDays} >= 0`),
]);

export const populationKind = pgEnum("population_kind", ["opening", "arrival", "death", "cull", "exit", "transfer"]);
export const populationMovements = pgTable("population_movements", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  flockId: uuid("flock_id").notNull().references(() => flocks.id),
  kind: populationKind().notNull(),
  count: integer().notNull(),
  fromBarnId: uuid("from_barn_id").references(() => barns.id),
  toBarnId: uuid("to_barn_id").references(() => barns.id),
}, (table) => [
  index("population_flock_idx").on(table.flockId),
  uniqueIndex("population_single_placement").on(table.flockId).where(sql`${table.kind} in ('opening', 'arrival')`),
  check("population_positive_movement", sql`${table.count} > 0`),
  check("population_movement_route", sql`
    (${table.kind} in ('opening','arrival') and ${table.fromBarnId} is null and ${table.toBarnId} is not null) or
    (${table.kind} in ('death','cull','exit') and ${table.fromBarnId} is not null and ${table.toBarnId} is null) or
    (${table.kind} = 'transfer' and ${table.fromBarnId} is not null and ${table.toBarnId} is not null and ${table.fromBarnId} <> ${table.toBarnId})
  `),
]);

export const feedProductKind = pgEnum("feed_product_kind", ["ingredient", "complete", "mixed"]);
export const feedProducts = pgTable("feed_products", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  kind: feedProductKind().notNull(),
  active: boolean().notNull().default(true),
});

export const feedReceipts = pgTable("feed_receipts", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  productId: uuid("product_id").notNull().references(() => feedProducts.id),
  supplier: text().notNull(),
  grams: qty("grams").notNull(),
  totalIdr: rupiah("total_idr").notNull(),
}, (table) => [check("feed_receipts_amount_check", sql`${table.grams} > 0 and ${table.totalIdr} > 0`)]);

export const feedMixes = pgTable("feed_mixes", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  productId: uuid("product_id").notNull().references(() => feedProducts.id),
  outputGrams: qty("output_grams").notNull(),
  shrinkageGrams: qty("shrinkage_grams").notNull(),
}, (table) => [check("feed_mixes_amount_check", sql`${table.outputGrams} > 0 and ${table.shrinkageGrams} >= 0`)]);

export const feedMixInputs = pgTable("feed_mix_inputs", {
  mixId: uuid("mix_id").notNull().references(() => feedMixes.id),
  productId: uuid("product_id").notNull().references(() => feedProducts.id),
  grams: qty("grams").notNull(),
}, (table) => [
  primaryKey({ columns: [table.mixId, table.productId] }),
  check("feed_mix_input_positive", sql`${table.grams} > 0`),
]);

export const feedMovementKind = pgEnum("feed_movement_kind", [
  "opening", "purchase", "mix_in", "mix_out", "issue", "return", "waste", "adjustment", "reversal",
]);
export const feedMovements = pgTable("feed_movements", {
  id: id(),
  eventId: uuid("event_id").notNull().references(() => farmEvents.id),
  productId: uuid("product_id").notNull().references(() => feedProducts.id),
  barnId: uuid("barn_id").references(() => barns.id),
  kind: feedMovementKind().notNull(),
  deltaGrams: qty("delta_grams").notNull(),
  valueIdr: rupiah("value_idr"),
}, (table) => [
  index("feed_event_idx").on(table.eventId),
  index("feed_stock_idx").on(table.productId, table.barnId, table.eventId),
  check("feed_delta_nonzero", sql`${table.deltaGrams} <> 0`),
]);

export const barnFeedCloses = pgTable("barn_feed_closes", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  barnId: uuid("barn_id").notNull().references(() => barns.id),
  productId: uuid("product_id").notNull().references(() => feedProducts.id),
  businessDate: dateOnly("business_date").notNull(),
  observedGrams: qty("observed_grams").notNull(),
  revision: integer().notNull().default(1),
}, (table) => [
  unique("daily_feed_close_revision").on(table.barnId, table.productId, table.businessDate, table.revision),
  check("daily_feed_close_values", sql`${table.observedGrams} >= 0 and ${table.revision} > 0`),
]);

export const eggCategory = pgEnum("egg_category", ["ungraded", "coklat", "putih", "cacat"]);
export const eggHarvests = pgTable("egg_harvests", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  barnId: uuid("barn_id").notNull().references(() => barns.id),
  flockId: uuid("flock_id").references(() => flocks.id),
  pieces: integer().notNull(),
  measuredGrams: qty("measured_grams"),
  massIncomplete: boolean("mass_incomplete").notNull().default(false),
}, (table) => [
  index("egg_harvest_scope_idx").on(table.barnId, table.flockId),
  check("egg_harvest_values", sql`((${table.pieces} = 0 and ${table.measuredGrams} is not null and ${table.measuredGrams} = 0 and not ${table.massIncomplete}) or (${table.pieces} > 0 and (coalesce(${table.measuredGrams}, 0) > 0 or (${table.massIncomplete} and ${table.measuredGrams} is null))))`),
]);

export const eggGradings = pgTable("egg_gradings", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  harvestId: uuid("harvest_id").notNull().references(() => eggHarvests.id),
  brown: integer().notNull(),
  white: integer().notNull(),
  defective: integer().notNull(),
}, (table) => [
  index("egg_grading_lot_idx").on(table.harvestId),
  check("egg_grading_totals", sql`${table.brown} >= 0 and ${table.white} >= 0 and ${table.defective} >= 0 and (${table.brown}::bigint + ${table.white} + ${table.defective}) > 0`),
]);

export const eggStockMovements = pgTable("egg_stock_movements", {
  id: id(),
  eventId: uuid("event_id").notNull().references(() => farmEvents.id),
  harvestId: uuid("harvest_id").references(() => eggHarvests.id),
  category: eggCategory().notNull(),
  deltaPieces: integer("delta_pieces").notNull(),
}, (table) => [
  index("egg_stock_scope_idx").on(table.category, table.harvestId, table.eventId),
  index("egg_stock_event_idx").on(table.eventId),
  check("egg_stock_movement_nonzero", sql`${table.deltaPieces} <> 0`),
]);

export const eggSales = pgTable("egg_sales", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  buyer: text().notNull().default(""),
  paidIdr: rupiah("paid_idr").notNull(),
}, (table) => [check("egg_sale_paid_positive", sql`${table.paidIdr} > 0`)]);

export const eggSaleLines = pgTable("egg_sale_lines", {
  saleId: uuid("sale_id").notNull().references(() => eggSales.id),
  category: eggCategory().notNull(),
  pieces: integer().notNull(),
  unitPriceIdr: rupiah("unit_price_idr").notNull(),
}, (table) => [
  primaryKey({ columns: [table.saleId, table.category] }),
  check("egg_sale_classified_paid", sql`${table.category} <> 'ungraded' and ${table.pieces} > 0 and ${table.unitPriceIdr} > 0`),
]);

export const cashDirection = pgEnum("cash_direction", ["opening", "income", "expense", "reversal"]);
export const farmCash = pgTable("farm_cash", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  direction: cashDirection().notNull(),
  category: text().notNull(),
  deltaIdr: rupiah("delta_idr").notNull(),
  reversesId: uuid("reverses_id").unique().references((): AnyPgColumn => farmCash.id),
}, (table) => [
  check("farm_cash_direction_values", sql`
    (${table.direction} = 'income' and ${table.deltaIdr} > 0 and ${table.reversesId} is null) or
    (${table.direction} = 'expense' and ${table.deltaIdr} < 0 and ${table.reversesId} is null) or
    (${table.direction} = 'opening' and ${table.deltaIdr} >= 0 and ${table.reversesId} is null) or
    (${table.direction} = 'reversal' and ${table.reversesId} is not null)
  `),
]);

export const receiptStatus = pgEnum("receipt_status", ["pending", "active", "replaced", "cleanup_pending", "deleted"]);
export const transactionReceipts = pgTable("transaction_receipts", {
  id: id(),
  cashId: uuid("cash_id").notNull().references(() => farmCash.id),
  uploadedBy: text("uploaded_by").notNull().references(() => user.id),
  fileId: text("file_id").unique(),
  filePath: text("file_path").notNull().unique(),
  mime: text().notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: receiptStatus().notNull().default("pending"),
  replacedBy: uuid("replaced_by").references((): AnyPgColumn => transactionReceipts.id),
  recordedAt: timestampUtc("recorded_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("cash_single_active_receipt").on(table.cashId).where(sql`${table.status} = 'active'`),
  check("receipt_file_limits", sql`${table.sizeBytes} between 1 and 2097152 and ${table.mime} in ('image/jpeg','image/png','image/webp')`),
  check("receipt_file_required", sql`${table.status} not in ('active', 'replaced') or ${table.fileId} is not null`),
]);

export const healthStatus = pgEnum("health_status", ["open", "monitoring", "resolved"]);
export const healthEvents = pgTable("health_events", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  flockId: uuid("flock_id").references(() => flocks.id),
  barnId: uuid("barn_id").notNull().references(() => barns.id),
  incident: text().notNull(),
  observations: text().notNull(),
  treatment: text().notNull().default(""),
  responsibleId: text("responsible_id").notNull().references(() => user.id),
  status: healthStatus().notNull().default("open"),
}, (table) => [index("health_flock_idx").on(table.flockId, table.barnId)]);

export const vaccinationSchedules = pgTable("vaccination_schedules", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  flockId: uuid("flock_id").references(() => flocks.id),
  barnId: uuid("barn_id").notNull().references(() => barns.id),
  vaccineName: text("vaccine_name").notNull(),
  dueDate: dateOnly("due_date").notNull(),
}, (table) => [index("vaccination_due_idx").on(table.dueDate)]);

export const vaccinationExecutions = pgTable("vaccination_executions", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  scheduleId: uuid("schedule_id").notNull().references(() => vaccinationSchedules.id),
  performerId: text("performer_id").notNull().references(() => user.id),
  outcome: text().notNull(),
}, (table) => [index("vaccination_execution_schedule_idx").on(table.scheduleId)]);

export const quarantines = pgTable("quarantines", {
  id: uuid().primaryKey().references(() => farmEvents.id),
  flockId: uuid("flock_id").notNull().references(() => flocks.id),
  barnId: uuid("barn_id").notNull().references(() => barns.id),
  startedOn: dateOnly("started_on").notNull(),
  endedOn: dateOnly("ended_on"),
  reason: text().notNull(),
}, (table) => [
  index("quarantine_flock_dates_idx").on(table.flockId, table.startedOn),
  check("quarantine_date_order", sql`${table.endedOn} is null or ${table.endedOn} >= ${table.startedOn}`),
]);
