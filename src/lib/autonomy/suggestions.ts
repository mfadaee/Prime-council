import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { councilSessions, discoveries, members, memoryItems, suggestions } from "@/lib/db/schema";
import { selfExaminationQuestion } from "@/lib/council/beyond";
import type { FollowUp } from "@/lib/discovery/types";
import { extractJsonObject } from "@/lib/council/parse";
import { untrusted } from "@/lib/council/prompts";
import { singleCall } from "@/lib/council/single-call";
import type { FinalAnswer } from "@/lib/council/types";
import { newId } from "@/lib/util";

export const OPEN_STATUSES = ["queued", "scheduled", "running"] as const;
const MAX_OPEN = 10;

type Basis = { kind: string; id: string; label: string };

async function openCount(db: Db): Promise<number> {
  const rows = await db.select({ id: suggestions.id }).from(suggestions).where(inArray(suggestions.status, [...OPEN_STATUSES]));
  return rows.length;
}

async function usedBasisIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ basis: suggestions.basis }).from(suggestions);
  return new Set(rows.flatMap((r) => r.basis.map((b) => `${b.kind}:${b.id}`)));
}

async function memberIdForRole(db: Db, role: string): Promise<string> {
  const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.role, role), eq(members.enabled, true))).limit(1);
  return m?.id ?? "rules";
}

/**
 * Deterministic, free suggestions:
 *  - each approved interest not yet suggested → an exploration topic;
 *  - each recent (non-simulated) session that ended with stated uncertainty → a follow-up.
 * Every suggestion records why it was made and what it was based on.
 */
export async function ruleSuggestions(db: Db, max = 3) {
  const room = Math.max(0, Math.min(max, MAX_OPEN - (await openCount(db))));
  if (!room) return [];
  const used = await usedBasisIds(db);
  const created: (typeof suggestions.$inferInsert)[] = [];

  const interests = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.kind, "interest"), eq(memoryItems.enabled, true)))
    .orderBy(desc(memoryItems.updatedAt));
  const researcher = await memberIdForRole(db, "researcher");
  for (const i of interests) {
    if (created.length >= room) break;
    if (used.has(`memory:${i.id}`)) continue;
    created.push({
      id: newId("sug"),
      question: `What are the most important open questions and practical next steps regarding: ${i.content}?`,
      reason: `You saved “${i.content.slice(0, 120)}” as an interest.`,
      basis: [{ kind: "memory", id: i.id, label: i.content.slice(0, 80) }],
      proposedBy: researcher,
    });
  }

  const recent = await db
    .select()
    .from(councilSessions)
    .where(and(eq(councilSessions.status, "completed"), eq(councilSessions.simulated, false)))
    .orderBy(desc(councilSessions.startedAt))
    .limit(10);
  const skeptic = await memberIdForRole(db, "skeptic");
  for (const s of recent) {
    if (created.length >= room) break;
    if (used.has(`session:${s.id}`)) continue;
    const f = s.final as FinalAnswer | null;
    const open = f?.uncertainty?.[0] ?? f?.disagreements?.[0];
    if (!open) continue;
    created.push({
      id: newId("sug"),
      question: `Follow-up to “${s.question.slice(0, 140)}”: ${open.slice(0, 200)} — what evidence would resolve this?`,
      reason: `The council ended that session with this unresolved point.`,
      basis: [{ kind: "session", id: s.id, label: s.question.slice(0, 80) }],
      proposedBy: skeptic,
    });
  }
  // Follow-ups the Founder approved on a discovery become Beyond-the-System topics
  // that build on that investigation (it is passed to the new session as context).
  const found = await db.select().from(discoveries).orderBy(desc(discoveries.updatedAt)).limit(20);
  const chair = await memberIdForRole(db, "chair");
  for (const d of found) {
    for (const f of d.followUps as FollowUp[]) {
      if (created.length >= room) break;
      if (f.kind !== "investigate" || f.status !== "approved" || used.has(`followup:${d.id}:${f.id}`)) continue;
      created.push({
        id: newId("sug"),
        question: f.text,
        reason: `You approved this follow-up from the investigation “${d.question.slice(0, 100)}”.`,
        basis: [
          { kind: "discovery", id: d.id, label: d.question.slice(0, 80) },
          { kind: "followup", id: `${d.id}:${f.id}`, label: f.text.slice(0, 80) },
        ],
        proposedBy: chair,
        mode: "beyond",
        simulated: d.simulated,
      });
    }
  }

  if (!created.length) return [];
  return db.insert(suggestions).values(created).returning();
}

