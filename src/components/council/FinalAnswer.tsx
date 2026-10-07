"use client";

import { useState } from "react";
import type { Contribution, FinalAnswer } from "@/lib/council/types";
import { EvidenceList } from "./content";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="prose-answer">
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
    </div>
  );
}

export function FinalAnswerPanel({
  final,
  initial,
  override,
  synthesizerName,
  simulated,
  status,
  onOverride,
}: {
  final: FinalAnswer | null;
  initial: Contribution | null;
  override: { decision: string; note?: string } | null;
  synthesizerName: string | null;
  simulated: boolean;
  status: string;
  onOverride?: () => void;
}) {
  const [compare, setCompare] = useState(false);
  if (!final) {
    return (
      <section className="panel p-5" aria-labelledby="final-title">
        <h2 id="final-title" className="font-display text-lg font-bold">
          Council answer
        </h2>
        <p className="mt-2 text-sm text-muted">
          {status === "running" ? "The council is deliberating. The final answer appears here after synthesis." : status === "idle" ? "Ask a question to convene the council." : `No final answer (session ${status}).`}
        </p>
      </section>
    );
  }
  return (
    <section
      className="relative rounded-2xl p-[1.5px]"
      style={{ background: "linear-gradient(135deg, rgba(255,211,110,0.8), rgba(139,123,255,0.7), rgba(92,200,255,0.7))" }}
      aria-labelledby="final-title"
    >
      <div className="rounded-2xl bg-panel-solid p-5 sm:p-6">
        {override && (
          <div className="mb-5 rounded-xl border border-prime/60 bg-prime/10 p-4">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-prime">♛ The Prime&apos;s decision (overrides the council)</h3>
            <p className="mt-2 whitespace-pre-wrap">{override.decision}</p>
            {override.note && <p className="mt-2 text-sm text-muted">Note: {override.note}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="final-title" className="font-display text-xl font-bold">
            {override ? "Council's answer (superseded)" : "Council answer"}
          </h2>
          {simulated && <span className="chip sim-badge">Simulated</span>}
          <span className="chip text-muted" title="Self-reported by the synthesizer, not a calibrated probability">
            Confidence {Math.round(final.confidence * 100)}%
          </span>
          <div className="ml-auto flex gap-2">
            {initial && (
              <button type="button" className="btn btn-sm" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
                {compare ? "Hide comparison" : "Compare initial vs final"}
              </button>
            )}
            {onOverride && (
              <button type="button" className="btn btn-sm btn-prime" onClick={onOverride}>
                Override decision
              </button>
            )}
          </div>
        </div>
        {synthesizerName && <p className="mt-1 text-xs text-faint">Synthesized by {synthesizerName} from the council&apos;s published contributions.</p>}

        {compare && initial ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">Initial answer (before critique)</h3>
              <Paragraphs text={initial.answer} />
            </div>
            <div className="rounded-xl border border-prime/40 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-prime">Final answer</h3>
              <Paragraphs text={final.answer} />
            </div>
          </div>
        ) : (
          <div className="mt-4 text-[15px] leading-relaxed">
            <Paragraphs text={final.answer} />
          </div>
        )}

        <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-faint">Key evidence</h3>
            <EvidenceList items={final.keyEvidence} />
            {final.keyEvidence.some((e) => e.source) && <p className="mt-1.5 text-[11px] text-faint">Sources were supplied by members and have not been independently verified.</p>}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-faint">Remaining uncertainty</h3>
            {final.uncertainty.length ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {final.uncertainty.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            ) : (
              <p className="text-faint">None stated.</p>
            )}
            {final.disagreements.length > 0 && (
              <>
                <h3 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-wider text-challenge">Unresolved disagreement</h3>
                <ul className="list-disc space-y-0.5 pl-4">
                  {final.disagreements.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        {final.deliberationEffect && (
          <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-sm">
            <span className="font-semibold text-reply">How deliberation changed the answer: </span>
            {final.deliberationEffect}
          </div>
        )}
      </div>
    </section>
  );
}
