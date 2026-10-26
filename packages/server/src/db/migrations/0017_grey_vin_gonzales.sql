CREATE TABLE "security_event_counters" (
	"day" date NOT NULL,
	"code" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "security_event_counters_day_code_pk" PRIMARY KEY("day","code")
);