/**
 * Recursive self-examination on a cadence the Founder chose (opt-in). Queues at most
 * one scheduled self-examination per `days`; returns it, or null when one is recent.
 */
export async function queueSelfExamination(db: Db, days: number, now = new Date()) {
  if (days <= 0) return null;
  const since = new Date(now.getTime() - days * 86_400_000);
  const [recent] = await db
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(and(eq(suggestions.mode, "self_examination"), gte(suggestions.createdAt, since)))
    .limit(1);
  if (recent) return null;
  const [row] = await db
    .insert(suggestions)
    .values({
      id: newId("sug"),
      question: selfExaminationQuestion(),
      reason: `Self-examination every ${days} day(s), as you set in Settings: the council applies its own principles to how it operates. It may conclude that no change is needed.`,
      basis: [{ kind: "council", id: `cadence:${now.toISOString().slice(0, 10)}`, label: "How the council operates" }],
      proposedBy: await memberIdForRole(db, "chair"),
      status: "scheduled",
      mode: "self_examination",
    })
    .returning();
  return row;
}

const modelOut = z.object({
  suggestions: z
    .array(z.object({ question: z.string().trim().min(5).max(500), reason: z.string().trim().min(3).max(400) }))
    .max(3),
});

/** Ask a real council member to propose up to 3 topics (charged to the background budget). */
export async function councilSuggestions(db: Db) {
  const room = Math.max(0, Math.min(3, MAX_OPEN - (await openCount(db))));
  if (!room) return { created: [], error: "The suggestion queue is full." };
  const interests = await db.select().from(memoryItems).where(and(eq(memoryItems.kind, "interest"), eq(memoryItems.enabled, true))).limit(10);
  const recent = await db.select({ id: councilSessions.id, q: councilSessions.question }).from(councilSessions).orderBy(desc(councilSessions.startedAt)).limit(8);
  if (!interests.length && !recent.length) return { created: [], error: "Add an interest in Memory or ask a question first — suggestions are based on those." };
  const prompt = `Propose up to ${room} discussion topics the Founder would likely value, based only on the material below. Each needs a one-sentence reason that names the interest or earlier question it builds on. Do not repeat earlier questions.
Interests the Founder approved:
${untrusted("prime-memory", interests.map((i) => `- ${i.content}`).join("\n") || "none")}
Recent questions:
${untrusted("history", recent.map((r) => `- ${r.q}`).join("\n") || "none")}
Return JSON: {"suggestions": [{"question": string, "reason": string}]}`;
  const r = await singleCall(db, { scope: "background", preferRoles: ["chair", "researcher", "analyst"], prompt, phase: "suggest" });
  if ("error" in r) return { created: [], error: r.error };
  const parsed = modelOut.safeParse(extractJsonObject(r.text));
  if (!parsed.success || !parsed.data.suggestions.length) return { created: [], error: "The member did not return usable suggestions." };
  const basis: Basis[] = [
    ...interests.slice(0, 3).map((i) => ({ kind: "memory", id: i.id, label: i.content.slice(0, 80) })),
    ...recent.slice(0, 2).map((s) => ({ kind: "session", id: s.id, label: s.q.slice(0, 80) })),
  ];
  const rows = await db
    .insert(suggestions)
    .values(
      parsed.data.suggestions.slice(0, room).map((s) => ({
        id: newId("sug"),
        question: s.question,
        reason: s.reason,
        basis,
        proposedBy: r.member.id,
      })),
    )
    .returning();
  return { created: rows, error: null };
}
