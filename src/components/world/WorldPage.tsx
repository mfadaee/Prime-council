"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { RESOURCES, dayOf, shiftOf, type Project, type WorldConfig, type WorldState } from "@/lib/sim/types";
import { Dialog } from "@/components/ui/Dialog";
import { ACTION_META, WorldMap } from "./WorldMap";

interface WorldEventRow {
  id: number;
  tick: number;
  type: string;
  text: string;
  data: Record<string, unknown>;
  branch: number;
}
interface WorldResponse {
  world: { id: string; status: "running" | "paused"; speedMs: number; tick: number; seed: number; firstTick: number };
  globalPause: boolean;
  state: WorldState;
  events: WorldEventRow[];
  snapshots: { id: string; tick: number; label: string; createdAt: string }[];
  recommendations: Record<string, { recommendation: "approve" | "reject" | null; sessionId: string; simulated: boolean } | null>;
}

const cr = (cents: number) => (cents / 100).toFixed(2);
const EVENT_TONE: Record<string, string> = {
  "project.proposed": "text-refine",
  "project.council_needed": "text-prime",
  "project.approved": "text-support",
  "project.funded": "text-support",
  "project.completed": "text-support",
  "project.rejected": "text-danger",
  "council.decision": "text-prime",
  "council.requested": "text-prime",
  "council.recommendation": "text-prime",
  "inhabitant.arrived": "text-reply",
  "organization.founded": "text-reply",
  hunger: "text-danger",
  "world.restored": "text-warn",
  "world.config": "text-warn",
};
const STATUS_CHIP: Record<Project["status"], string> = {
  proposed: "text-refine border-refine/60",
  awaiting_council: "text-prime border-prime/60",
  approved: "text-support border-support/60",
  active: "text-support border-support/60",
  done: "text-muted",
  rejected: "text-danger border-danger/60",
};

