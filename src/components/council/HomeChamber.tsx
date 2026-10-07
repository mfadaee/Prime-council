"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { CouncilRole } from "@/lib/council/types";
import { Chamber, type SeatMember } from "./Chamber";
import { Composer } from "./Composer";

interface MemberRow {
  id: string;
  name: string;
  role: CouncilRole;
  color: string;
  monogram: string;
  model: string;
  providerId: string;
  enabled: boolean;
  simulated: boolean;
  sharesModelWith: string[];
  provider: { kind: string; label: string; status: string } | null;
}
type Entry =
  | { kind: "decision"; at: string; sessionId: string; origin: string; question: string; summary: string; confidence: number | null; status: string; simulated: boolean; override: string | null }
  | { kind: "world"; at: string; tick: number; type: string; text: string; sessionId?: string };
interface Chronicle {
  entries: Entry[];
  outcomes: {
    worldName: string;
    day: number;
    agents: number;
    agentsByPrime: { id: string; name: string; count: number }[];
    projectsBuilt: number;
    awaitingDecision: number;
    organizations: number;
    decisionsMade: number;
  };
}

const ORIGIN_LABEL: Record<string, string> = {
  prime: "You asked",
  suggestion: "Suggested topic",
  background: "Background",
  world: "World decision",
  governance: "Prime governance",
};
const WORLD_TONE: Record<string, string> = {
  "council.decision": "text-prime",
  "council.recommendation": "text-prime",
  "project.council_needed": "text-prime",
  "project.completed": "text-support",
  "project.funded": "text-support",
  "inhabitant.arrived": "text-reply",
  "organization.founded": "text-reply",
  "world.restored": "text-warn",
};

export function HomeChamber() {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [chron, setChron] = useState<Chronicle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<{ members: MemberRow[] }>("/api/members").then((r) => setMembers(r.members)).catch(() => setMembers([]));
    api<Chronicle>("/api/chronicle").then(setChron).catch(() => {});
  }, []);

  const seated = (members ?? []).filter((m) => m.enabled);
  const seats: SeatMember[] = seated.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    color: m.color,
    monogram: m.monogram,
    providerKind: m.simulated ? "demo" : (m.provider?.kind ?? "demo"),
    providerLabel: m.provider?.label ?? "?",
    model: m.model,
    simulated: m.simulated,
    sharesModelWith: m.sharesModelWith,
    enabled: m.enabled,
  }));
  const states = Object.fromEntries(
    seated.map((m) => {
      const s = m.provider?.status;
      return [m.id, { state: s === "not_configured" || s === "unavailable" || s === "disabled" ? ("offline" as const) : ("idle" as const), detail: s }];
    }),
  );
  const allSim = seats.length > 0 && seats.every((s) => s.simulated);
  const families = new Set(seated.filter((m) => !m.simulated).map((m) => `${m.providerId}:${m.model}`));
  const o = chron?.outcomes;

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <p className="max-w-4xl text-sm text-muted">
          <b className="text-ink">The Prime Council.</b> One Prime for each AI model, working under your charter to build intelligence and a simulated world like ours — to find what is true and
          add value to human life. You speak only with the Primes; the agents they create act in the world. You see major decisions and outcomes here.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Outcomes">
          <Tile label="Primes · model families" value={`${seated.length} · ${allSim ? "demo" : families.size}`} warn={!allSim && families.size < seated.length ? "some Primes share a model" : undefined} />
          <Tile label="Decisions made" value={o ? String(o.decisionsMade) : "…"} />
          <Tile label="Awaiting decision" value={o ? String(o.awaitingDecision) : "…"} href="/world" highlight={Boolean(o?.awaitingDecision)} />
          <Tile label={`${o?.worldName ?? "World"} · day`} value={o ? String(o.day) : "…"} href="/world" />
          <Tile label="Agents created" value={o ? String(o.agents) : "…"} href="/world" />
          <Tile label="Projects built" value={o ? String(o.projectsBuilt) : "…"} href="/world" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          {members === null ? (
            <div className="panel grid aspect-[10/7] place-items-center text-muted">Assembling the Primes…</div>
          ) : (
            <Chamber
              members={seats}
              states={states}
              links={[]}
              speakingId={null}
              speech={null}
              phaseLabel="Council in recess"
              round={0}
              phase={null}
              running={false}
              simulated={allSim}
              onSelect={setSelected}
              selectedId={selected}
            />
          )}
          <Composer />
          {allSim && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-[#ffe2a3]">
              Demo mode: no AI model is connected yet, so every Prime runs on the simulated demo provider (clearly labelled, no model calls). Add model keys in <code>.env.local</code> and assign a
              model to each Prime in{" "}
              <Link className="underline" href="/members">
                Primes
              </Link>
              .
            </p>
          )}
        </div>

        <aside className="panel flex flex-col p-4" aria-labelledby="chronicle-title">
          <div className="flex items-center gap-2">
            <h2 id="chronicle-title" className="font-display text-lg font-bold">
              Chronicle
            </h2>
            <span className="text-xs text-muted">major decisions & outcomes</span>
            <Link href="/sessions" className="ml-auto text-xs text-muted underline">
              All deliberations
            </Link>
          </div>
          {o && o.agentsByPrime.length > 0 && <p className="mt-2 text-xs text-muted">Agents created: {o.agentsByPrime.map((p) => `${p.name} ${p.count}`).join(" · ")}</p>}
          <ol className="scroll-thin mt-3 max-h-[640px] space-y-2.5 overflow-y-auto">
            {chron && chron.entries.length === 0 && <li className="text-sm text-faint">Nothing has happened yet. Ask the Primes something, or start the world.</li>}
            {chron?.entries.map((e, i) =>
              e.kind === "decision" ? (
                <li key={`d${e.sessionId}`} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="chip text-muted">{ORIGIN_LABEL[e.origin] ?? e.origin}</span>
                    {e.simulated && <span className="chip sim-badge !text-[10px]">Simulated</span>}
                    {e.status !== "completed" && <span className="chip border-warn/60 text-warn">{e.status}</span>}
                    {e.override && <span className="chip border-prime/60 text-prime">Founder override</span>}
                    <time className="ml-auto text-faint" dateTime={e.at}>
                      {new Date(e.at).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium">{e.question}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">
                    <b className="text-prime">{e.override ? "Your decision: " : "Decision: "}</b>
                    {e.override ?? e.summary}
                  </p>
                  <Link href={`/sessions/${e.sessionId}`} className="mt-1 inline-block text-[11px] text-faint underline">
                    Open (deliberation available if you want it)
                  </Link>
                </li>
              ) : (
                <li key={`w${i}`} className="flex gap-2 px-1 text-xs">
                  <span className="shrink-0 text-faint">World D{Math.floor(e.tick / 3) + 1}</span>
                  <span className={WORLD_TONE[e.type] ?? "text-muted"}>
                    {e.text}{" "}
                    {e.sessionId && (
                      <Link className="underline" href={`/sessions/${e.sessionId}`}>
                        session
                      </Link>
                    )}
                  </span>
                </li>
              ),
            )}
          </ol>
        </aside>
      </section>
    </div>
  );
}

function Tile({ label, value, href, warn, highlight }: { label: string; value: string; href?: string; warn?: string; highlight?: boolean }) {
  const body = (
    <div className={`h-full rounded-xl border px-3 py-2 ${highlight ? "border-prime/60 bg-prime/10" : "border-line bg-white/[0.03]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold">{value}</p>
      {warn && <p className="text-[11px] text-warn">{warn}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}
