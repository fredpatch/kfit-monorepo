ALTER TABLE "payment_proofs" ADD COLUMN "payment_event_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "claimed_amount_xaf" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "claimed_payment_method" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "claimed_occurred_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "claimed_external_reference" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "confirmed_amount_xaf" integer;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "confirmed_payment_method" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "confirmed_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "customer_message" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_supersedes_proof_id_payment_proofs_id_fk" FOREIGN KEY ("supersedes_proof_id") REFERENCES "public"."payment_proofs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_replacement_uq" ON "payment_proofs" USING btree ("supersedes_proof_id");--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_claim_valid" CHECK ("payment_proofs"."claimed_amount_xaf" > 0 AND "payment_proofs"."claimed_payment_method" IN ('cash','bank_transfer','mobile_money') AND "payment_proofs"."submitted_via" = 'public_link');--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_status_valid" CHECK ("payment_proofs"."status" IN ('pending_review','confirmed','partially_confirmed','correction_requested','rejected','duplicate','superseded'));--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_confirmation_valid" CHECK ((
    "payment_proofs"."status" IN ('confirmed','partially_confirmed') AND "payment_proofs"."payment_event_id" IS NOT NULL
    AND "payment_proofs"."confirmed_amount_xaf" IS NOT NULL AND "payment_proofs"."confirmed_amount_xaf" > 0
    AND "payment_proofs"."confirmed_payment_method" IS NOT NULL AND "payment_proofs"."confirmed_payment_method" IN ('cash','bank_transfer','mobile_money') AND "payment_proofs"."confirmed_occurred_at" IS NOT NULL
    AND "payment_proofs"."reviewed_at" IS NOT NULL
    AND (("payment_proofs"."status" = 'confirmed' AND "payment_proofs"."confirmed_amount_xaf" = "payment_proofs"."claimed_amount_xaf") OR ("payment_proofs"."status" = 'partially_confirmed' AND "payment_proofs"."confirmed_amount_xaf" < "payment_proofs"."claimed_amount_xaf"))
  ) OR (
    "payment_proofs"."status" NOT IN ('confirmed','partially_confirmed') AND "payment_proofs"."payment_event_id" IS NULL
    AND "payment_proofs"."confirmed_amount_xaf" IS NULL AND "payment_proofs"."confirmed_payment_method" IS NULL AND "payment_proofs"."confirmed_occurred_at" IS NULL
  ));