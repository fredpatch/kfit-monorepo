ALTER TABLE "receipts" ALTER COLUMN "pdf_document_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "snapshot_json" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_pdf_document_id_documents_id_fk" FOREIGN KEY ("pdf_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_payment_event_uq" ON "receipts" USING btree ("payment_event_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_void_reason_valid" CHECK (("receipts"."voided_at" IS NULL AND "receipts"."void_reason" IS NULL) OR ("receipts"."voided_at" IS NOT NULL AND "receipts"."void_reason" IS NOT NULL AND length(btrim("receipts"."void_reason")) > 0));