CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TABLE "subscription_follow_up_cadence_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"effective_frequency_days" integer,
	"source" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_cadence_history_range_valid" CHECK ("subscription_follow_up_cadence_history"."effective_to" IS NULL OR "subscription_follow_up_cadence_history"."effective_to" > "subscription_follow_up_cadence_history"."effective_from"),
	CONSTRAINT "subscription_cadence_history_value_valid" CHECK (("subscription_follow_up_cadence_history"."source" = 'none' AND "subscription_follow_up_cadence_history"."effective_frequency_days" IS NULL) OR ("subscription_follow_up_cadence_history"."source" IN ('override','variant','service') AND "subscription_follow_up_cadence_history"."effective_frequency_days" IS NOT NULL AND "subscription_follow_up_cadence_history"."effective_frequency_days" > 0))
);
--> statement-breakpoint
ALTER TABLE "subscription_follow_up_cadence_history" ADD CONSTRAINT "subscription_follow_up_cadence_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_cadence_one_open_uq" ON "subscription_follow_up_cadence_history" USING btree ("subscription_id") WHERE "subscription_follow_up_cadence_history"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_cadence_history_lookup_idx" ON "subscription_follow_up_cadence_history" USING btree ("subscription_id","effective_from");
--> statement-breakpoint
ALTER TABLE "subscription_follow_up_cadence_history" ADD CONSTRAINT "subscription_cadence_history_no_overlap" EXCLUDE USING gist ("subscription_id" WITH =, tstzrange("effective_from", "effective_to", '[)') WITH &&);
