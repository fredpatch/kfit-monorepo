CREATE TABLE "business_document_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "business_document_counters_value_nonnegative" CHECK ("business_document_counters"."last_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "quote_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "accepted_quote_version_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "changes_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "business_document_counters_partition_uq" ON "business_document_counters" USING btree ("document_type","year");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_accepted_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("accepted_quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_pdf_document_id_documents_id_fk" FOREIGN KEY ("pdf_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_current_version_id_quote_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;