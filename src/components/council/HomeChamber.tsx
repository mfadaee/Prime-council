"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatUsd } from "@/lib/client/api";
import type { CouncilRole } from "@/lib/council/types";
import { Chamber, type SeatMember } from "./Chamber";
import { Composer } from "./Composer";
import { StatusBadge } from "./SessionView";

interface MemberRow {
  id: string;
  name: string;
  role: CouncilRole;
  color: string;
  monogram: string;
  model: string;
  enabled: boolean;
  simulated: boolean;
  sharesModelWith: string[];
  provider: { kind: string; label: string; status: string } | null;
}
interface SessionRow {
  id: string;
  question: string;
  status: string;
  simulated: boolean;
  costUsd: number;
  startedAt: string;
}

export function HomeChamber() {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<{ members: MemberRow[] }>("/api/members").then((r) => setMembers(r.members)).catch(() => setMembers([]));
    api<{ sessions: SessionRow[] }>("/api/sessions").then((r) => setSessions(r.sessions.slice(0, 6))).catch(() => {});
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
  const sel = seated.find((m) => m.id === selected);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          {members === null ? (
            <div className="panel grid aspect-[10/7] place-items-center text-muted">Assembling the council…</div>
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
        </div>
        <aside className="space-y-4">
          <section className="panel p-4">
            <h2 className="font-display text-base font-bold">The council</h2>
            {allSim && (
              <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-xs text-[#ffe2a3]">
                Demo mode: every seat uses the simulated demo provider, so sessions show the full process with clearly labelled placeholder output and no model calls. Add a provider key and assign models in{" "}
                <Link className="underline" href="/members">
                  Members
                </Link>{" "}
                to get real answers.
              </p>
            )}
            <ul className="mt-3 space-y-1.5 text-sm">
              {(members ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                  <button className={`font-semibold ${m.enabled ? "" : "text-faint line-through"}`} onClick={() => setSelected(m.id)}>
                    {m.name}
                  </button>
                  <span className="truncate text-xs text-muted">{m.simulated ? "demo (simulated)" : `${m.provider?.label ?? "?"} · ${m.model}`}</span>
                  <span className="ml-auto text-[11px] text-faint">{m.provider?.status?.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
            {sel && (
              <p className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-muted">
                <b className="text-ink">{sel.name}</b> sits as {sel.role}. Provider status: {sel.provider?.status ?? "unknown"}. Configure seats on the{" "}
                <Link className="underline" href="/members">
                  Members
                </Link>{" "}
                page.
              </p>
            )}
          </section>
          <section className="panel p-4">
            <div className="flex items-center">
              <h2 className="font-display text-base font-bold">Recent sessions</h2>
              <Link href="/sessions" className="ml-auto text-xs text-muted underline">
                All sessions
              </Link>
            </div>
            {sessions.length === 0 ? (
              <p className="mt-2 text-sm text-faint">No sessions yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sessions/${s.id}`} className="block rounded-lg border border-line p-2.5 hover:bg-white/5">
                      <p className="line-clamp-2 text-sm">{s.question}</p>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                        <StatusBadge status={s.status} />
                        {s.simulated && <span className="chip sim-badge !text-[10px]">Simulated</span>}
                        <span className="ml-auto">{formatUsd(s.costUsd)} est.</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
