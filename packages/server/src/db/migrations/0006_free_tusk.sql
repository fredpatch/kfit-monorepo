ALTER TABLE "appointments" ADD COLUMN "rescheduled_from_appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "late_cancel_notice_hours_snapshot" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "late_cancel_consumes_component_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "missed_consumes_component_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_by_type" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_from_appointment_id_appointments_id_fk" FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_rescheduled_from_uq" ON "appointments" USING btree ("rescheduled_from_appointment_id");