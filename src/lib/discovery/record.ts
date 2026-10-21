/**
 * Writes the discovery record for a Beyond-the-System session.
 *
 * Called by the orchestrator when an exploration session ends (completed or not —
 * an interrupted investigation is kept as "incomplete" rather than lost). When a
 * session is continued, the same record is updated and the Founder's edits
 * (assumption statuses, experiment status and results, lessons, follow-up
 * decisions) are preserved.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { discoveries } from "@/lib/db/schema";
import { buildBeyondView, changePolicy, type BeyondInput } from "@/lib/council/beyond";
import { newId } from "@/lib/util";
import type {
  DiscoveryAlternative,
  DiscoveryAssumption,
  DiscoveryExperiment,
  DiscoveryRecord,
  DiscoveryStatus,
  ExistingSystem,
  FollowUp,
} from "./types";

export interface RecordInput {
  sessionId: string;
  question: string;
  completed: boolean;
  scope: "question" | "council";
  parentId: string | null;
  simulated: boolean;
  roster: { id: string; name: string }[];
  beyond: BeyondInput;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export async function recordDiscovery(db: Db, input: RecordInput): Promise<string> {
  const view = buildBeyondView(input.beyond);
  const { map, final, experiment } = input.beyond;
  const nameOf = (id: string) => input.roster.find((m) => m.id === id)?.name ?? id;
  const [prev] = await db.select().from(discoveries).where(eq(discoveries.sessionId, input.sessionId));

  const prevAssumptions = new Map(((prev?.assumptions ?? []) as DiscoveryAssumption[]).map((a) => [a.id, a]));
  const assumptions: DiscoveryAssumption[] = view.assumptions.map((a) => ({
    ...a,
    status: prevAssumptions.get(a.id)?.status ?? "open",
    revision: prevAssumptions.get(a.id)?.revision,
  }));
  const alternatives: DiscoveryAlternative[] = view.alternatives.map((a) => ({ ...a, originatorName: nameOf(a.originatorId) }));

  const prevExp = prev?.experiment as DiscoveryExperiment | null | undefined;
  const exp: DiscoveryExperiment | null = experiment
    ? prevExp && prevExp.status !== "proposed" && prevExp.status !== "not_justified"
      ? prevExp // the Founder already acted on it
      : { plan: experiment.plan, designedBy: experiment.memberId, designedByName: nameOf(experiment.memberId), status: experiment.plan.justified ? "proposed" : "not_justified", result: null }
    : (prevExp ?? null);

  const prevFollowUps = new Map(((prev?.followUps ?? []) as FollowUp[]).map((f) => [f.id, f]));
  const followUps: FollowUp[] = [
    ...(final?.nextQuestions ?? []).map((text): FollowUp => ({ id: `q_${hash(text)}`, kind: "investigate", text, status: "proposed" })),
    ...(final?.proposedChanges ?? []).map(
      (c): FollowUp => ({ id: `c_${hash(c.target + c.change)}`, kind: "process_change", text: c.change, why: c.why, target: c.target, status: "proposed", policy: changePolicy(c.target) }),
    ),
  ].map((f) => ({ ...f, status: prevFollowUps.get(f.id)?.status ?? f.status }));
  // Follow-ups the Founder already decided on survive a re-synthesis that no longer lists them.
  for (const f of prevFollowUps.values()) if (f.status !== "proposed" && !followUps.some((x) => x.id === f.id)) followUps.push(f);

  const prevLessons = (prev?.lessons ?? []) as string[];
  const lessons = [...prevLessons, ...(final?.learned ?? []).filter((l) => !prevLessons.includes(l))].slice(0, 30);

  const keptStatus: DiscoveryStatus[] = ["experimenting", "concluded", "archived"];
  const status: DiscoveryStatus = prev && keptStatus.includes(prev.status as DiscoveryStatus) ? (prev.status as DiscoveryStatus) : input.completed ? "open" : "incomplete";

  const existingSystem: ExistingSystem = {
    currentSystem: map?.currentSystem ?? "",
    produces: map?.produces ?? "",
    whyExists: map?.whyExists ?? "",
    boundaries: map?.boundaries ?? [],
    distortions: map?.distortions ?? [],
  };
  const constraints = [...new Set([...(map?.constraints ?? []), ...view.assumptions.filter((a) => a.kind === "constraint").map((a) => a.statement)])];
  const searchText = [
    input.question,
    map?.restatement,
    existingSystem.currentSystem,
    ...assumptions.map((a) => a.statement),
    ...alternatives.map((a) => `${a.title} ${a.description}`),
    final?.answer,
    ...lessons,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase()
    .slice(0, 20_000);

  const values = {
    sessionId: input.sessionId,
    parentId: input.parentId,
    scope: input.scope,
    status,
    question: input.question,
    framing: map?.restatement ?? "",
    existingSystem,
    assumptions,
    constraints,
    alternatives,
    checks: view.checks,
    answer: final?.answer ?? "",
    evidence: final?.keyEvidence ?? [],
    confidence: final?.confidence ?? null,
    uncertainty: final?.uncertainty ?? [],
    minorityViews: [...new Set([...(final?.minorityViews ?? []), ...(final?.disagreements ?? [])])],
    experiment: exp,
    lessons,
    followUps,
    searchText,
    simulated: input.simulated,
    updatedAt: new Date(),
  };
  if (prev) {
    await db.update(discoveries).set(values).where(eq(discoveries.id, prev.id));
    return prev.id;
  }
  const id = newId("dis");
  await db.insert(discoveries).values({ id, ...values });
  return id;
}

export function toRecord(row: typeof discoveries.$inferSelect): DiscoveryRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentId: row.parentId,
    scope: row.scope === "council" ? "council" : "question",
    status: row.status as DiscoveryStatus,
    question: row.question,
    framing: row.framing,
    existingSystem: row.existingSystem as ExistingSystem,
    assumptions: row.assumptions as DiscoveryAssumption[],
    constraints: row.constraints,
    alternatives: row.alternatives as DiscoveryAlternative[],
    checks: row.checks as DiscoveryRecord["checks"],
    answer: row.answer,
    evidence: row.evidence as DiscoveryRecord["evidence"],
    confidence: row.confidence,
    uncertainty: row.uncertainty,
    minorityViews: row.minorityViews,
    experiment: row.experiment as DiscoveryExperiment | null,
    lessons: row.lessons,
    followUps: row.followUps as FollowUp[],
    simulated: row.simulated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
