CREATE TABLE "goal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"suggested_status_snapshot" text,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "metric_key" text;--> statement-breakpoint
ALTER TABLE "progress_measurements" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_events_history_idx" ON "goal_events" USING btree ("goal_id","created_at");