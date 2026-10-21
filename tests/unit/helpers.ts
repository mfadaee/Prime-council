import { createTestDb, type Db } from "@/lib/db/client";
import { councilSessions, sessionEvents } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { CouncilRun, type ResolvedMember } from "@/lib/council/orchestrator";
import { DEFAULT_LIMITS, type CouncilRole, type Limits, type RosterEntry, type SessionMode, type StoredEvent } from "@/lib/council/types";
import { ProviderError, type GenerateRequest, type ProviderAdapter } from "@/lib/providers/types";
import { demoOutput } from "@/lib/providers/adapters/demo";

export type Behaviour =
  | { kind: "ok" }
  | { kind: "fail"; code: ConstructorParameters<typeof ProviderError>[0]; times?: number }
  | { kind: "hang" }
  | { kind: "delay"; ms: number };

export interface Call {
  memberId: string;
  phase: string;
  prompt: string;
  system: string;
  aborted: boolean;
}

/** Scripted adapter: returns well-formed JSON per phase unless told otherwise. */
export function fakeAdapter(behaviour: (memberId: string, phase: string) => Behaviour, calls: Call[], output?: (req: GenerateRequest, memberId: string) => unknown): ProviderAdapter {
  const failures = new Map<string, number>();
  return {
    kind: "openai_compatible",
    isConfigured: () => true,
    listModels: async () => ["fake"],
    async generate(p, req) {
      const memberId = p.id; // tests give every member its own provider id
      const phase = req.hint?.phase ?? "direct";
      const call: Call = { memberId, phase, prompt: req.messages[0].content, system: req.system, aborted: false };
      calls.push(call);
      req.signal.addEventListener("abort", () => (call.aborted = true), { once: true });
      const b = behaviour(memberId, phase);
      if (b.kind === "fail") {
        const key = `${memberId}:${phase}`;
        const n = (failures.get(key) ?? 0) + 1;
        failures.set(key, n);
        if (b.times === undefined || n <= b.times) throw new ProviderError(b.code, `scripted ${b.code}`);
      }
      if (b.kind === "hang" || b.kind === "delay") {
        await new Promise<void>((resolve, reject) => {
          const t = b.kind === "delay" ? setTimeout(resolve, b.ms) : undefined;
          req.signal.addEventListener("abort", () => (clearTimeout(t), reject(new ProviderError("cancelled", "aborted"))), { once: true });
        });
      }
      const text = JSON.stringify(output ? output(req, memberId) : demoOutput(req));
      return { text, model: req.model, inputTokens: 100, outputTokens: 50, finishReason: "stop" };
    },
  };
}

const ROLES: CouncilRole[] = ["chair", "analyst", "skeptic", "builder", "synthesizer"];

export function roster(roles: CouncilRole[] = ROLES): RosterEntry[] {
  return roles.map((role, i) => ({
    id: role,
    name: role[0].toUpperCase() + role.slice(1),
    role,
    persona: "",
    providerId: role,
    model: "fake",
    enabled: true,
    color: "#fff",
    monogram: role[0].toUpperCase(),
    seat: i,
    providerKind: "openai_compatible",
    providerLabel: "Fake",
    simulated: false,
    sharesModelWith: [],
  }));
}

export async function setup() {
  const { db, close } = await createTestDb();
  return { db, close };
}

export async function makeRun(
  db: Db,
  opts: {
    adapter: ProviderAdapter;
    roster?: RosterEntry[];
    limits?: Partial<Limits>;
    price?: { inputPerM: number; outputPerM: number } | null;
    dailySpent?: number;
    unavailable?: string[];
    mode?: SessionMode;
    selfExamination?: boolean;
    context?: string;
  },
) {
  const r = opts.roster ?? roster();
  const limits: Limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const id = `ses_test_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(councilSessions).values({ id, question: "Q?", status: "running", config: { limits }, roster: r });
  const price = opts.price === undefined ? { inputPerM: 0, outputPerM: 0 } : opts.price;
  const run = new CouncilRun({
    deps: {
      db,
      resolve: (m): ResolvedMember | { unavailable: string } =>
        opts.unavailable?.includes(m.id)
          ? { unavailable: "not configured" }
          : { adapter: opts.adapter, provider: { id: m.providerId, kind: "openai_compatible", label: "Fake", baseUrl: "http://x", apiKey: null, local: false }, price },
      sleep: async () => {},
    },
    sessionId: id,
    question: "How should a small town reduce traffic?",
    roster: r,
    limits,
    memory: [],
    mode: opts.mode,
    selfExamination: opts.selfExamination,
    context: opts.context,
    budget: { sessionBudgetUsd: limits.sessionBudgetUsd, dailyBudgetUsd: limits.dailyBudgetUsd, allowUnpriced: limits.allowUnpriced },
    dailySpent: opts.dailySpent ?? 0,
  });
  return { run, id };
}

export async function events(db: Db, sessionId: string): Promise<StoredEvent[]> {
  const rows = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId)).orderBy(asc(sessionEvents.seq));
  return rows.map((r) => ({ ...(r.payload as object), seq: r.seq, at: r.at.toISOString(), simulated: r.simulated }) as StoredEvent);
}

export async function waitFor(pred: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
