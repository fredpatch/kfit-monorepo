CREATE TABLE "notification_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"message_kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_status_known" CHECK ("notification_email_outbox"."status" in ('pending', 'sending', 'sent', 'failed', 'dead_letter')),
	CONSTRAINT "notification_outbox_kind_known" CHECK ("notification_email_outbox"."message_kind" in ('reminder', 'digest')),
	CONSTRAINT "notification_outbox_attempts_nonnegative" CHECK ("notification_email_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"subscription_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"customer_display_name" text,
	"deep_link" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"first_detected_at" timestamp with time zone NOT NULL,
	"last_detected_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_known" CHECK (kind in ('follow_up_overdue','request_to_contact','installment_overdue','payment_proof_pending','quote_action_required','preparation_blocked','completion_due')),
	CONSTRAINT "notifications_severity_known" CHECK ("notifications"."severity" in ('warning', 'info'))
);
--> statement-breakpoint
CREATE TABLE "operational_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "notification_email_outbox" ADD CONSTRAINT "notification_email_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_email_outbox" ADD CONSTRAINT "notification_email_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_settings" ADD CONSTRAINT "operational_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_uq" ON "notification_email_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_open_dedupe_uq" ON "notifications" USING btree ("recipient_user_id","dedupe_key") WHERE "notifications"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_recipient_open_idx" ON "notifications" USING btree ("recipient_user_id","resolved_at","read_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_resolved_idx" ON "notifications" USING btree ("recipient_user_id","resolved_at");