CREATE TABLE "service_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"card_storage_key" text NOT NULL,
	"large_storage_key" text NOT NULL,
	"card_size_bytes" integer NOT NULL,
	"large_size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt_text" text NOT NULL,
	"rights_confirmed_by" uuid NOT NULL,
	"rights_confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "service_images_alt_length" CHECK (char_length("service_images"."alt_text") between 1 and 150),
	CONSTRAINT "service_images_sizes_positive" CHECK ("service_images"."card_size_bytes" > 0 and "service_images"."large_size_bytes" > 0 and "service_images"."width" > 0 and "service_images"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_rights_confirmed_by_users_id_fk" FOREIGN KEY ("rights_confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_images_one_active_uq" ON "service_images" USING btree ("service_id") WHERE "service_images"."removed_at" is null;