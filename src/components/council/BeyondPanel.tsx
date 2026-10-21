"use client";

import Link from "next/link";
import { LEVEL_META, type AlternativeView, type BeyondView, type CheckStatus, type Stand } from "@/lib/council/beyond";
import type { FinalAnswer, Phase, SystemMap } from "@/lib/council/types";
import { Avatar } from "./Avatar";
import type { SeatMember } from "./Chamber";
import { KindChip } from "./content";

const STAGES: { id: string; title: string; phases: Phase[] }[] = [
  { id: "A–B", title: "Map the current system", phases: ["map"] },
  { id: "C–D", title: "Remove assumptions · generate alternatives", phases: ["independent"] },
  { id: "E", title: "Challenge the alternatives", phases: ["critique", "resolve"] },
  { id: "F", title: "Design an experiment", phases: ["experiment"] },
  { id: "G", title: "Learn and update", phases: ["synthesize"] },
];

const CHECK_GLYPH: Record<CheckStatus, { glyph: string; tone: string; label: string }> = {
  pass: { glyph: "✓", tone: "text-support", label: "Pass" },
  attention: { glyph: "!", tone: "text-warn", label: "Needs attention" },
  not_applicable: { glyph: "–", tone: "text-faint", label: "Not applicable" },
};

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-faint first:mt-0">{children}</h3>;
}

/**
 * Beyond the System: what the council challenged, which constraints it kept,
 * who originated each alternative and who supports or challenges it, how ideas
 * evolved, the proposed experiment and what was learned. Everything here is
 * derived from published, recorded messages — nothing is simulated by the view.
 */
