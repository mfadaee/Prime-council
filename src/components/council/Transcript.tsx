"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChamberMessage, SystemNote } from "@/lib/council/reducer";
import { formatTokens, formatUsd } from "@/lib/client/api";
import { Avatar } from "./Avatar";
import type { SeatMember } from "./Chamber";
import { excerptOf, MessageDetails } from "./content";
import { KIND_LABEL, ROLE_META } from "./meta";

type Entry = { kind: "msg"; m: ChamberMessage } | { kind: "note"; n: SystemNote };

const NOTE_STYLE: Record<SystemNote["tone"], string> = {
  info: "text-muted",
  warn: "text-warn",
  error: "text-danger",
  prime: "text-prime",
};
const NOTE_GLYPH: Record<SystemNote["tone"], string> = { info: "—", warn: "■", error: "×", prime: "♛" };

export function Transcript({
  messages,
  notes,
  members,
  speakingMessageId,
  onSelectMember,
  live,
}: {
  messages: ChamberMessage[];
  notes: SystemNote[];
  members: SeatMember[];
  speakingMessageId: string | null;
  onSelectMember?: (id: string) => void;
  live: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameOf = (id: string) => (id === "prime" ? "the Founder" : (byId.get(id)?.name ?? id));

  const entries: Entry[] = useMemo(() => {
    const e: Entry[] = [
      ...messages.filter((m) => filter === "all" || m.memberId === filter).map((m) => ({ kind: "msg" as const, m })),
      ...(filter === "all" ? notes.map((n) => ({ kind: "note" as const, n })) : []),
    ];
    return e.sort((a, b) => (a.kind === "msg" ? a.m.seq : a.n.seq) - (b.kind === "msg" ? b.m.seq : b.n.seq));
  }, [messages, notes, filter]);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <section className="panel flex h-full min-h-[420px] flex-col" aria-labelledby="transcript-title">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 id="transcript-title" className="font-display text-base font-bold">
          Transcript
        </h2>
        {live && (
          <span className="chip border-support/50 text-support">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-support" aria-hidden="true" /> Live
          </span>
        )}
        <label className="ml-auto text-xs text-muted">
          <span className="sr-only">Filter by member</span>
          <select className="field !w-auto !py-1 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scroll-thin flex-1 space-y-2.5 overflow-y-auto px-3 py-3 lg:max-h-[calc(100dvh-220px)]"
        role="log"
        aria-live={live ? "polite" : "off"}
        aria-relevant="additions"
      >
        {entries.length === 0 && <p className="p-6 text-center text-sm text-faint">No activity yet.</p>}
        {entries.map((e) =>
          e.kind === "note" ? (
            <p key={`n${e.n.seq}`} className={`flex gap-2 px-1 text-xs ${NOTE_STYLE[e.n.tone]}`}>
              <span aria-hidden="true">{NOTE_GLYPH[e.n.tone]}</span>
              <span>{e.n.text}</span>
            </p>
          ) : (
            <MessageCard key={e.m.messageId} m={e.m} member={byId.get(e.m.memberId)} active={e.m.messageId === speakingMessageId} nameOf={nameOf} onSelect={onSelectMember} />
          ),
        )}
      </div>
    </section>
  );
}

function MessageCard({
  m,
  member,
  active,
  nameOf,
  onSelect,
}: {
  m: ChamberMessage;
  member?: SeatMember;
  active: boolean;
  nameOf: (id: string) => string;
  onSelect?: (id: string) => void;
}) {
  const color = member?.color ?? "#8a92c4";
  return (
    <article
      className="rounded-xl border bg-white/[0.03] p-3 transition"
      style={{ borderColor: active ? `${color}aa` : "var(--border)", boxShadow: active ? `0 0 24px -8px ${color}` : undefined }}
      aria-current={active ? "true" : undefined}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" className="flex items-center gap-2 rounded-lg" onClick={() => onSelect?.(m.memberId)} aria-label={`Show ${member?.name ?? m.memberId}`}>
          {member && <Avatar id={member.id} monogram={member.monogram} color={member.color} size={26} />}
          <span className="font-display text-sm font-bold" style={{ color }}>
            {member?.name ?? m.memberId}
          </span>
        </button>
        {member && <span className="text-xs text-muted">{ROLE_META[member.role].title}</span>}
        <span className="chip text-muted">{KIND_LABEL[m.kind]}</span>
        {m.round > 0 && <span className="text-xs text-faint">R{m.round}</span>}
        {m.replyTo.length > 0 && <span className="text-xs text-faint">→ {m.replyTo.map(nameOf).join(", ")}</span>}
        {m.simulated && <span className="chip sim-badge !text-[10px]">Simulated</span>}
      </header>
      <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed">{excerptOf(m, nameOf)}</p>
      {m.parseWarning && <p className="mt-1 text-xs text-warn">{m.parseWarning}</p>}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted hover:text-ink">Published details</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-black/20 p-3 text-[13px] leading-relaxed">
          <MessageDetails m={m} nameOf={nameOf} />
          <p className="mt-3 text-[11px] text-faint">
            {(m.durationMs / 1000).toFixed(1)}s · {formatTokens(m.usage.inputTokens)} in / {formatTokens(m.usage.outputTokens)} out ({m.usage.source === "provider" ? "provider-reported" : "estimated"}) ·{" "}
            {m.usage.costUsd === null ? "unpriced" : `${formatUsd(m.usage.costUsd)} est.`}
            {member && ` · ${member.simulated ? "demo provider" : `${member.providerLabel} / ${member.model}`}`}
          </p>
        </div>
      </details>
    </article>
  );
}
