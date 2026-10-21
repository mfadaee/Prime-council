"use client";

import type { ChamberMessage } from "@/lib/council/reducer";
import type { Contribution, CritiqueSet, DirectReply, EvidenceItem, ExperimentPlan, FinalAnswer, FrameCheck, Interpretation, Reply, SystemMap } from "@/lib/council/types";
import { KIND_META, LEVEL_META } from "@/lib/council/beyond";
import { STANCE_META } from "./meta";

type NameOf = (id: string) => string;

export function excerptOf(m: ChamberMessage, nameOf: NameOf): string {
  const c = m.content as Record<string, unknown>;
  switch (m.kind) {
    case "interpretation":
      return (c as unknown as Interpretation).restatement;
    case "system_map": {
      const m = c as unknown as SystemMap;
      return `${m.currentSystem || m.restatement} — ${m.assumptions.length} assumption(s) mapped.`;
    }
    case "experiment": {
      const x = c as unknown as ExperimentPlan;
      return x.justified ? `Proposed experiment: ${x.hypothesis}` : `No experiment justified: ${x.reason}`;
    }
    case "contribution": {
      const k = c as unknown as Contribution;
      const framing = k.frameCheck?.challenged ? " · questions the framing" : "";
      const alts = k.alternatives?.length ? ` · ${k.alternatives.length} alternative(s)` : "";
      return `${k.answer}${framing}${alts}`;
    }
    case "critique": {
      const s = c as unknown as CritiqueSet;
      if (!s.critiques.length) return `No material objections (${s.overall}).`;
      return s.critiques.map((k) => `${STANCE_META[k.stance].label} ${nameOf(k.targetMemberId)}: ${k.reason}`).join(" · ");
    }
    case "reply": {
      const r = c as unknown as Reply;
      return `${r.response[0].toUpperCase()}${r.response.slice(1)}s — ${r.reason || r.updatedAnswer}`;
    }
    case "synthesis":
      return (c as unknown as FinalAnswer).answer;
    case "direct":
      return (c as unknown as DirectReply).reply;
  }
}

