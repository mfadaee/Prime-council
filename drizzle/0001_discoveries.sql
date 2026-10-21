ALTER TABLE "suggestions" ADD COLUMN "mode" text;--> statement-breakpoint
CREATE TABLE "discoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"parent_id" text,
	"scope" text DEFAULT 'question' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"question" text NOT NULL,
	"framing" text DEFAULT '' NOT NULL,
	"existing_system" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision,
	"uncertainty" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minority_views" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experiment" jsonb,
	"lessons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discoveries_session_idx" ON "discoveries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "discoveries_updated_idx" ON "discoveries" USING btree ("updated_at");