export function BeyondPanel({
  view,
  map,
  final,
  members,
  nameOf,
  phase,
  status,
  discoveryId,
  simulated,
  reached,
}: {
  view: BeyondView;
  map: SystemMap | null;
  final: FinalAnswer | null;
  members: SeatMember[];
  nameOf: (id: string) => string;
  phase: Phase | null;
  status: string;
  discoveryId: string | null;
  simulated: boolean;
  /** Phases that have actually started in this session. */
  reached: Set<Phase>;
}) {
  const member = (id: string) => members.find((m) => m.id === id);
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="beyond-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="beyond-title" className="font-display text-lg font-bold">
          ⟁ Beyond the System
        </h2>
        {simulated && <span className="chip sim-badge">Simulated</span>}
        {discoveryId && (
          <Link href={`/discoveries/${discoveryId}`} className="ml-auto text-xs text-prime underline">
            Open the discovery record →
          </Link>
        )}
      </div>

      <ol className="mt-3 grid gap-1.5 sm:grid-cols-5" aria-label="Exploration stages">
        {STAGES.map((st) => {
          const current = status === "running" && phase !== null && st.phases.includes(phase);
          const done = st.phases.some((p) => reached.has(p)) && !current;
          return (
            <li
              key={st.id}
              className={`rounded-lg border px-2 py-1.5 text-[11px] ${current ? "border-prime/70 bg-prime/10" : done ? "border-support/40" : "border-line text-faint"}`}
              aria-current={current ? "step" : undefined}
            >
              <span className="font-bold">
                {done ? "✓ " : current ? "● " : ""}
                {st.id}
              </span>{" "}
              {st.title}
            </li>
          );
        })}
      </ol>

      {map && (
        <>
          <Heading>Current reality</Heading>
          <p className="text-sm">{map.currentSystem || map.restatement}</p>
          {(map.produces || map.whyExists) && (
            <p className="mt-1 text-xs text-muted">
              {map.produces && <>Produces: {map.produces}. </>}
              {map.whyExists && <>Exists because: {map.whyExists}</>}
            </p>
          )}
          {map.boundaries.length > 0 && <p className="mt-1 text-xs text-muted">Excluded by the framing: {map.boundaries.join(" · ")}</p>}
        </>
      )}

      {view.assumptions.length > 0 && (
        <>
          <Heading>Assumptions — real constraints vs changeable conventions</Heading>
          <ul className="space-y-2 text-sm">
            {view.assumptions.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-xs">{a.id}</b>
                  <KindChip kind={a.kind} />
                  {a.matters && <span className="chip !text-[10px] text-prime">material to the decision</span>}
                  {a.removedBy.length > 0 && <span className="ml-auto text-[11px] text-faint">dropped by {a.removedBy.join(", ")}</span>}
                </div>
                <p className="mt-1">{a.statement}</p>
                {a.basis && <p className="text-xs text-muted">Basis: {a.basis}</p>}
                {a.challengedBy.map((c, i) => (
                  <p key={i} className="mt-1 text-xs text-challenge">
                    ⚡ {nameOf(c.memberId)} challenges it: {c.note}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      {view.frameChallenges.length > 0 && (
        <>
          <Heading>Members questioning the framing</Heading>
          <ul className="space-y-1.5 text-sm">
            {view.frameChallenges.map((f) => (
              <li key={f.memberId}>
                <b>{nameOf(f.memberId)}:</b> {f.check.reason}
                {f.check.reframe && <span className="text-prime"> Reframe: {f.check.reframe}</span>}
                {f.check.proxyRisk && <span className="text-muted"> Proxy risk: {f.check.proxyRisk}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {view.alternatives.length > 0 && (
        <>
          <Heading>
            Alternatives · {view.viableDistinct} viable and structurally distinct of {view.alternatives.length}
          </Heading>
          <div className="grid gap-3 md:grid-cols-2">
            {view.alternatives.map((a) => (
              <AlternativeCard key={a.id} a={a} originator={member(a.originatorId)} nameOf={nameOf} />
            ))}
          </div>
        </>
      )}

      {view.experiment && (
        <>
          <Heading>Experiment</Heading>
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="text-xs text-muted">
              Designed by <b>{nameOf(view.experiment.memberId)}</b>
              {view.experiment.plan.alternativeId && <> for {view.experiment.plan.alternativeId}</>} ·{" "}
              <span className="chip !text-[10px]">{view.experiment.plan.justified ? "Proposed — not run" : "Not justified"}</span>
            </p>
            {view.experiment.plan.justified ? (
              <>
                <p className="mt-1.5">
                  <b>Hypothesis:</b> {view.experiment.plan.hypothesis}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Success: {view.experiment.plan.successCriteria.join("; ") || "—"} · Stop when: {view.experiment.plan.stopConditions.join("; ") || "—"} · Cost: {view.experiment.plan.cost || "—"} ·{" "}
                  {view.experiment.plan.reversible ? "reversible" : "not reversible"}
                </p>
              </>
            ) : (
              <p className="mt-1.5">{view.experiment.plan.reason}</p>
            )}
          </div>
        </>
      )}

      {final && (final.learned?.length || final.nextQuestions?.length || final.framingVerdict || final.conventionalIsBest) ? (
        <>
          <Heading>What the council learned</Heading>
          {final.conventionalIsBest && <p className="mb-1 text-sm text-support">✓ The council concluded the conventional approach is already best.</p>}
          {final.framingVerdict && <p className="text-sm">Framing: {final.framingVerdict}</p>}
          {final.learned && final.learned.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {final.learned.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {final.nextQuestions && final.nextQuestions.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold text-reply">Intends to investigate next</p>
              <ul className="list-disc space-y-0.5 pl-4 text-sm">
                {final.nextQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}

      {view.checks.length > 0 && (view.alternatives.length > 0 || view.assumptions.length > 0) && (
        <>
          <Heading>Checks run in code</Heading>
          <p className="mb-2 text-[11px] text-faint">Concrete findings, not a score: the council is not rewarded for novelty or for how many assumptions it challenges.</p>
          <ul className="space-y-1 text-sm">
            {view.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className={`w-4 shrink-0 text-center font-bold ${CHECK_GLYPH[c.status].tone}`} aria-label={CHECK_GLYPH[c.status].label}>
                  {CHECK_GLYPH[c.status].glyph}
                </span>
                <span>
                  {c.label}
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Stands({ label, tone, stands, nameOf }: { label: string; tone: string; stands: Stand[]; nameOf: (id: string) => string }) {
  if (!stands.length) return null;
  return (
    <div className="mt-2">
      <p className={`text-[11px] font-semibold ${tone}`}>{label}</p>
      <ul className="space-y-0.5 text-xs">
        {stands.map((s, i) => (
          <li key={i}>
            <b>{nameOf(s.memberId)}</b> (R{s.round}): {s.reason}
            {s.assumption && <span className="text-muted"> · assumption: {s.assumption}</span>}
            {s.resolveBy && <span className="text-muted"> · settle by: {s.resolveBy}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlternativeCard({ a, originator, nameOf }: { a: AlternativeView; originator?: SeatMember; nameOf: (id: string) => string }) {
  return (
    <article className={`rounded-xl border p-3 text-sm ${a.status === "withdrawn" ? "border-line opacity-70" : a.level === "reframe" ? "border-prime/50" : "border-line"}`} aria-label={`Alternative ${a.title}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip !text-[10px] text-prime">{LEVEL_META[a.level].label}</span>
        {a.status !== "standing" && <span className="chip !text-[10px] text-warn">{a.status}</span>}
        <span className="ml-auto text-[11px] text-faint">{a.id}</span>
      </div>
      <h4 className="mt-1.5 font-semibold">{a.title}</h4>
      <p className="mt-0.5 text-muted">{a.description}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-faint">
        {originator && <Avatar id={originator.id} monogram={originator.monogram} color={originator.color} size={18} />}
        Originated by <b className="text-ink">{nameOf(a.originatorId)}</b>
        {a.removes.length > 0 && <> · drops {a.removes.join(", ")}</>}
      </p>
      {a.flags.map((f, i) => (
        <p key={i} className="mt-1 text-xs text-warn">
          ! {f}
        </p>
      ))}
      <Stands label="Supported by" tone="text-support" stands={a.supporters} nameOf={nameOf} />
      <Stands label="Challenged by" tone="text-challenge" stands={a.challengers} nameOf={nameOf} />
      <Stands label="Refined by" tone="text-refine" stands={a.refiners} nameOf={nameOf} />
      {(a.escapes.yes > 0 || a.escapes.no > 0) && (
        <p className="mt-1.5 text-xs text-muted">
          Escapes the original framing? {a.escapes.yes} yes · {a.escapes.no} no
        </p>
      )}
      {a.history.length > 1 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-faint">How this idea evolved ({a.history.length} steps)</summary>
          <ol className="mt-1 space-y-0.5">
            {a.history.map((h, i) => (
              <li key={i}>
                <span className="text-faint">R{h.round}</span> {nameOf(h.memberId)} — {h.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
