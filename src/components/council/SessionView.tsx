"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration, formatTokens, formatUsd } from "@/lib/client/api";
import { phaseLabel, reduceAll } from "@/lib/council/reducer";
import type { StoredEvent } from "@/lib/council/types";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "./Avatar";
import { Chamber, type SeatMember, type Speech } from "./Chamber";
import { excerptOf, MessageDetails } from "./content";
import { FinalAnswerPanel } from "./FinalAnswer";
import { KIND_LABEL, PROVIDER_LABEL, ROLE_META, STATE_META } from "./meta";
import { Transcript } from "./Transcript";

interface SessionRecord {
  id: string;
  question: string;
  status: string;
  live: boolean;
  origin: string;
  simulated: boolean;
}

type DialogKind = null | "challenge" | "direct" | "override";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null); // null = follow live
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [directTarget, setDirectTarget] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set<number>());

  // Initial load, then a resumable SSE stream (kept open: finished sessions can be continued).
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    api<{ session: SessionRecord; events: StoredEvent[] }>(`/api/sessions/${sessionId}`)
      .then(({ session, events }) => {
        if (cancelled) return;
        setSession(session);
        events.forEach((e) => seen.current.add(e.seq));
        setEvents(events);
        const after = events.at(-1)?.seq ?? 0;
        es = new EventSource(`/api/sessions/${sessionId}/stream?after=${after}`);
        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.addEventListener("council", (msg) => {
          const e = JSON.parse((msg as MessageEvent).data) as StoredEvent;
          if (seen.current.has(e.seq)) return;
          seen.current.add(e.seq);
          setEvents((prev) => (prev.length && prev[prev.length - 1].seq > e.seq ? [...prev, e].sort((a, b) => a.seq - b.seq) : [...prev, e]));
        });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [sessionId]);

  const full = useMemo(() => reduceAll(events), [events]);
  const view = useMemo(() => (cursor === null ? full : reduceAll(events, cursor)), [events, cursor, full]);
  const running = full.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Replay playback using the recorded spacing between events (compressed by `speed`).
  useEffect(() => {
    if (!playing || cursor === null) return;
    const idx = events.findIndex((e) => e.seq > cursor);
    const prev = events[idx - 1];
    const gap = idx > 0 && prev ? new Date(events[idx].at).getTime() - new Date(prev.at).getTime() : 0;
    const t = setTimeout(() => (idx < 0 ? setPlaying(false) : setCursor(events[idx].seq)), idx < 0 ? 0 : Math.min(1200, Math.max(60, gap / speed)));
    return () => clearTimeout(t);
  }, [playing, cursor, events, speed]);

  const members: SeatMember[] = useMemo(
    () =>
      view.roster.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        color: m.color,
        monogram: m.monogram,
        providerKind: m.providerKind,
        providerLabel: m.providerLabel,
        model: m.model,
        simulated: m.simulated,
        sharesModelWith: m.sharesModelWith,
        enabled: m.enabled,
      })),
    [view.roster],
  );
  const nameOf = useCallback((id: string) => (id === "prime" ? "the Prime" : (view.roster.find((m) => m.id === id)?.name ?? id)), [view.roster]);

  const speech: Speech | null = useMemo(() => {
    if (!view.speaking) return null;
    const m = view.messages.find((x) => x.messageId === view.speaking!.messageId);
    if (!m) return null;
    return { memberId: m.memberId, kindLabel: KIND_LABEL[m.kind], excerpt: excerptOf(m, nameOf), simulated: m.simulated };
  }, [view.speaking, view.messages, nameOf]);

  const act = async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ note?: string }>(`/api/sessions/${sessionId}/actions`, { body });
      setNotice(r.note ?? okMsg ?? null);
      setCursor(null);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="panel p-6">
        <p className="text-danger">Could not load session: {error}</p>
        <Link href="/" className="btn mt-3">
          Back to the chamber
        </Link>
      </div>
    );
  }
  if (!session) return <div className="panel p-6 text-muted">Loading session…</div>;

  const startedAt = view.startedAt ? new Date(view.startedAt).getTime() : null;
  const endedAt = view.endedAt ? new Date(view.endedAt).getTime() : null;
  const elapsed = startedAt ? (endedAt ?? (cursor === null ? now : new Date(events.find((e) => e.seq === cursor)?.at ?? now).getTime())) - startedAt : 0;
  const excluded = new Set(full.excluded);
  const sel = selected ? members.find((m) => m.id === selected) : null;
  const firstSeq = events[0]?.seq ?? 0;
  const lastSeq = events.at(-1)?.seq ?? 0;
  const maxRounds = full.limits?.hardMaxRounds ?? 3;

  return (
    <div className="space-y-4">
      {/* Question + status */}
      <section className="panel flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-prime">The Prime asks</p>
          <h1 className="mt-1 font-display text-lg font-bold leading-snug sm:text-xl">{full.question || session.question}</h1>
        </div>
        <StatusBadge status={full.status} />
      </section>

      {/* Stats */}
      <section aria-label="Session statistics" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Elapsed" value={formatDuration(elapsed)} />
        <Stat label="Phase" value={`${phaseLabel(view.phase)}${view.round ? ` · round ${view.round}` : ""}`} hint={`round cap ${maxRounds}`} />
        <Stat label="Tokens in / out" value={`${formatTokens(view.usage.inputTokens)} / ${formatTokens(view.usage.outputTokens)}`} />
        <Stat
          label="Estimated cost"
          value={`≈ ${formatUsd(view.usage.costUsd)}`}
          hint={view.usage.unpricedCalls ? `+${view.usage.unpricedCalls} unpriced call(s)` : full.simulated ? "demo calls are free" : "estimate from configured pricing"}
        />
        <Stat label="Messages" value={String(view.messages.length)} />
        <Stat label="Stream" value={connected ? "Connected" : "Reconnecting…"} tone={connected ? "ok" : "warn"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <Chamber
            members={members}
            states={view.memberStates}
            links={view.links}
            speakingId={view.speaking?.memberId ?? null}
            speech={speech}
            phaseLabel={view.status === "running" || cursor !== null ? phaseLabel(view.phase) : view.status === "idle" ? "Waiting" : `Session ${view.status}`}
            round={view.round}
            phase={view.phase}
            running={view.status === "running"}
            simulated={full.simulated}
            excluded={excluded}
            onSelect={setSelected}
            selectedId={selected}
          />

          {/* Prime controls */}
          <section className="panel p-3" aria-label="Prime controls">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-sm font-bold text-prime">♛ Prime controls</span>
              <button className="btn btn-danger btn-sm" disabled={!running || busy} onClick={() => act({ type: "stop" }, "Stopping…")}>
                ■ Stop
              </button>
              <button className="btn btn-sm" disabled={busy || full.round >= maxRounds} onClick={() => act({ type: "another_round" })} title={full.round >= maxRounds ? `Round cap (${maxRounds}) reached` : "Run one more critique round"}>
                ↻ Another round
              </button>
              <button className="btn btn-sm" disabled={busy || full.round >= maxRounds} onClick={() => (setText(""), setDialog("challenge"))}>
                ⚡ Challenge a claim
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => (setText(""), setDirectTarget(selected ?? members[0]?.id ?? ""), setDialog("direct"))}>
                ✉ Address a member
              </button>
              <button className="btn btn-sm btn-prime" disabled={busy || running} onClick={() => (setText(""), setDialog("override"))}>
                ♛ Override
              </button>
            </div>
            {notice && (
              <p className="mt-2 text-xs text-muted" role="status">
                {notice}
              </p>
            )}
          </section>

          {/* Timeline */}
          {events.length > 0 && (
            <section className="panel p-3" aria-label="Replay timeline">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold">Timeline</span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    if (cursor === null || cursor >= lastSeq) setCursor(firstSeq);
                    setPlaying((p) => !p);
                  }}
                  aria-pressed={playing}
                >
                  {playing ? "❚❚ Pause" : "▶ Replay"}
                </button>
                <label className="flex items-center gap-1 text-xs text-muted">
                  Speed
                  <select className="field !w-auto !py-0.5 !text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {[1, 2, 4, 8, 16].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-sm" disabled={cursor === null} onClick={() => (setCursor(null), setPlaying(false))}>
                  {running ? "● Live" : "⇥ Latest"}
                </button>
                <span className="ml-auto text-xs text-faint">
                  {cursor === null ? `Event ${lastSeq} of ${lastSeq}` : `Event ${cursor} of ${lastSeq} (replay)`}
                </span>
              </div>
              <input
                type="range"
                className="mt-2 w-full accent-[#ffd36e]"
                min={firstSeq}
                max={lastSeq}
                value={cursor ?? lastSeq}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPlaying(false);
                  setCursor(v >= lastSeq ? null : v);
                }}
                aria-label="Replay position"
              />
            </section>
          )}

          <FinalAnswerPanel
            final={view.final}
            initial={view.initialAnswer}
            override={view.override}
            synthesizerName={view.synthesizerId ? nameOf(view.synthesizerId) : null}
            simulated={full.simulated}
            status={view.status}
            onOverride={running ? undefined : () => (setText(""), setDialog("override"))}
            onRemember={
              running || full.simulated
                ? undefined
                : async (kind) => {
                    const content =
                      kind === "interest" ? full.question : `Q: ${full.question.slice(0, 200)} — ${full.override ? `Prime decided: ${full.override.decision}` : `Council answered: ${full.final?.answer ?? ""}`}`;
                    try {
                      await api("/api/memory", { body: { kind, content: content.slice(0, 1000), source: "session", sourceRef: sessionId } });
                      setNotice(kind === "interest" ? "Saved as an interest (see Memory)" : "Saved to memory (see Memory)");
                    } catch (e) {
                      setNotice(e instanceof Error ? e.message : String(e));
                    }
                  }
            }
          />
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Transcript messages={view.messages} notes={view.notes} members={members} speakingMessageId={view.speaking?.messageId ?? null} onSelectMember={setSelected} live={running && cursor === null} />
        </div>
      </div>

      {/* Member drawer */}
      <Dialog open={Boolean(sel)} onClose={() => setSelected(null)} title={sel ? `${sel.name} — ${ROLE_META[sel.role].title}` : ""} wide>
        {sel && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Avatar id={sel.id} monogram={sel.monogram} color={sel.color} size={56} />
              <div>
                <p>
                  {sel.simulated ? (
                    <span className="chip sim-badge">Demo provider — simulated</span>
                  ) : (
                    <>
                      <b>{PROVIDER_LABEL[sel.providerKind] ?? sel.providerKind}</b> · <code className="text-xs">{sel.model}</code>
                    </>
                  )}
                </p>
                <p className="mt-1 text-muted">
                  State: {STATE_META[view.memberStates[sel.id]?.state ?? "idle"].label}
                  {view.memberStates[sel.id]?.detail ? ` — ${view.memberStates[sel.id]?.detail}` : ""}
                </p>
                {sel.sharesModelWith.length > 0 && <p className="text-xs text-warn">Uses the same model as {sel.sharesModelWith.map(nameOf).join(", ")} — their agreement is weaker evidence.</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => (setDirectTarget(sel.id), setText(""), setSelected(null), setDialog("direct"))}>
                ✉ Address directly
              </button>
              {excluded.has(sel.id) ? (
                <button className="btn btn-sm" disabled={busy} onClick={() => act({ type: "include", memberId: sel.id })}>
                  Re-include
                </button>
              ) : (
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act({ type: "exclude", memberId: sel.id }, `${sel.name} excluded`)}>
                  Exclude from deliberation
                </button>
              )}
            </div>
            <h3 className="pt-2 font-display font-bold">Published contributions this session</h3>
            <div className="scroll-thin max-h-[50vh] space-y-2 overflow-y-auto">
              {view.messages.filter((m) => m.memberId === sel.id).length === 0 && <p className="text-faint">Nothing published yet.</p>}
              {view.messages
                .filter((m) => m.memberId === sel.id)
                .map((m) => (
                  <details key={m.messageId} className="rounded-lg border border-line p-2" open>
                    <summary className="cursor-pointer text-xs font-semibold text-muted">
                      {KIND_LABEL[m.kind]}
                      {m.round ? ` · R${m.round}` : ""}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap">{excerptOf(m, nameOf)}</p>
                    <div className="mt-2 rounded bg-black/20 p-2 text-[13px]">
                      <MessageDetails m={m} nameOf={nameOf} />
                    </div>
                  </details>
                ))}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={dialog === "challenge"} onClose={() => setDialog(null)} title="Ask the council to challenge a claim">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ type: "challenge", claim: text })) setDialog(null);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted">Members will run a focused critique round on this claim (counts toward the {maxRounds}-round cap), then the answer is re-synthesized.</p>
          <textarea className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. “Congestion pricing would work in a town of 20,000 people.”" required minLength={3} maxLength={1000} autoFocus />
          <button className="btn btn-primary" disabled={busy || text.trim().length < 3}>
            Challenge
          </button>
        </form>
      </Dialog>

      <Dialog open={dialog === "direct"} onClose={() => setDialog(null)} title="Address a member directly">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ type: "direct", memberId: directTarget, message: text }, "Message sent — the reply will appear in the transcript.")) setDialog(null);
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            Member
            <select className="field mt-1" value={directTarget} onChange={(e) => setDirectTarget(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {ROLE_META[m.role].title}
                </option>
              ))}
            </select>
          </label>
          <textarea className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your message" required maxLength={2000} autoFocus />
          <button className="btn btn-primary" disabled={busy || !text.trim() || !directTarget}>
            Send
          </button>
        </form>
      </Dialog>

      <Dialog open={dialog === "override"} onClose={() => setDialog(null)} title="Override the council's decision">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ type: "override", decision: text }, "Override recorded")) setDialog(null);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted">Your decision is recorded as final. The council&apos;s answer is kept alongside it for reference.</p>
          <textarea className="field min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="The Prime's decision" required maxLength={8000} autoFocus />
          <button className="btn btn-prime" disabled={busy || !text.trim()}>
            Record decision
          </button>
        </form>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="panel px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className={`mt-0.5 truncate font-display text-sm font-bold ${tone === "ok" ? "text-support" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      {hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "border-refine/60 text-refine",
    completed: "border-support/60 text-support",
    stopped: "border-warn/60 text-warn",
    failed: "border-danger/60 text-danger",
    idle: "text-muted",
  };
  const glyph: Record<string, string> = { running: "●", completed: "✓", stopped: "■", failed: "×", idle: "·" };
  return (
    <span className={`chip ${map[status] ?? "text-muted"}`}>
      <span aria-hidden="true">{glyph[status] ?? "·"}</span> {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
