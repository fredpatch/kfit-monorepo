DROP INDEX "service_policies_scope_uq";--> statement-breakpoint
ALTER TABLE "service_components" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_scope_uq" UNIQUE NULLS NOT DISTINCT("service_id","variant_id");