/** Only http(s) URLs become links; everything else is shown as text. */
export function SourceLink({ source }: { source: string }) {
  let url: URL | null = null;
  try {
    url = new URL(source);
  } catch {
    url = null;
  }
  if (url && (url.protocol === "https:" || url.protocol === "http:")) {
    return (
      <a href={url.toString()} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-refine underline decoration-refine/40 underline-offset-2 hover:decoration-refine">
        {url.hostname}
        {url.pathname.length > 1 ? url.pathname.slice(0, 40) : ""}
      </a>
    );
  }
  return <span className="text-muted">{source}</span>;
}

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return <p className="text-faint">No evidence supplied.</p>;
  return (
    <ul className="space-y-1">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-faint" aria-hidden="true">
            ▸
          </span>
          <span>
            {e.claim}
            {e.source && (
              <>
                {" "}
                — <SourceLink source={e.source} />
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function List({ items, empty = "None stated." }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-faint">{empty}</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-faint first:mt-0">{children}</h4>;
}

const KIND_GLYPH = { constraint: "■", convention: "◇", uncertain: "?" } as const;

/** A constraint / convention / unverified chip: glyph + text, never colour alone. */
export function KindChip({ kind }: { kind: keyof typeof KIND_GLYPH }) {
  const tone = kind === "constraint" ? "border-line text-ink" : kind === "convention" ? "border-refine/60 text-refine" : "border-warn/60 text-warn";
  return (
    <span className={`chip ${tone} !text-[10px]`} title={KIND_META[kind].description}>
      <span aria-hidden="true">{KIND_GLYPH[kind]}</span> {KIND_META[kind].label}
    </span>
  );
}

function FrameCheckDetails({ fc }: { fc: FrameCheck }) {
  return (
    <>
      <Label>{fc.challenged ? "Questions the framing" : "Framing accepted"}</Label>
      <p className="whitespace-pre-wrap">{fc.reason || "—"}</p>
      {fc.proxyRisk && <p className="mt-1 text-muted">Proxy risk: {fc.proxyRisk}</p>}
      {fc.reframe && <p className="mt-1 text-prime">Reframe: {fc.reframe}</p>}
      {fc.assumptions.length > 0 && (
        <ul className="mt-1 space-y-1">
          {fc.assumptions.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <KindChip kind={a.kind} />
              <span>{a.statement}</span>
              {a.basis && <span className="text-muted">— {a.basis}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Published details: rationale, evidence, assumptions, critiques. Never hidden reasoning. */
export function MessageDetails({ m, nameOf }: { m: ChamberMessage; nameOf: NameOf }) {
  const c = m.content as Record<string, unknown>;
  switch (m.kind) {
    case "interpretation": {
      const i = c as unknown as Interpretation;
      return (
        <>
          <Label>Constraints</Label>
          <List items={i.constraints} />
          <Label>Success criteria</Label>
          <List items={i.successCriteria} />
        </>
      );
    }
    case "system_map": {
      const m = c as unknown as SystemMap;
      return (
        <>
          <Label>Current system</Label>
          <p className="whitespace-pre-wrap">{m.currentSystem || "—"}</p>
          <Label>Produces · exists because</Label>
          <p>
            {m.produces || "—"} · {m.whyExists || "—"}
          </p>
          <Label>Assumptions</Label>
          {m.assumptions.length ? (
            <ul className="space-y-1">
              {m.assumptions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                  <b>{a.id}</b> <KindChip kind={a.kind} /> {a.matters && <span className="chip !text-[10px] text-prime">material</span>}
                  <span>{a.statement}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint">None listed.</p>
          )}
          <Label>Excluded possibilities</Label>
          <List items={m.boundaries} />
          <Label>Success criteria</Label>
          <List items={m.successCriteria} />
        </>
      );
    }
    case "experiment": {
      const x = c as unknown as ExperimentPlan;
      return x.justified ? (
        <>
          <Label>Hypothesis</Label>
          <p>{x.hypothesis}</p>
          <Label>Expected observations</Label>
          <List items={x.expectedObservations} />
          <Label>Success criteria · stop conditions</Label>
          <List items={[...x.successCriteria.map((v) => `Success: ${v}`), ...x.stopConditions.map((v) => `Stop: ${v}`)]} />
          <Label>Cost · risks · reversible</Label>
          <p>
            {x.cost || "—"} · {x.risks.join("; ") || "none stated"} · {x.reversible ? "reversible" : "not reversible"}
          </p>
          <p className="mt-2 text-xs text-faint">A proposal only — nothing runs automatically.</p>
        </>
      ) : (
        <>
          <Label>Why no experiment</Label>
          <p>{x.reason || "—"}</p>
        </>
      );
    }
    case "contribution": {
      const k = c as unknown as Contribution;
      return (
        <>
          <Label>Rationale</Label>
          <p className="whitespace-pre-wrap">{k.rationale || "—"}</p>
          <Label>Evidence</Label>
          <EvidenceList items={k.evidence} />
          <Label>Assumptions</Label>
          <List items={k.assumptions} />
          {k.frameCheck && <FrameCheckDetails fc={k.frameCheck} />}
          {k.alternatives && k.alternatives.length > 0 && (
            <>
              <Label>Alternatives originated</Label>
              <ul className="space-y-1.5">
                {k.alternatives.map((a) => (
                  <li key={a.id}>
                    <span className="chip mr-1 !text-[10px] text-prime">{LEVEL_META[a.level].label}</span>
                    <b>{a.title}</b> <span className="text-faint">({a.id})</span>
                    <p className="text-muted">{a.description}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Label>Self-reported confidence</Label>
          <p>{Math.round(k.confidence * 100)}%</p>
        </>
      );
    }
    case "critique": {
      const s = c as unknown as CritiqueSet;
      return (
        <>
          <Label>Overall</Label>
          <p className="capitalize">{s.overall}</p>
          <Label>Critiques</Label>
          {s.critiques.length ? (
            <ul className="space-y-2">
              {s.critiques.map((k, i) => (
                <li key={i} className="rounded-lg border border-line p-2">
                  <span className="chip mr-1" style={{ color: STANCE_META[k.stance].color, borderColor: `${STANCE_META[k.stance].color}66` }}>
                    {STANCE_META[k.stance].label}
                  </span>
                  <b>{nameOf(k.targetMemberId)}</b> on “{k.claim}”
                  {k.alternativeId && <span className="ml-1 text-faint">({k.alternativeId})</span>}
                  <p className="mt-1 whitespace-pre-wrap">{k.reason}</p>
                  {k.evidence && <p className="mt-1 text-muted">Evidence: {k.evidence}</p>}
                  {k.assumption && <p className="mt-1 text-muted">Assumption challenged: {k.assumption}</p>}
                  {k.resolveBy && <p className="mt-1 text-muted">Would be settled by: {k.resolveBy}</p>}
                  {k.escapesFraming !== undefined && <p className="mt-1 text-muted">{k.escapesFraming ? "Escapes the original framing" : "Does not escape the original framing"}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint">No critiques.</p>
          )}
        </>
      );
    }
    case "reply": {
      const r = c as unknown as Reply;
      return (
        <>
          <Label>Response</Label>
          <p className="capitalize">{r.response}</p>
          <Label>Updated position</Label>
          <p className="whitespace-pre-wrap">{r.updatedAnswer}</p>
          <Label>Reason</Label>
          <p className="whitespace-pre-wrap">{r.reason || "—"}</p>
          {r.alternativeUpdates && r.alternativeUpdates.length > 0 && (
            <>
              <Label>Alternatives</Label>
              <List items={r.alternativeUpdates.map((u) => `${u.id}: ${u.action}${u.note ? ` — ${u.note}` : ""}`)} />
            </>
          )}
        </>
      );
    }
    case "synthesis": {
      const f = c as unknown as FinalAnswer;
      return (
        <>
          <Label>Answer</Label>
          <p className="whitespace-pre-wrap">{f.answer}</p>
        </>
      );
    }
    case "direct":
      return null;
  }
}
