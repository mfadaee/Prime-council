CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"member_id" text NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"phase" text NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"reply_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_id" text,
	"model" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "council_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"status" text NOT NULL,
	"origin" text DEFAULT 'prime' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"roster" jsonb NOT NULL,
	"final" jsonb,
	"initial_answer" jsonb,
	"override" jsonb,
	"stop_reason" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"unpriced_calls" integer DEFAULT 0 NOT NULL,
	"world_decision_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"color" text NOT NULL,
	"monogram" text NOT NULL,
	"seat" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"base_url" text,
	"api_key_env" text,
	"local" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_status" text,
	"last_check_detail" text,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"reason" text NOT NULL,
	"basis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"session_id" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"session_id" text,
	"member_id" text,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"usage_source" text NOT NULL,
	"cost_usd" double precision,
	"priced" boolean DEFAULT false NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"tick" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"tick" integer NOT NULL,
	"label" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_ticks" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"tick" integer NOT NULL,
	"state" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"seed" integer NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"speed_ms" integer DEFAULT 1500 NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"config" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contributions_session_idx" ON "contributions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "council_sessions_started_idx" ON "council_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_seq_idx" ON "session_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "usage_records_at_idx" ON "usage_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "world_events_tick_idx" ON "world_events" USING btree ("world_id","tick");--> statement-breakpoint
CREATE UNIQUE INDEX "world_ticks_idx" ON "world_ticks" USING btree ("world_id","tick");