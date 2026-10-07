/**
 * Database schema for Simulated Life.
 *
 * One schema serves every milestone (council, memory, world, audit). Extend
 * additively: add nullable columns or new tables, never repurpose existing ones.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** A service that serves models (OpenAI, Anthropic, a local Ollama, ...). */
export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // ProviderKind
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  /** NAME of the environment variable holding the key. Keys never enter the DB. */
  apiKeyEnv: text("api_key_env"),
  /** Local providers (Ollama, LM Studio) cost nothing; remote ones need pricing. */
  local: boolean("local").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastCheckStatus: text("last_check_status"), // available | unavailable | not_configured
  lastCheckDetail: text("last_check_detail"),
  models: jsonb("models").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A persistent council persona bound to a provider + model. */
export const members = pgTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // CouncilRole
  persona: text("persona").notNull().default(""),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  color: text("color").notNull(),
  monogram: text("monogram").notNull(),
  seat: integer("seat").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const councilSessions = pgTable(
  "council_sessions",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    status: text("status").notNull(), // SessionStatus
    origin: text("origin").notNull().default("prime"), // prime | suggestion | background | world
    simulated: boolean("simulated").notNull().default(false),
    config: jsonb("config").notNull(),
    roster: jsonb("roster").notNull(), // members snapshot at start
    final: jsonb("final"),
    initialAnswer: jsonb("initial_answer"),
    override: jsonb("override"),
    stopReason: text("stop_reason"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    unpricedCalls: integer("unpriced_calls").notNull().default(0),
    worldDecisionId: text("world_decision_id"),
    startedAt: createdAt(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("council_sessions_started_idx").on(t.startedAt)],
);

/** Append-only event log for a council session (live stream + replay). */
export const sessionEvents = pgTable(
  "session_events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    at: createdAt(),
  },
  (t) => [uniqueIndex("session_events_seq_idx").on(t.sessionId, t.seq)],
);

/** Published member output: contributions, critiques, replies, syntheses. */
export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    memberId: text("member_id").notNull(),
    round: integer("round").notNull().default(0),
    phase: text("phase").notNull(),
    kind: text("kind").notNull(),
    content: jsonb("content").notNull(),
    replyTo: jsonb("reply_to").$type<string[]>().notNull().default([]),
    providerId: text("provider_id"),
    model: text("model"),
    simulated: boolean("simulated").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("contributions_session_idx").on(t.sessionId)],
);

/** Every model call's usage. Costs are estimates from configurable pricing. */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(), // council | background | world
    sessionId: text("session_id"),
    memberId: text("member_id"),
    providerId: text("provider_id").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    usageSource: text("usage_source").notNull(), // provider | estimated
    costUsd: doublePrecision("cost_usd"),
    priced: boolean("priced").notNull().default(false),
    outcome: text("outcome").notNull(), // ok | error | cancelled
    at: createdAt(),
  },
  (t) => [index("usage_records_at_idx").on(t.at)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/** Information the Prime approved for storage. Inspectable, editable, disableable. */
export const memoryItems = pgTable("memory_items", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // interest | fact | preference | decision | imported | note
  content: text("content").notNull(),
  source: text("source").notNull(), // prime | session | import
  sourceRef: text("source_ref"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const suggestions = pgTable("suggestions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  reason: text("reason").notNull(),
  basis: jsonb("basis").$type<{ kind: string; id: string; label: string }[]>().notNull().default([]),
  proposedBy: text("proposed_by").notNull(), // member id or "rules"
  status: text("status").notNull().default("queued"), // queued | accepted | dismissed | done
  sessionId: text("session_id"),
  simulated: boolean("simulated").notNull().default(false),
  createdAt: createdAt(),
});

/** Audit trail for tool use, world-changing actions, settings and Prime overrides. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").notNull().default({}),
    at: createdAt(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

// ---------------------------------------------------------------- world ---

export const worlds = pgTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  seed: integer("seed").notNull(),
  status: text("status").notNull().default("paused"), // running | paused
  speedMs: integer("speed_ms").notNull().default(1500),
  tick: integer("tick").notNull().default(0),
  config: jsonb("config").notNull(),
  state: jsonb("state").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const worldEvents = pgTable(
  "world_events",
  {
    id: serial("id").primaryKey(),
    worldId: text("world_id").notNull(),
    tick: integer("tick").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    at: createdAt(),
  },
  (t) => [index("world_events_tick_idx").on(t.worldId, t.tick)],
);

/** Per-tick state history for replay (pruned to a bounded window). */
export const worldTicks = pgTable(
  "world_ticks",
  {
    id: serial("id").primaryKey(),
    worldId: text("world_id").notNull(),
    tick: integer("tick").notNull(),
    state: jsonb("state").notNull(),
  },
  (t) => [uniqueIndex("world_ticks_idx").on(t.worldId, t.tick)],
);

export const worldSnapshots = pgTable("world_snapshots", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  tick: integer("tick").notNull(),
  label: text("label").notNull(),
  state: jsonb("state").notNull(),
  createdAt: createdAt(),
});
