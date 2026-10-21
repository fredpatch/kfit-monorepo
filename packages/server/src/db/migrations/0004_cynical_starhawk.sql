ALTER TABLE "external_access_events" ALTER COLUMN "secure_access_token_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_definitions" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_definitions" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_definitions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_definitions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "captured_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "secure_access_token_id" uuid;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "supersedes_consent_record_id" uuid;--> statement-breakpoint
ALTER TABLE "secure_access_tokens" ADD COLUMN "context_json" jsonb;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_secure_access_token_id_secure_access_tokens_id_fk" FOREIGN KEY ("secure_access_token_id") REFERENCES "public"."secure_access_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_supersedes_consent_record_id_consent_records_id_fk" FOREIGN KEY ("supersedes_consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_supersedes_uq" ON "consent_records" USING btree ("supersedes_consent_record_id");