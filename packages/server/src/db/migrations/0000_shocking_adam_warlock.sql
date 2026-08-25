CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"result" text NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_family_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"trusted_device_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent_hash" text
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"consumed_at" timestamp with time zone,
	"delivery_channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_fingerprint_hash" text NOT NULL,
	"trusted_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"variant_id" uuid,
	"component_type" text NOT NULL,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"consumption_policy" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_components_quantity_positive" CHECK ("service_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"variant_id" uuid,
	"follow_up_frequency_days" integer,
	"late_cancel_notice_hours" integer,
	"late_cancel_consumes_component" boolean DEFAULT false NOT NULL,
	"missed_consumes_component" boolean DEFAULT false NOT NULL,
	"medical_clearance_policy" text,
	"questionnaire_template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"price_xaf" integer,
	"duration_value" integer,
	"duration_unit" text,
	"capacity_limit" integer,
	"availability_status" text DEFAULT 'open' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "service_variants_price_nonnegative" CHECK ("service_variants"."price_xaf" is null or "service_variants"."price_xaf" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"pricing_mode" text NOT NULL,
	"base_price_xaf" integer,
	"delivery_type" text NOT NULL,
	"default_duration_value" integer,
	"default_duration_unit" text,
	"availability_status" text DEFAULT 'open' NOT NULL,
	"capacity_mode" text DEFAULT 'unlimited' NOT NULL,
	"capacity_limit" integer,
	"waitlist_enabled" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "services_price_nonnegative" CHECK ("services"."base_price_xaf" is null or "services"."base_price_xaf" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contact_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"request_id" uuid,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"next_action_at" timestamp with time zone,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text,
	"city" text,
	"country" text,
	"preferred_contact_channel" text DEFAULT 'whatsapp' NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qualification_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"outcome" text NOT NULL,
	"final_variant_id" uuid,
	"agreed_price_xaf" integer,
	"target_start_date" timestamp with time zone,
	"suitability_note" text,
	"conditions_json" jsonb,
	"blockers_json" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"prospect_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"requested_variant_id" uuid,
	"objective" text,
	"preferred_start_date" timestamp with time zone,
	"message" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"duplicate_of_request_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"converted_subscription_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"variant_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"priority_note" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "component_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_component_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"related_appointment_id" uuid,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_events_quantity_positive" CHECK ("component_events"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid,
	"full_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text,
	"city" text,
	"country" text,
	"preferred_contact_channel" text DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"source_service_component_id" uuid,
	"component_type" text NOT NULL,
	"label_snapshot" text NOT NULL,
	"quantity_entitled" integer NOT NULL,
	"quantity_consumed" integer DEFAULT 0 NOT NULL,
	"quantity_owed_by_coach" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_components_entitled_positive" CHECK ("subscription_components"."quantity_entitled" > 0),
	CONSTRAINT "subscription_components_consumed_nonnegative" CHECK ("subscription_components"."quantity_consumed" >= 0),
	CONSTRAINT "subscription_components_owed_nonnegative" CHECK ("subscription_components"."quantity_owed_by_coach" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" text NOT NULL,
	"original_end_date" timestamp with time zone,
	"revised_end_date" timestamp with time zone,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "subscription_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"source_request_id" uuid,
	"service_id" uuid NOT NULL,
	"variant_id" uuid,
	"status" text NOT NULL,
	"agreed_price_xaf" integer NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"planned_start_date" timestamp with time zone,
	"actual_start_date" timestamp with time zone,
	"planned_end_date" timestamp with time zone,
	"actual_end_date" timestamp with time zone,
	"capacity_reserved_until" timestamp with time zone,
	"follow_up_frequency_days_override" integer,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_price_nonnegative" CHECK ("subscriptions"."agreed_price_xaf" >= 0),
	CONSTRAINT "subscriptions_currency_xaf" CHECK ("subscriptions"."currency" = 'XAF')
);
--> statement-breakpoint
CREATE TABLE "consent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consent_type" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid,
	"consent_definition_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"captured_via" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"verification_metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "medical_clearance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text NOT NULL,
	"trigger_source" text NOT NULL,
	"note" text,
	"document_id" uuid,
	"required_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "onboarding_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_blocking" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waiver_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"label" text NOT NULL,
	"question_type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"options_json" jsonb,
	"validation_json" jsonb,
	"risk_flag_rule_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "questionnaire_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"supersedes_submission_id" uuid,
	"entered_by_user_id" uuid,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"service_id" uuid,
	"variant_id" uuid,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"component_id" uuid,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location_or_channel" text,
	"customer_response_status" text DEFAULT 'pending' NOT NULL,
	"reschedule_note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_time_order" CHECK ("appointments"."scheduled_end" > "appointments"."scheduled_start")
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"follow_up_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"attachment_document_id" uuid,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"baseline_value" numeric,
	"target_value" numeric,
	"unit" text,
	"target_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"suggested_status" text,
	"coach_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"weight_kg" numeric(6, 2),
	"waist_cm" numeric(6, 2),
	"hips_cm" numeric(6, 2),
	"chest_cm" numeric(6, 2),
	"body_fat_estimate" numeric(5, 2),
	"feeling_note" text,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"measurement_id" uuid,
	"document_id" uuid NOT NULL,
	"photo_type" text,
	"taken_at" timestamp with time zone,
	"marketing_authorization_id" uuid
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"malware_scan_status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by_type" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"sensitivity" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secure_access_token_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"result" text NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secure_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"action" text NOT NULL,
	"recipient_hint_hash" text,
	"requires_otp" boolean DEFAULT false NOT NULL,
	"device_binding_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_plan_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"amount_xaf" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_amount_positive" CHECK ("installments"."amount_xaf" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"installment_id" uuid,
	"extra_id" uuid,
	"amount_xaf" integer NOT NULL,
	"allocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount_xaf" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"amount_xaf" integer NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"payment_method" text,
	"external_reference" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"correction_of_event_id" uuid,
	"metadata_json" jsonb,
	CONSTRAINT "payment_events_amount_positive" CHECK ("payment_events"."amount_xaf" > 0),
	CONSTRAINT "payment_events_currency_xaf" CHECK ("payment_events"."currency" = 'XAF')
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"total_expected_xaf" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revised_from_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_plans_total_nonnegative" CHECK ("payment_plans"."total_expected_xaf" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"submitted_via" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"supersedes_proof_id" uuid,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"service_snapshot_json" jsonb NOT NULL,
	"amount_xaf" integer NOT NULL,
	"terms_snapshot_json" jsonb,
	"issued_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"pdf_document_id" uuid,
	CONSTRAINT "quote_versions_amount_nonnegative" CHECK ("quote_versions"."amount_xaf" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"request_id" uuid,
	"subscription_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_document_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "anonymization_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"executed_by_user_id" uuid,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "retention_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"hold_type" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"released_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "scheduled_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" text NOT NULL,
	"run_key" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"attempt" integer DEFAULT 1 NOT NULL,
	"result_json" jsonb,
	"error_code" text
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_trusted_device_id_trusted_devices_id_fk" FOREIGN KEY ("trusted_device_id") REFERENCES "public"."trusted_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_components" ADD CONSTRAINT "service_components_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_components" ADD CONSTRAINT "service_components_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_final_variant_id_service_variants_id_fk" FOREIGN KEY ("final_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_reviews" ADD CONSTRAINT "qualification_reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requested_variant_id_service_variants_id_fk" FOREIGN KEY ("requested_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_events" ADD CONSTRAINT "component_events_subscription_component_id_subscription_components_id_fk" FOREIGN KEY ("subscription_component_id") REFERENCES "public"."subscription_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_events" ADD CONSTRAINT "component_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_components" ADD CONSTRAINT "subscription_components_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_components" ADD CONSTRAINT "subscription_components_source_service_component_id_service_components_id_fk" FOREIGN KEY ("source_service_component_id") REFERENCES "public"."service_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_request_id_service_requests_id_fk" FOREIGN KEY ("source_request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_definition_id_consent_definitions_id_fk" FOREIGN KEY ("consent_definition_id") REFERENCES "public"."consent_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_clearance_records" ADD CONSTRAINT "medical_clearance_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_clearance_records" ADD CONSTRAINT "medical_clearance_records_cleared_by_user_id_users_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_items" ADD CONSTRAINT "onboarding_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_submission_id_questionnaire_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."questionnaire_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_question_id_questionnaire_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questionnaire_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_template_id_questionnaire_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."questionnaire_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_submissions" ADD CONSTRAINT "questionnaire_submissions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_submissions" ADD CONSTRAINT "questionnaire_submissions_template_id_questionnaire_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."questionnaire_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_submissions" ADD CONSTRAINT "questionnaire_submissions_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_templates" ADD CONSTRAINT "questionnaire_templates_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_templates" ADD CONSTRAINT "questionnaire_templates_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_component_id_subscription_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."subscription_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_measurement_id_progress_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."progress_measurements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_access_events" ADD CONSTRAINT "external_access_events_secure_access_token_id_secure_access_tokens_id_fk" FOREIGN KEY ("secure_access_token_id") REFERENCES "public"."secure_access_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_payment_plan_id_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymization_events" ADD CONSTRAINT "anonymization_events_executed_by_user_id_users_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_holds" ADD CONSTRAINT "retention_holds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_holds" ADD CONSTRAINT "retention_holds_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_type_idx" ON "audit_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_uq" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "otp_challenges_user_idx" ON "otp_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_challenges_expiry_idx" ON "otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_idx" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "service_components_service_idx" ON "service_components" USING btree ("service_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_policies_scope_uq" ON "service_policies" USING btree ("service_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_variants_service_slug_uq" ON "service_variants" USING btree ("service_id","slug");--> statement-breakpoint
CREATE INDEX "service_variants_service_idx" ON "service_variants" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_uq" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "services_status_idx" ON "services" USING btree ("availability_status","archived_at");--> statement-breakpoint
CREATE INDEX "contact_attempts_request_idx" ON "contact_attempts" USING btree ("request_id","occurred_at");--> statement-breakpoint
CREATE INDEX "prospects_whatsapp_idx" ON "prospects" USING btree ("whatsapp");--> statement-breakpoint
CREATE INDEX "prospects_email_idx" ON "prospects" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_reviews_version_uq" ON "qualification_reviews" USING btree ("request_id","version");--> statement-breakpoint
CREATE INDEX "qualification_reviews_request_idx" ON "qualification_reviews" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_reference_uq" ON "service_requests" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_converted_subscription_uq" ON "service_requests" USING btree ("converted_subscription_id");--> statement-breakpoint
CREATE INDEX "service_requests_queue_idx" ON "service_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "service_requests_prospect_idx" ON "service_requests" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "waitlist_active_idx" ON "waitlist_entries" USING btree ("status","entered_at");--> statement-breakpoint
CREATE INDEX "waitlist_service_idx" ON "waitlist_entries" USING btree ("service_id","variant_id");--> statement-breakpoint
CREATE INDEX "component_events_component_idx" ON "component_events" USING btree ("subscription_component_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_whatsapp_idx" ON "customers" USING btree ("whatsapp");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "subscription_components_subscription_idx" ON "subscription_components" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_pauses_idx" ON "subscription_pauses" USING btree ("subscription_id","started_at");--> statement-breakpoint
CREATE INDEX "subscription_status_history_idx" ON "subscription_status_history" USING btree ("subscription_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_reference_uq" ON "subscriptions" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_source_request_uq" ON "subscriptions" USING btree ("source_request_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_end_idx" ON "subscriptions" USING btree ("status","planned_end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_definitions_version_uq" ON "consent_definitions" USING btree ("consent_type","version");--> statement-breakpoint
CREATE INDEX "consent_records_customer_idx" ON "consent_records" USING btree ("customer_id","captured_at");--> statement-breakpoint
CREATE INDEX "consent_records_subscription_idx" ON "consent_records" USING btree ("subscription_id","captured_at");--> statement-breakpoint
CREATE INDEX "medical_clearance_subscription_idx" ON "medical_clearance_records" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "onboarding_items_subscription_idx" ON "onboarding_items" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_answers_submission_question_uq" ON "questionnaire_answers" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_questions_key_uq" ON "questionnaire_questions" USING btree ("template_id","question_key");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_submission_revision_uq" ON "questionnaire_submissions" USING btree ("subscription_id","template_id","revision_number");--> statement-breakpoint
CREATE INDEX "questionnaire_submission_subscription_idx" ON "questionnaire_submissions" USING btree ("subscription_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_templates_key_version_uq" ON "questionnaire_templates" USING btree ("template_key","version");--> statement-breakpoint
CREATE INDEX "appointment_events_idx" ON "appointment_events" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointments_subscription_idx" ON "appointments" USING btree ("subscription_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "appointments_queue_idx" ON "appointments" USING btree ("status","scheduled_start");--> statement-breakpoint
CREATE INDEX "follow_ups_due_idx" ON "follow_ups" USING btree ("status","next_action_at");--> statement-breakpoint
CREATE INDEX "follow_ups_subscription_idx" ON "follow_ups" USING btree ("subscription_id","occurred_at");--> statement-breakpoint
CREATE INDEX "goals_subscription_idx" ON "goals" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "progress_measurements_idx" ON "progress_measurements" USING btree ("subscription_id","measured_at");--> statement-breakpoint
CREATE INDEX "progress_photos_subscription_idx" ON "progress_photos" USING btree ("subscription_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_uq" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_storage_key_uq" ON "document_versions" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "document_versions_sha_idx" ON "document_versions" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status","purge_after");--> statement-breakpoint
CREATE INDEX "external_access_events_idx" ON "external_access_events" USING btree ("secure_access_token_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "secure_access_tokens_hash_uq" ON "secure_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "secure_access_tokens_resource_idx" ON "secure_access_tokens" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "secure_access_tokens_expiry_idx" ON "secure_access_tokens" USING btree ("expires_at","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_sequence_uq" ON "installments" USING btree ("payment_plan_id","sequence_number");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "payment_allocations_event_idx" ON "payment_allocations" USING btree ("payment_event_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_subscription_idx" ON "payment_allocations" USING btree ("subscription_id","installment_id");--> statement-breakpoint
CREATE INDEX "payment_events_customer_idx" ON "payment_events" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payment_events_confirmed_idx" ON "payment_events" USING btree ("confirmed_at");--> statement-breakpoint
CREATE INDEX "payment_plans_subscription_idx" ON "payment_plans" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "payment_proofs_queue_idx" ON "payment_proofs" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "payment_proofs_subscription_idx" ON "payment_proofs" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_number_uq" ON "quote_versions" USING btree ("quote_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("quote_number");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_uq" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "receipts_payment_idx" ON "receipts" USING btree ("payment_event_id");--> statement-breakpoint
CREATE INDEX "anonymization_events_subject_idx" ON "anonymization_events" USING btree ("subject_type","subject_id","requested_at");--> statement-breakpoint
CREATE INDEX "retention_holds_scope_idx" ON "retention_holds" USING btree ("scope_type","scope_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_job_runs_run_uq" ON "scheduled_job_runs" USING btree ("job_key","run_key");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_status_idx" ON "scheduled_job_runs" USING btree ("job_key","status","started_at");