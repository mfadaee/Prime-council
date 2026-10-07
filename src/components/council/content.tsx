"use client";

import type { ChamberMessage } from "@/lib/council/reducer";
import type { Contribution, CritiqueSet, DirectReply, EvidenceItem, FinalAnswer, Interpretation, Reply } from "@/lib/council/types";
import { STANCE_META } from "./meta";

type NameOf = (id: string) => string;

export function excerptOf(m: ChamberMessage, nameOf: NameOf): string {
  const c = m.content as Record<string, unknown>;
  switch (m.kind) {
    case "interpretation":
      return (c as unknown as Interpretation).restatement;
    case "contribution":
      return (c as unknown as Contribution).answer;
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
                  <p className="mt-1 whitespace-pre-wrap">{k.reason}</p>
                  {k.evidence && <p className="mt-1 text-muted">Evidence: {k.evidence}</p>}
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