export function WorldPage() {
  const [data, setData] = useState<WorldResponse | null>(null);
  const [replay, setReplay] = useState<{ tick: number; state: WorldState; events: WorldEventRow[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const refresh = useCallback(() => api<WorldResponse>("/api/world").then(setData), []);
  useEffect(() => {
    refresh().catch((e) => setMsg(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!data || data.world.status !== "running" || replay) return;
    const t = setInterval(() => refresh().catch(() => {}), Math.max(700, data.world.speedMs));
    return () => clearInterval(t);
  }, [data, replay, refresh]);

  const act = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ sessionId?: string }>("/api/world", { body });
      if (ok) setMsg(ok);
      await refresh();
      return r;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadTick = async (tick: number) => {
    if (!data) return;
    if (tick >= data.world.tick) return setReplay(null);
    try {
      const r = await api<{ state: WorldState; events: WorldEventRow[] }>(`/api/world/ticks/${tick}`);
      setReplay({ tick, ...r });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const view = replay?.state ?? data?.state;
  const events = replay?.events ?? data?.events ?? [];
  const names = useMemo(() => new Map((view?.inhabitants ?? []).map((i) => [i.id, i])), [view]);
  if (!data || !view) return <div className="panel p-6 text-muted">{msg ?? "Loading the world…"}</div>;

  const running = data.world.status === "running";
  const sel = selected ? view.inhabitants.find((i) => i.id === selected) : null;
  const docket = view.projects.filter((p) => p.status === "awaiting_council");
  const otherProjects = view.projects.filter((p) => p.status !== "awaiting_council").slice().reverse();
  const housing = view.locations.filter((l) => l.kind === "home").reduce((n, h) => n + (h.capacity ?? 2), 0);

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {view.name}{" "}
            <span className="text-base font-medium text-muted">
              · {view.tick === 0 ? "Founding day" : `Day ${dayOf(view.tick - 1)}, ${shiftOf(view.tick - 1).toLowerCase()}`}
            </span>
          </h1>
          <p className="text-xs text-muted">
            A deterministic simulation with a fictional economy. Its inhabitants are agents created by the Primes — simulations, not people. You speak only with the Primes; agents act in the world. Population {view.inhabitants.length}/{view.config.maxPopulation} · housing {housing} · seed {data.world.seed}
            {view.branch ? ` · branch ${view.branch}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="chip sim-badge">Simulation</span>
          {replay ? <span className="chip border-warn/60 text-warn">Replaying tick {replay.tick}</span> : running ? <span className="chip border-support/60 text-support">● Running</span> : <span className="chip text-muted">❚❚ Paused</span>}
          {data.globalPause && running && <span className="chip border-warn/60 text-warn">Held by global pause</span>}
        </div>
      </section>

      <section className="panel flex flex-wrap items-center gap-2 p-3" aria-label="Simulation controls">
        {running ? (
          <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "pause" })}>
            ❚❚ Pause
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={busy || Boolean(replay)} onClick={() => act({ action: "play" })}>
            ▶ Run
          </button>
        )}
        <button className="btn btn-sm" disabled={busy || running || Boolean(replay)} onClick={() => act({ action: "step", steps: 1 })}>
          Step
        </button>
        <button className="btn btn-sm" disabled={busy || running || Boolean(replay)} onClick={() => act({ action: "step", steps: 9 })} title="Advance three days">
          +3 days
        </button>
        <label className="flex items-center gap-1 text-xs text-muted">
          Speed
          <select className="field !w-auto !py-1 !text-xs" value={data.world.speedMs} onChange={(e) => act({ action: "speed", speedMs: Number(e.target.value) })}>
            {[
              [4000, "slow"],
              [1500, "normal"],
              [700, "fast"],
              [300, "very fast"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l} ({Number(v) / 1000}s/shift)
              </option>
            ))}
          </select>
        </label>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button
          className="btn btn-sm"
          disabled={busy || Boolean(replay)}
          onClick={() => {
            const label = prompt("Snapshot label", `Day ${dayOf(view.tick)} ${shiftOf(view.tick).toLowerCase()}`);
            if (label) act({ action: "snapshot", label }, "Snapshot saved");
          }}
        >
          ◫ Snapshot
        </button>
        {data.snapshots.length > 0 && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <span className="sr-only">Restore snapshot</span>
            <select
              className="field !w-auto !py-1 !text-xs"
              value=""
              onChange={(e) => e.target.value && confirm("Restore this snapshot? The world pauses and continues on a new branch.") && act({ action: "restore", snapshotId: e.target.value }, "Snapshot restored")}
            >
              <option value="">Restore snapshot…</option>
              {data.snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} (tick {s.tick})
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn btn-sm" onClick={() => setConfigOpen(true)}>
          ⚙ Rules & limits
        </button>
        {msg && (
          <p className="w-full text-xs text-warn" role="status">
            {msg}
          </p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <div className="panel overflow-hidden p-2">
            <div className="aspect-[100/64] w-full">
              <WorldMap state={view} selected={selected} onSelect={setSelected} />
            </div>
          </div>

          <section className="panel p-3" aria-label="Replay timeline">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-display text-sm font-bold">Replay</span>
              <span className="text-faint">
                ticks {data.world.firstTick}–{data.world.tick}
              </span>
              {replay && (
                <button className="btn btn-sm ml-auto" onClick={() => setReplay(null)}>
                  ⇥ Back to live
                </button>
              )}
            </div>
            <input
              type="range"
              className="mt-2 w-full accent-[#ffd36e]"
              aria-label="World replay position"
              min={data.world.firstTick}
              max={data.world.tick}
              value={replay?.tick ?? data.world.tick}
              onChange={(e) => loadTick(Number(e.target.value))}
            />
          </section>

          <section className="panel p-4" aria-labelledby="inh-title">
            <h2 id="inh-title" className="font-display text-lg font-bold">
              Who is doing what
            </h2>
            {view.inhabitants.length > 60 && <p className="text-xs text-muted">Showing 60 of {view.inhabitants.length} agents.</p>}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {view.inhabitants.slice(0, 60).map((i) => (
                <li key={i.id}>
                  <button
                    className={`w-full rounded-xl border p-2.5 text-left transition hover:bg-white/5 ${selected === i.id ? "border-prime" : "border-line"}`}
                    onClick={() => setSelected(i.id)}
                    aria-pressed={selected === i.id}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-bg" style={{ background: i.color }} aria-hidden="true">
                        {i.name[0]}
                      </span>
                      <span className="font-semibold">{i.name}</span>
                      <span className="text-xs capitalize text-muted">{i.role}</span>
                      <span className="text-[10px] text-faint">by {view.primes?.find((p) => p.id === i.createdBy)?.name ?? "council"}</span>
                      <span className="ml-auto text-xs text-faint">{cr(i.cents)} cr</span>
                    </div>
                    <p className="mt-1 text-xs">
                      <span className={i.action.kind === "hungry" ? "text-danger" : "text-muted"}>{ACTION_META[i.action.kind].label}:</span> {i.action.detail}
                    </p>
                    <div className="mt-1.5 flex gap-2 text-[10px] text-faint">
                      <Meter label="Energy" value={i.energy} color="#5cc8ff" />
                      <Meter label="Hunger" value={i.hunger} color="#ff8a5b" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-4" aria-labelledby="docket-title">
            <h2 id="docket-title" className="font-display text-lg font-bold text-prime">
              ♛ Decisions for the Primes
            </h2>
            <p className="mt-1 text-xs text-muted">Projects above {view.config.councilThresholdCredits} credits need a decision. Ask the Primes (or let them decide under Prime governance in Settings), or decide yourself.</p>
            {docket.length === 0 && <p className="mt-2 text-sm text-faint">Nothing awaits a decision.</p>}
            <ul className="mt-2 space-y-2">
              {docket.map((p) => {
                const rec = data.recommendations[p.id];
                return (
                  <li key={p.id} className="rounded-xl border border-prime/40 bg-prime/5 p-3 text-sm">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted">
                      Proposed by {names.get(p.proposerId)?.name ?? "?"} · {cr(p.costCents)} credits
                      {Object.entries(p.materials).length ? ` + ${Object.entries(p.materials).map(([r, n]) => `${n} ${r}`).join(", ")}` : ""}
                    </p>
                    <p className="mt-1 text-xs">{p.rationale}</p>
                    {p.sessionId && (
                      <p className="mt-1.5 text-xs">
                        <Link className="text-prime underline" href={`/sessions/${p.sessionId}`}>
                          Council session
                        </Link>
                        {rec === null || rec === undefined
                          ? " — deliberating or no recommendation yet"
                          : rec.recommendation
                            ? ` — recommends ${rec.recommendation.toUpperCase()}${rec.simulated ? " (simulated)" : ""}`
                            : ` — no clear recommendation${rec.simulated ? " (simulated demo session)" : ""}`}
                      </p>
                    )}
                    {!replay && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button className="btn btn-sm btn-prime" disabled={busy} onClick={async () => {
                          const r = await act({ action: "ask_council", projectId: p.id }, "The council is deliberating — follow the session or wait for its recommendation here.");
                          if (r?.sessionId) setMsg(`Council session started: /sessions/${r.sessionId}`);
                        }}>
                          Ask the Primes
                        </button>
                        {rec?.recommendation && (
                          <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "apply_recommendation", projectId: p.id }, "Council recommendation applied")}>
                            Apply recommendation
                          </button>
                        )}
                        <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "decide", projectId: p.id, decision: "approve" }, `${p.name} approved`)}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act({ action: "decide", projectId: p.id, decision: "reject" }, `${p.name} rejected`)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel p-4" aria-labelledby="treasury-title">
            <h2 id="treasury-title" className="font-display text-lg font-bold">
              Treasury & market
            </h2>
            <p className="mt-1 text-sm">
              <b>{cr(view.treasury.cents)}</b> <span className="text-muted">fictional credits</span>
            </p>
            <table className="mt-2 w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="text-left font-semibold">Resource</th>
                  <th className="text-right font-semibold">Stores</th>
                  <th className="text-right font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((r) => (
                  <tr key={r}>
                    <td className="capitalize">{r}</td>
                    <td className="text-right">{view.treasury.stock[r]}</td>
                    <td className="text-right text-muted">{r === "knowledge" ? "—" : cr(view.prices[r])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-faint">
              Last market day: {view.stats.tradesToday} trades, {cr(view.stats.turnoverCents)} turnover, {view.stats.mealsMissed} missed meals.
            </p>
            {view.organizations.length > 0 && (
              <p className="mt-2 text-xs text-muted">Organisations: {view.organizations.map((o) => `${o.name} (${o.memberIds.length})`).join(", ")}</p>
            )}
            {view.built.length > 0 && <p className="mt-1 text-xs text-muted">Built: {view.built.join(", ").replace(/_/g, " ")}</p>}
          </section>

          <section className="panel p-4" aria-labelledby="proj-title">
            <h2 id="proj-title" className="font-display text-lg font-bold">
              Projects
            </h2>
            {otherProjects.length === 0 && <p className="mt-2 text-sm text-faint">No projects yet. Inhabitants propose them every second day when there is a need.</p>}
            <ul className="mt-2 space-y-2">
              {otherProjects.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className={`chip ml-auto ${STATUS_CHIP[p.status]}`}>{p.status.replace("_", " ")}</span>
                  </div>
                  {(p.status === "active" || p.status === "done") && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round((p.progress / p.workRequired) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
                      <div className="h-full rounded-full bg-support" style={{ width: `${(p.progress / p.workRequired) * 100}%` }} />
                    </div>
                  )}
                  <p className="text-[11px] text-faint">
                    {names.get(p.proposerId)?.name ?? "?"} · {cr(p.costCents)} cr{p.decidedBy ? ` · decided by ${p.decidedBy}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-4" aria-labelledby="ev-title">
            <h2 id="ev-title" className="font-display text-lg font-bold">
              Event log
            </h2>
            <ol className="scroll-thin mt-2 max-h-[420px] space-y-1.5 overflow-y-auto text-xs" aria-live={running && !replay ? "polite" : "off"}>
              {events
                .filter((e) => e.type !== "tick.summary")
                .map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="shrink-0 text-faint">
                      D{dayOf(e.tick)}
                      {e.branch ? `·b${e.branch}` : ""}
                    </span>
                    <span className={EVENT_TONE[e.type] ?? "text-muted"}>{e.text}</span>
                  </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>

      <Dialog open={Boolean(sel)} onClose={() => setSelected(null)} title={sel ? `${sel.name} — ${sel.role}` : ""}>
        {sel && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              An agent created by {view.primes?.find((p) => p.id === sel.createdBy)?.name ?? "the council"}. Its behaviour follows deterministic rules, not a mind; you interact with the Primes, not with agents.
            </p>
            <p>
              <b>Goal:</b> {sel.goal}
            </p>
            <p>
              <b>Now:</b> {ACTION_META[sel.action.kind].label} — {sel.action.detail}
            </p>
            <p>
              <b>Skill:</b> {Math.round(sel.skill * 100)}% · <b>Credits:</b> {cr(sel.cents)} · <b>Home:</b> {view.locations.find((l) => l.id === sel.homeId)?.name}
            </p>
            <p>
              <b>Inventory:</b> {RESOURCES.filter((r) => sel.inventory[r]).map((r) => `${sel.inventory[r]} ${r}`).join(", ") || "empty"}
            </p>
            <div className="flex gap-3">
              <Meter label="Energy" value={sel.energy} color="#5cc8ff" />
              <Meter label="Hunger" value={sel.hunger} color="#ff8a5b" />
            </div>
            <div>
              <b>Relationships</b>
              <ul className="mt-1 space-y-1">
                {Object.entries(sel.relationships)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, v]) => (
                    <li key={id} className="flex items-center gap-2 text-xs">
                      <span className="w-16">{names.get(id)?.name ?? id}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-reply" style={{ width: `${Math.max(0, v) * 100}%` }} />
                      </span>
                      <span className="w-8 text-right text-faint">{v.toFixed(2)}</span>
                    </li>
                  ))}
                {Object.keys(sel.relationships).length === 0 && <li className="text-xs text-faint">None yet.</li>}
              </ul>
            </div>
            <p className="text-xs text-faint">Joined on day {dayOf(sel.joinedTick)}.</p>
          </div>
        )}
      </Dialog>

      <ConfigDialog key={`${JSON.stringify(view.config)}:${data.world.seed}`} open={configOpen} onClose={() => setConfigOpen(false)} config={view.config} seed={data.world.seed} onSave={(c) => act({ action: "config", config: c }, "World rules updated")} onReset={(seed, c) => act({ action: "reset", seed, config: c }, "A new world was founded")} />
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex flex-1 items-center gap-1" title={`${label} ${Math.round(value)}/100`}>
      <span className="w-10 text-[10px] text-faint">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </span>
    </span>
  );
}

function ConfigDialog({
  open,
  onClose,
  config,
  seed,
  onSave,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  config: WorldConfig;
  seed: number;
  onSave: (c: WorldConfig) => void;
  onReset: (seed: number, c: WorldConfig) => void;
}) {
  const [c, setC] = useState(config);
  const [s, setS] = useState(seed);
  return (
    <Dialog open={open} onClose={onClose} title="World rules & limits">
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(c);
          onClose();
        }}
      >
        <label className="block">
          Maximum population
          <input type="number" className="field mt-1" min={1} max={40} value={c.maxPopulation} onChange={(e) => setC({ ...c, maxPopulation: Number(e.target.value) })} />
        </label>
        <label className="block">
          Maximum organisations
          <input type="number" className="field mt-1" min={0} max={10} value={c.maxOrganizations} onChange={(e) => setC({ ...c, maxOrganizations: Number(e.target.value) })} />
        </label>
        <label className="block">
          Council threshold (credits)
          <input type="number" className="field mt-1" min={0} max={1000} value={c.councilThresholdCredits} onChange={(e) => setC({ ...c, councilThresholdCredits: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={c.growthEnabled} onChange={(e) => setC({ ...c, growthEnabled: e.target.checked })} /> Population growth
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={c.councilAutoApply} onChange={(e) => setC({ ...c, councilAutoApply: e.target.checked })} />
          <span>
            Apply unambiguous council recommendations automatically <span className="block text-xs text-muted">Off by default: you confirm each decision. Never applies simulated (demo) recommendations.</span>
          </span>
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm">Save rules</button>
        </div>
        <hr className="border-line" />
        <label className="block">
          Seed for a new world
          <input type="number" className="field mt-1" min={0} value={s} onChange={(e) => setS(Number(e.target.value))} />
        </label>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => confirm("Found a new world? The current world's per-tick history is cleared (its event log and snapshots are kept).") && (onReset(s, c), onClose())}>
          Found a new world
        </button>
      </form>
    </Dialog>
  );
}
