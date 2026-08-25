ALTER TABLE "auth_sessions" ALTER COLUMN "last_seen_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "auth_sessions" SET "last_seen_at" = "issued_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "last_seen_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "user_agent_hash" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "rotation_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "auth_sessions" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "compromised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD COLUMN "last_used_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_challenges_session_idx" ON "otp_challenges" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_user_fingerprint_uq" ON "trusted_devices" USING btree ("user_id","device_fingerprint_hash");
