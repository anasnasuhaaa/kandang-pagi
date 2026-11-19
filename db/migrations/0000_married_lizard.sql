CREATE TYPE "public"."cash_direction" AS ENUM('opening', 'income', 'expense', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."egg_category" AS ENUM('ungraded', 'coklat', 'putih', 'cacat');--> statement-breakpoint
CREATE TYPE "public"."farm_event_kind" AS ENUM('population', 'feed_opening', 'feed_purchase', 'feed_mix', 'feed_issue', 'feed_close', 'feed_adjustment', 'egg_harvest', 'egg_grading', 'egg_sale', 'egg_adjustment', 'health_event', 'vaccination_plan', 'vaccination_execution', 'quarantine', 'cash_opening', 'cash_manual', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."feed_movement_kind" AS ENUM('opening', 'purchase', 'mix_in', 'mix_out', 'issue', 'return', 'waste', 'adjustment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."feed_product_kind" AS ENUM('ingredient', 'complete', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('open', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."population_kind" AS ENUM('opening', 'arrival', 'death', 'cull', 'exit', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('pending', 'active', 'replaced', 'cleanup_pending', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."reseller_cash_direction" AS ENUM('opening', 'income', 'expense', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."reseller_event_kind" AS ENUM('stock_opening', 'intake', 'sale', 'cash_opening', 'cash_manual', 'stock_adjustment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."reseller_quantity_unit" AS ENUM('pieces', 'packaging', 'kg');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."account_token_purpose" AS ENUM('activation', 'reset');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'abk' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('administrator', 'pemilik', 'abk', 'reseller')),
	CONSTRAINT "user_status_check" CHECK ("user"."status" in ('pending', 'active', 'suspended')),
	CONSTRAINT "user_theme_check" CHECK ("user"."theme" in ('system', 'light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barn_feed_closes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"barn_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"observed_grams" bigint NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "daily_feed_close_revision" UNIQUE("barn_id","product_id","business_date","revision"),
	CONSTRAINT "daily_feed_close_values" CHECK ("barn_feed_closes"."observed_grams" >= 0 and "barn_feed_closes"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "barns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "egg_gradings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"harvest_id" uuid NOT NULL,
	"brown" integer NOT NULL,
	"white" integer NOT NULL,
	"defective" integer NOT NULL,
	CONSTRAINT "egg_grading_totals" CHECK ("egg_gradings"."brown" >= 0 and "egg_gradings"."white" >= 0 and "egg_gradings"."defective" >= 0 and ("egg_gradings"."brown"::bigint + "egg_gradings"."white" + "egg_gradings"."defective") > 0)
);
--> statement-breakpoint
CREATE TABLE "egg_harvests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"barn_id" uuid NOT NULL,
	"flock_id" uuid,
	"pieces" integer NOT NULL,
	"measured_grams" bigint,
	"mass_incomplete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "egg_harvest_values" CHECK ("egg_harvests"."pieces" > 0 and (coalesce("egg_harvests"."measured_grams", 0) > 0 or ("egg_harvests"."mass_incomplete" and "egg_harvests"."measured_grams" is null)))
);
--> statement-breakpoint
CREATE TABLE "egg_sale_lines" (
	"sale_id" uuid NOT NULL,
	"category" "egg_category" NOT NULL,
	"pieces" integer NOT NULL,
	"unit_price_idr" bigint NOT NULL,
	CONSTRAINT "egg_sale_lines_sale_id_category_pk" PRIMARY KEY("sale_id","category"),
	CONSTRAINT "egg_sale_classified_paid" CHECK ("egg_sale_lines"."category" <> 'ungraded' and "egg_sale_lines"."pieces" > 0 and "egg_sale_lines"."unit_price_idr" > 0)
);
--> statement-breakpoint
CREATE TABLE "egg_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"buyer" text DEFAULT '' NOT NULL,
	"paid_idr" bigint NOT NULL,
	CONSTRAINT "egg_sale_paid_positive" CHECK ("egg_sales"."paid_idr" > 0)
);
--> statement-breakpoint
CREATE TABLE "egg_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"harvest_id" uuid,
	"category" "egg_category" NOT NULL,
	"delta_pieces" integer NOT NULL,
	CONSTRAINT "egg_stock_movement_nonzero" CHECK ("egg_stock_movements"."delta_pieces" <> 0)
);
--> statement-breakpoint
CREATE TABLE "farm_cash" (
	"id" uuid PRIMARY KEY NOT NULL,
	"direction" "cash_direction" NOT NULL,
	"category" text NOT NULL,
	"delta_idr" bigint NOT NULL,
	"reverses_id" uuid,
	CONSTRAINT "farm_cash_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "farm_cash_direction_values" CHECK (
    ("farm_cash"."direction" = 'income' and "farm_cash"."delta_idr" > 0 and "farm_cash"."reverses_id" is null) or
    ("farm_cash"."direction" = 'expense' and "farm_cash"."delta_idr" < 0 and "farm_cash"."reverses_id" is null) or
    ("farm_cash"."direction" = 'opening' and "farm_cash"."delta_idr" >= 0 and "farm_cash"."reverses_id" is null) or
    ("farm_cash"."direction" = 'reversal' and "farm_cash"."reverses_id" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "farm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigserial NOT NULL,
	"kind" "farm_event_kind" NOT NULL,
	"business_date" date NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reverses_id" uuid,
	CONSTRAINT "farm_events_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "farm_events_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "farm_event_idempotency" UNIQUE("actor_id","kind","request_key"),
	CONSTRAINT "farm_events_reversal_link" CHECK (("farm_events"."kind" = 'reversal') = ("farm_events"."reverses_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "feed_mix_inputs" (
	"mix_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"grams" bigint NOT NULL,
	CONSTRAINT "feed_mix_inputs_mix_id_product_id_pk" PRIMARY KEY("mix_id","product_id"),
	CONSTRAINT "feed_mix_input_positive" CHECK ("feed_mix_inputs"."grams" > 0)
);
--> statement-breakpoint
CREATE TABLE "feed_mixes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"output_grams" bigint NOT NULL,
	"shrinkage_grams" bigint NOT NULL,
	CONSTRAINT "feed_mixes_amount_check" CHECK ("feed_mixes"."output_grams" > 0 and "feed_mixes"."shrinkage_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "feed_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"barn_id" uuid,
	"kind" "feed_movement_kind" NOT NULL,
	"delta_grams" bigint NOT NULL,
	"value_idr" bigint,
	CONSTRAINT "feed_delta_nonzero" CHECK ("feed_movements"."delta_grams" <> 0)
);
--> statement-breakpoint
CREATE TABLE "feed_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "feed_product_kind" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "feed_products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "feed_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier" text NOT NULL,
	"grams" bigint NOT NULL,
	"total_idr" bigint NOT NULL,
	CONSTRAINT "feed_receipts_amount_check" CHECK ("feed_receipts"."grams" > 0 and "feed_receipts"."total_idr" > 0)
);
--> statement-breakpoint
CREATE TABLE "flocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"opening_barn_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"placed_on" date NOT NULL,
	"initial_hen_housed" integer NOT NULL,
	"initial_age_days" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flocks_code_unique" UNIQUE("code"),
	CONSTRAINT "flock_positive_hen_housed" CHECK ("flocks"."initial_hen_housed" > 0),
	CONSTRAINT "flock_nonnegative_age" CHECK ("flocks"."initial_age_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "health_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flock_id" uuid,
	"barn_id" uuid NOT NULL,
	"incident" text NOT NULL,
	"observations" text NOT NULL,
	"treatment" text DEFAULT '' NOT NULL,
	"responsible_id" text NOT NULL,
	"status" "health_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "population_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flock_id" uuid NOT NULL,
	"kind" "population_kind" NOT NULL,
	"count" integer NOT NULL,
	"from_barn_id" uuid,
	"to_barn_id" uuid,
	CONSTRAINT "population_positive_movement" CHECK ("population_movements"."count" > 0),
	CONSTRAINT "population_movement_route" CHECK (
    ("population_movements"."kind" in ('opening','arrival') and "population_movements"."from_barn_id" is null and "population_movements"."to_barn_id" is not null) or
    ("population_movements"."kind" in ('death','cull','exit') and "population_movements"."from_barn_id" is not null and "population_movements"."to_barn_id" is null) or
    ("population_movements"."kind" = 'transfer' and "population_movements"."from_barn_id" is not null and "population_movements"."to_barn_id" is not null and "population_movements"."from_barn_id" <> "population_movements"."to_barn_id")
  )
);
--> statement-breakpoint
CREATE TABLE "quarantines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flock_id" uuid NOT NULL,
	"barn_id" uuid NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"reason" text NOT NULL,
	CONSTRAINT "quarantine_date_order" CHECK ("quarantines"."ended_on" is null or "quarantines"."ended_on" >= "quarantines"."started_on")
);
--> statement-breakpoint
CREATE TABLE "transaction_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"file_id" text,
	"file_path" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "receipt_status" DEFAULT 'pending' NOT NULL,
	"replaced_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_receipts_file_id_unique" UNIQUE("file_id"),
	CONSTRAINT "transaction_receipts_file_path_unique" UNIQUE("file_path"),
	CONSTRAINT "receipt_file_limits" CHECK ("transaction_receipts"."size_bytes" between 1 and 2097152 and "transaction_receipts"."mime" in ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "receipt_file_required" CHECK ("transaction_receipts"."status" not in ('active', 'replaced') or "transaction_receipts"."file_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "vaccination_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"performer_id" text NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaccination_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flock_id" uuid,
	"barn_id" uuid NOT NULL,
	"vaccine_name" text NOT NULL,
	"due_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_cash" (
	"space_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"direction" "reseller_cash_direction" NOT NULL,
	"delta_idr" bigint NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "reseller_cash_space_id_id_pk" PRIMARY KEY("space_id","id"),
	CONSTRAINT "reseller_cash_direction_values" CHECK (
    ("reseller_cash"."direction" = 'income' and "reseller_cash"."delta_idr" > 0) or
    ("reseller_cash"."direction" = 'expense' and "reseller_cash"."delta_idr" < 0) or
    ("reseller_cash"."direction" = 'opening' and "reseller_cash"."delta_idr" >= 0) or
    "reseller_cash"."direction" = 'reversal'
  )
);
--> statement-breakpoint
CREATE TABLE "reseller_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigserial NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"kind" "reseller_event_kind" NOT NULL,
	"business_date" date NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reverses_id" uuid,
	CONSTRAINT "reseller_events_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "reseller_event_scope" UNIQUE("space_id","id"),
	CONSTRAINT "reseller_event_idempotency" UNIQUE("space_id","request_key"),
	CONSTRAINT "reseller_event_reversal" UNIQUE("space_id","reverses_id"),
	CONSTRAINT "reseller_reversal_link" CHECK (("reseller_events"."kind" = 'reversal') = ("reseller_events"."reverses_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "reseller_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reseller_spaces_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "reseller_stock" (
	"space_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"category" text NOT NULL,
	"delta_pieces" bigint NOT NULL,
	"unit" "reseller_quantity_unit" NOT NULL,
	"unit_id" uuid,
	"unit_count" integer,
	"pieces_per_unit" integer,
	"actual_grams" bigint,
	CONSTRAINT "reseller_stock_space_id_id_category_pk" PRIMARY KEY("space_id","id","category"),
	CONSTRAINT "reseller_stock_piece_check" CHECK ("reseller_stock"."delta_pieces" <> 0),
	CONSTRAINT "reseller_stock_unit_check" CHECK (
    ("reseller_stock"."unit" = 'pieces' and "reseller_stock"."unit_id" is null and "reseller_stock"."unit_count" is null
        and "reseller_stock"."pieces_per_unit" is null and "reseller_stock"."actual_grams" is null) or
    ("reseller_stock"."unit" = 'packaging' and "reseller_stock"."unit_id" is not null and coalesce("reseller_stock"."unit_count", 0) > 0
        and coalesce("reseller_stock"."pieces_per_unit", 0) > 0 and "reseller_stock"."actual_grams" is null
        and abs("reseller_stock"."delta_pieces") = "reseller_stock"."unit_count"::bigint * "reseller_stock"."pieces_per_unit") or
    ("reseller_stock"."unit" = 'kg' and "reseller_stock"."unit_id" is null and "reseller_stock"."unit_count" is null
        and "reseller_stock"."pieces_per_unit" is null and coalesce("reseller_stock"."actual_grams", 0) > 0)
  )
);
--> statement-breakpoint
CREATE TABLE "reseller_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"effective_date" date NOT NULL,
	"revision" integer NOT NULL,
	"pieces_per_unit" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reseller_unit_scope" UNIQUE("space_id","id"),
	CONSTRAINT "reseller_unit_revision" UNIQUE("space_id","code","revision"),
	CONSTRAINT "reseller_unit_values" CHECK ("reseller_units"."revision" > 0 and "reseller_units"."pieces_per_unit" > 0 and "reseller_units"."code" not in ('kg', 'butir'))
);
--> statement-breakpoint
CREATE TABLE "account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" "account_token_purpose" NOT NULL,
	"digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_links_digest_unique" UNIQUE("digest"),
	CONSTRAINT "account_link_validity" CHECK ("account_links"."expires_at" > "account_links"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_bootstrap" (
	"singleton" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_singleton" CHECK ("admin_bootstrap"."singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"space_id" uuid,
	"business_date" date,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"requester_id" text NOT NULL,
	"reviewer_id" text,
	"reason" text NOT NULL,
	"review_reason" text,
	"original" jsonb NOT NULL,
	"proposed" jsonb NOT NULL,
	"status" "correction_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reversal_id" uuid,
	"replacement_id" uuid,
	CONSTRAINT "correction_requests_reversal_id_unique" UNIQUE("reversal_id"),
	CONSTRAINT "correction_requests_replacement_id_unique" UNIQUE("replacement_id"),
	CONSTRAINT "correction_resolution_fields" CHECK (
    ("correction_requests"."status" = 'pending' and "correction_requests"."reviewer_id" is null and "correction_requests"."reviewed_at" is null) or
    ("correction_requests"."status" <> 'pending' and "correction_requests"."reviewer_id" is not null and "correction_requests"."reviewed_at" is not null and "correction_requests"."review_reason" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "idempotency" (
	"actor_id" text NOT NULL,
	"command" text NOT NULL,
	"request_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_actor_id_command_request_key_pk" PRIMARY KEY("actor_id","command","request_key")
);
--> statement-breakpoint
CREATE TABLE "account_link_attempts" (
	"subject" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barn_feed_closes" ADD CONSTRAINT "barn_feed_closes_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barn_feed_closes" ADD CONSTRAINT "barn_feed_closes_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barn_feed_closes" ADD CONSTRAINT "barn_feed_closes_product_id_feed_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."feed_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_gradings" ADD CONSTRAINT "egg_gradings_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_gradings" ADD CONSTRAINT "egg_gradings_harvest_id_egg_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."egg_harvests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_harvests" ADD CONSTRAINT "egg_harvests_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_harvests" ADD CONSTRAINT "egg_harvests_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_harvests" ADD CONSTRAINT "egg_harvests_flock_id_flocks_id_fk" FOREIGN KEY ("flock_id") REFERENCES "public"."flocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_sale_lines" ADD CONSTRAINT "egg_sale_lines_sale_id_egg_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."egg_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_sales" ADD CONSTRAINT "egg_sales_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_stock_movements" ADD CONSTRAINT "egg_stock_movements_event_id_farm_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_stock_movements" ADD CONSTRAINT "egg_stock_movements_harvest_id_egg_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."egg_harvests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_cash" ADD CONSTRAINT "farm_cash_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_cash" ADD CONSTRAINT "farm_cash_reverses_id_farm_cash_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."farm_cash"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_reverses_id_farm_events_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_mix_inputs" ADD CONSTRAINT "feed_mix_inputs_mix_id_feed_mixes_id_fk" FOREIGN KEY ("mix_id") REFERENCES "public"."feed_mixes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_mix_inputs" ADD CONSTRAINT "feed_mix_inputs_product_id_feed_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."feed_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_mixes" ADD CONSTRAINT "feed_mixes_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_mixes" ADD CONSTRAINT "feed_mixes_product_id_feed_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."feed_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_movements" ADD CONSTRAINT "feed_movements_event_id_farm_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_movements" ADD CONSTRAINT "feed_movements_product_id_feed_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."feed_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_movements" ADD CONSTRAINT "feed_movements_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_receipts" ADD CONSTRAINT "feed_receipts_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_receipts" ADD CONSTRAINT "feed_receipts_product_id_feed_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."feed_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flocks" ADD CONSTRAINT "flocks_opening_barn_id_barns_id_fk" FOREIGN KEY ("opening_barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_flock_id_flocks_id_fk" FOREIGN KEY ("flock_id") REFERENCES "public"."flocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_movements" ADD CONSTRAINT "population_movements_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_movements" ADD CONSTRAINT "population_movements_flock_id_flocks_id_fk" FOREIGN KEY ("flock_id") REFERENCES "public"."flocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_movements" ADD CONSTRAINT "population_movements_from_barn_id_barns_id_fk" FOREIGN KEY ("from_barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_movements" ADD CONSTRAINT "population_movements_to_barn_id_barns_id_fk" FOREIGN KEY ("to_barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantines" ADD CONSTRAINT "quarantines_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantines" ADD CONSTRAINT "quarantines_flock_id_flocks_id_fk" FOREIGN KEY ("flock_id") REFERENCES "public"."flocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantines" ADD CONSTRAINT "quarantines_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_cash_id_farm_cash_id_fk" FOREIGN KEY ("cash_id") REFERENCES "public"."farm_cash"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_replaced_by_transaction_receipts_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."transaction_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_executions" ADD CONSTRAINT "vaccination_executions_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_executions" ADD CONSTRAINT "vaccination_executions_schedule_id_vaccination_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."vaccination_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_executions" ADD CONSTRAINT "vaccination_executions_performer_id_user_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_schedules" ADD CONSTRAINT "vaccination_schedules_id_farm_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_schedules" ADD CONSTRAINT "vaccination_schedules_flock_id_flocks_id_fk" FOREIGN KEY ("flock_id") REFERENCES "public"."flocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_schedules" ADD CONSTRAINT "vaccination_schedules_barn_id_barns_id_fk" FOREIGN KEY ("barn_id") REFERENCES "public"."barns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_cash" ADD CONSTRAINT "reseller_cash_space_id_id_reseller_events_space_id_id_fk" FOREIGN KEY ("space_id","id") REFERENCES "public"."reseller_events"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_events" ADD CONSTRAINT "reseller_events_space_id_reseller_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."reseller_spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_events" ADD CONSTRAINT "reseller_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_events" ADD CONSTRAINT "reseller_events_space_id_reverses_id_reseller_events_space_id_id_fk" FOREIGN KEY ("space_id","reverses_id") REFERENCES "public"."reseller_events"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_spaces" ADD CONSTRAINT "reseller_spaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_stock" ADD CONSTRAINT "reseller_stock_space_id_id_reseller_events_space_id_id_fk" FOREIGN KEY ("space_id","id") REFERENCES "public"."reseller_events"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_stock" ADD CONSTRAINT "reseller_stock_space_id_unit_id_reseller_units_space_id_id_fk" FOREIGN KEY ("space_id","unit_id") REFERENCES "public"."reseller_units"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_units" ADD CONSTRAINT "reseller_units_space_id_reseller_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."reseller_spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_bootstrap" ADD CONSTRAINT "admin_bootstrap_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_space_id_reseller_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."reseller_spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_subject_id_farm_events_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_reversal_id_farm_events_id_fk" FOREIGN KEY ("reversal_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_replacement_id_farm_events_id_fk" FOREIGN KEY ("replacement_id") REFERENCES "public"."farm_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency" ADD CONSTRAINT "idempotency_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "egg_grading_lot_idx" ON "egg_gradings" USING btree ("harvest_id");--> statement-breakpoint
CREATE INDEX "egg_harvest_scope_idx" ON "egg_harvests" USING btree ("barn_id","flock_id");--> statement-breakpoint
CREATE INDEX "egg_stock_scope_idx" ON "egg_stock_movements" USING btree ("category","harvest_id","event_id");--> statement-breakpoint
CREATE INDEX "egg_stock_event_idx" ON "egg_stock_movements" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "farm_events_date_idx" ON "farm_events" USING btree ("business_date","sequence");--> statement-breakpoint
CREATE INDEX "farm_events_kind_date_idx" ON "farm_events" USING btree ("kind","business_date");--> statement-breakpoint
CREATE INDEX "feed_event_idx" ON "feed_movements" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feed_stock_idx" ON "feed_movements" USING btree ("product_id","barn_id","event_id");--> statement-breakpoint
CREATE INDEX "health_flock_idx" ON "health_events" USING btree ("flock_id","barn_id");--> statement-breakpoint
CREATE INDEX "population_flock_idx" ON "population_movements" USING btree ("flock_id");--> statement-breakpoint
CREATE UNIQUE INDEX "population_single_placement" ON "population_movements" USING btree ("flock_id") WHERE "population_movements"."kind" in ('opening', 'arrival');--> statement-breakpoint
CREATE INDEX "quarantine_flock_dates_idx" ON "quarantines" USING btree ("flock_id","started_on");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_single_active_receipt" ON "transaction_receipts" USING btree ("cash_id") WHERE "transaction_receipts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "vaccination_execution_schedule_idx" ON "vaccination_executions" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "vaccination_due_idx" ON "vaccination_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "reseller_event_date_idx" ON "reseller_events" USING btree ("space_id","business_date","sequence");--> statement-breakpoint
CREATE INDEX "reseller_stock_category_idx" ON "reseller_stock" USING btree ("space_id","category");--> statement-breakpoint
CREATE INDEX "reseller_unit_date_idx" ON "reseller_units" USING btree ("space_id","code","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "account_link_one_current" ON "account_links" USING btree ("user_id","purpose") WHERE "account_links"."used_at" is null and "account_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "audit_actor_time_idx" ON "audit_events" USING btree ("actor_id","recorded_at");--> statement-breakpoint
CREATE INDEX "audit_entity_time_idx" ON "audit_events" USING btree ("entity","entity_id","recorded_at");--> statement-breakpoint
CREATE INDEX "audit_space_time_idx" ON "audit_events" USING btree ("space_id","recorded_at");--> statement-breakpoint
CREATE INDEX "correction_queue_idx" ON "correction_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_correction" ON "correction_requests" USING btree ("subject_id") WHERE "correction_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "account_link_attempts_time_idx" ON "account_link_attempts" USING btree ("window_started_at");