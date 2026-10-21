"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { AlternativeCard } from "@/components/council/BeyondPanel";
import { KindChip } from "@/components/council/content";
import {
  ASSUMPTION_STATUSES,
  DISCOVERY_STATUSES,
  EXPERIMENT_STATUSES,
  type DiscoveryRecord,
  type DiscoveryStatus,
  type FollowUp,
} from "@/lib/discovery/types";

export const STATUS_TONE: Record<DiscoveryStatus, string> = {
  open: "border-refine/60 text-refine",
  experimenting: "border-prime/60 text-prime",
  concluded: "border-support/60 text-support",
  archived: "text-faint",
  incomplete: "border-warn/60 text-warn",
};

interface Detail {
  discovery: DiscoveryRecord;
  parent: { id: string; question: string } | null;
  revisits: { id: string; question: string; createdAt: string }[];
  related: { id: string; question: string; shared: { mine: string; theirs: string }[] }[];
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 font-display text-base font-bold">{children}</h2>;
}

export function DiscoveryView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lessons, setLessons] = useState("");
  const [outcome, setOutcome] = useState<"supported" | "refuted" | "inconclusive">("inconclusive");
  const [observations, setObservations] = useState("");
  const [focus, setFocus] = useState("");

  const load = useCallback(
    () =>
      api<Detail>(`/api/discoveries/${id}`)
        .then((d) => {
          setData(d);
          setLessons(d.discovery.lessons.join("\n"));
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ discovery: DiscoveryRecord }>(`/api/discoveries/${id}`, { method: "PATCH", body });
      setData((prev) => (prev ? { ...prev, discovery: r.discovery } : prev));
      setNotice(ok);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="panel p-6 text-danger">Could not load discovery: {error}</div>;
  if (!data) return <div className="panel p-6 text-muted">Loading discovery…</div>;
  const d = data.discovery;
  const nameOf = (mid: string) => d.alternatives.find((a) => a.originatorId === mid)?.originatorName ?? mid;
  const exp = d.experiment;

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Link href="/discoveries" className="text-faint underline">
            ← Discoveries
          </Link>
          {d.scope === "council" && <span className="chip border-prime/60 text-prime">self-examination</span>}
          {d.simulated && <span className="chip sim-badge !text-[10px]">Simulated</span>}
          <label className="ml-auto flex items-center gap-1 text-muted">
            Status
            <select
              className="field !w-auto !py-0.5 !text-xs"
              value={d.status}
              disabled={busy}
              onChange={(e) => patch({ status: e.target.value }, "Status updated")}
              aria-label="Discovery status"
            >
              {DISCOVERY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h1 className="mt-2 font-display text-lg font-bold leading-snug">{d.question}</h1>
        {d.framing && <p className="mt-1 text-sm text-muted">Framing: {d.framing}</p>}
        <p className="mt-2 flex flex-wrap gap-3 text-xs">
          <Link href={`/sessions/${d.sessionId}`} className="text-prime underline">
            Open the deliberation
          </Link>
          {data.parent && (
            <Link href={`/discoveries/${data.parent.id}`} className="underline">
              Builds on: {data.parent.question.slice(0, 80)}
            </Link>
          )}
          {data.revisits.map((r) => (
            <Link key={r.id} href={`/discoveries/${r.id}`} className="underline">
              Revisited {new Date(r.createdAt).toLocaleDateString()}
            </Link>
          ))}
        </p>
        {notice && (
          <p className="mt-2 text-xs text-muted" role="status">
            {notice}
          </p>
        )}
      </section>

      {d.answer && (
        <section className="panel p-4 text-sm">
          <H>What the council concluded</H>
          <p className="whitespace-pre-wrap">{d.answer}</p>
          {d.minorityViews.length > 0 && (
            <>
              <h3 className="mb-1 mt-3 text-xs font-bold uppercase tracking-wider text-reply">Minority views and disagreements kept</h3>
              <ul className="list-disc space-y-0.5 pl-4">
                {d.minorityViews.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
          {d.uncertainty.length > 0 && <p className="mt-2 text-xs text-muted">Unresolved: {d.uncertainty.join(" · ")}</p>}
        </section>
      )}

      <section className="panel p-4 text-sm" aria-labelledby="assumptions-title">
        <H>
          <span id="assumptions-title">Assumptions and what became of them</span>
        </H>
        {d.existingSystem.currentSystem && <p className="mb-2 text-muted">Existing system: {d.existingSystem.currentSystem}</p>}
        {d.assumptions.length === 0 && <p className="text-faint">No assumptions were mapped.</p>}
        <ul className="space-y-2">
          {d.assumptions.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-xs">{a.id}</b>
                <KindChip kind={a.kind} />
                {a.matters && <span className="chip !text-[10px] text-prime">material</span>}
                <select
                  className="field ml-auto !w-auto !py-0.5 !text-xs"
                  value={a.status}
                  disabled={busy}
                  aria-label={`Status of ${a.id}`}
                  onChange={(e) => patch({ assumptions: [{ id: a.id, status: e.target.value }] }, `${a.id} marked ${e.target.value}`)}
                >
                  {ASSUMPTION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1">{a.statement}</p>
              {a.basis && <p className="text-xs text-muted">Basis: {a.basis}</p>}
              {a.challengedBy.map((c, i) => (
                <p key={i} className="text-xs text-challenge">
                  ⚡ {nameOf(c.memberId)}: {c.note}
                </p>
              ))}
              {a.revision && <p className="text-xs text-support">Revision: {a.revision}</p>}
            </li>
          ))}
        </ul>
        {d.constraints.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-xs font-bold uppercase tracking-wider text-faint">Fundamental constraints that remain</h3>
            <ul className="list-disc space-y-0.5 pl-4">
              {d.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {d.alternatives.length > 0 && (
        <section className="panel p-4" aria-label="Alternatives">
          <H>Alternatives considered (all kept, including withdrawn)</H>
          <div className="grid gap-3 md:grid-cols-2">
            {d.alternatives.map((a) => (
              <AlternativeCard key={a.id} a={a} nameOf={nameOf} />
            ))}
          </div>
        </section>
      )}

      <section className="panel p-4 text-sm" aria-labelledby="experiment-title">
        <H>
          <span id="experiment-title">Experiment</span>
        </H>
        {!exp ? (
          <p className="text-faint">No experiment was designed.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Designed by <b>{exp.designedByName}</b>
              {exp.plan.alternativeId && <> for {exp.plan.alternativeId}</>}
              <label className="ml-auto flex items-center gap-1">
                Status
                <select
                  className="field !w-auto !py-0.5 !text-xs"
                  value={exp.status}
                  disabled={busy}
                  aria-label="Experiment status"
                  onChange={(e) => patch({ experiment: { status: e.target.value } }, "Experiment status updated")}
                >
                  {EXPERIMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {exp.plan.justified ? (
              <div className="mt-2 space-y-1">
                <p>
                  <b>Hypothesis:</b> {exp.plan.hypothesis}
                </p>
                <p className="text-xs text-muted">Expected: {exp.plan.expectedObservations.join("; ") || "—"}</p>
                <p className="text-xs text-muted">
                  Success: {exp.plan.successCriteria.join("; ") || "—"} · Stop when: {exp.plan.stopConditions.join("; ") || "—"}
                </p>
                <p className="text-xs text-muted">
                  Cost: {exp.plan.cost || "—"} · Risks: {exp.plan.risks.join("; ") || "—"} · {exp.plan.reversible ? "reversible" : "not reversible"}
                </p>
              </div>
            ) : (
              <p className="mt-2">Not justified: {exp.plan.reason}</p>
            )}
            {exp.result ? (
              <p className="mt-3 rounded-lg border border-line p-2">
                <b className="capitalize">{exp.result.outcome}</b> ({new Date(exp.result.recordedAt).toLocaleDateString()}): {exp.result.observations}
              </p>
            ) : null}
            <form
              className="mt-3 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                await patch({ experiment: { status: "completed", result: { outcome, observations } } }, "Result recorded");
                setObservations("");
              }}
            >
              <select className="field" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label="Outcome">
                <option value="supported">Supported</option>
                <option value="refuted">Refuted</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
              <input className="field" placeholder="What you observed when you ran it" value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={4000} required />
              <button className="btn btn-sm" disabled={busy || !observations.trim()}>
                Record result
              </button>
            </form>
            <p className="mt-1 text-[11px] text-faint">The council never runs experiments. Record what happened when you did, then update the assumptions above.</p>
          </>
        )}
      </section>

      <section className="panel p-4 text-sm" aria-labelledby="lessons-title">
        <H>
          <span id="lessons-title">Lessons</span>
        </H>
        <textarea className="field min-h-24" value={lessons} onChange={(e) => setLessons(e.target.value)} aria-label="Lessons, one per line" />
        <button
          className="btn btn-sm mt-2"
          disabled={busy}
          onClick={() =>
            patch(
              {
                lessons: lessons
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              },
              "Lessons saved",
            )
          }
        >
          Save lessons
        </button>
      </section>

      {d.followUps.length > 0 && (
        <section className="panel p-4 text-sm" aria-labelledby="follow-title">
          <H>
            <span id="follow-title">Follow-ups</span>
          </H>
          <ul className="space-y-2">
            {d.followUps.map((f) => (
              <FollowUpItem key={f.id} f={f} busy={busy} onStatus={(status) => patch({ followUps: [{ id: f.id, status }] }, `Follow-up ${status}`)} />
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">Approved investigations appear as suggested Beyond-the-System topics (when suggestions are on) and build on this record.</p>
        </section>
      )}

      {d.checks.length > 0 && (
        <section className="panel p-4 text-sm" aria-label="Checks">
          <H>Checks run in code</H>
          <ul className="space-y-1">
            {d.checks.map((c) => (
              <li key={c.id}>
                <b className={c.status === "pass" ? "text-support" : c.status === "attention" ? "text-warn" : "text-faint"}>{c.status === "pass" ? "✓" : c.status === "attention" ? "!" : "–"}</b> {c.label}
                <span className="block text-xs text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.related.length > 0 && (
        <section className="panel p-4 text-sm" aria-labelledby="related-title">
          <H>
            <span id="related-title">Recurring assumptions in other investigations</span>
          </H>
          <ul className="space-y-2">
            {data.related.map((r) => (
              <li key={r.id}>
                <Link href={`/discoveries/${r.id}`} className="font-medium underline">
                  {r.question}
                </Link>
                <ul className="mt-0.5 list-disc pl-4 text-xs text-muted">
                  {r.shared.slice(0, 3).map((s, i) => (
                    <li key={i}>
                      “{s.theirs}” ~ “{s.mine}”
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-4" aria-labelledby="revisit-title">
        <H>
          <span id="revisit-title">Revisit</span>
        </H>
        <p className="text-sm text-muted">Start a new exploration that receives this record — assumptions, alternatives, experiment results and lessons — so the council builds on it.</p>
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api<{ sessionId: string }>(`/api/discoveries/${id}/revisit`, { body: { focus: focus || undefined } });
              router.push(`/sessions/${r.sessionId}`);
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err));
              setBusy(false);
            }
          }}
        >
          <input className="field flex-1" placeholder="Optional new focus" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={1000} />
          <button className="btn btn-primary" disabled={busy}>
            Revisit with the council
          </button>
        </form>
      </section>
    </div>
  );
}

function FollowUpItem({ f, busy, onStatus }: { f: FollowUp; busy: boolean; onStatus: (s: FollowUp["status"]) => void }) {
  return (
    <li className="rounded-lg border border-line p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="chip text-muted">{f.kind === "process_change" ? `change to the council · ${f.target}` : "investigate"}</span>
        {f.policy?.sensitive && <span className="chip border-warn/60 text-warn">sensitive area</span>}
        <span className="chip">{f.status}</span>
      </div>
      <p className="mt-1">{f.text}</p>
      {f.why && <p className="text-xs text-muted">Why: {f.why}</p>}
      {f.policy && <p className="mt-1 text-xs text-faint">Never applied automatically. Requires: {f.policy.requires.join("; ")}.</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {f.status !== "approved" && (
          <button className="btn btn-sm" disabled={busy} onClick={() => onStatus("approved")}>
            Approve
          </button>
        )}
        {f.status !== "rejected" && (
          <button className="btn btn-sm" disabled={busy} onClick={() => onStatus("rejected")}>
            Reject
          </button>
        )}
        {f.status === "approved" && (
          <button className="btn btn-sm" disabled={busy} onClick={() => onStatus("done")}>
            Mark done
          </button>
        )}
      </div>
    </li>
  );
}
