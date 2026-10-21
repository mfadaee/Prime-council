"use client";

import { useEffect, useState } from "react";
import { api, formatUsd } from "@/lib/client/api";
import type { Limits } from "@/lib/council/types";

interface Autonomy {
  suggestionsEnabled: boolean;
  backgroundEnabled: boolean;
  intervalMinutes: number;
  maxSessionsPerDay: number;
  backgroundDailyBudgetUsd: number;
  globalPause: boolean;
  primeGovernance: boolean;
  selfExaminationDays: number;
}
type Price = { inputPerM: number; outputPerM: number };
interface SettingsData {
  limits: Limits;
  bounds: Record<string, [number, number]>;
  autonomy: Autonomy;
  pricing: Record<string, Price>;
  builtinPrices: Record<string, Price>;
  charter: string;
  defaultCharter: string;
}

const LIMIT_FIELDS: { key: keyof Limits; label: string; help: string; scale?: number; unit?: string; step?: number }[] = [
  { key: "maxRounds", label: "Critique rounds", help: "Default critique/resolve rounds. Stops early when nobody raises a material challenge." },
  { key: "hardMaxRounds", label: "Hard round cap", help: "Absolute cap, including rounds you request." },
  { key: "concurrency", label: "Concurrent model calls", help: "Members answering in parallel." },
  { key: "maxOutputTokens", label: "Max output tokens per call", help: "Also used for worst-case spend reservations." },
  { key: "timeoutMs", label: "Call timeout", help: "Per provider call.", scale: 1000, unit: "s" },
  { key: "maxRetries", label: "Retries", help: "Only for transient errors (rate limits, timeouts, 5xx)." },
  { key: "sessionWallClockMs", label: "Session time limit", help: "Deliberation is stopped after this.", scale: 60000, unit: "min", step: 0.5 },
  { key: "sessionBudgetUsd", label: "Per-session budget", help: "Estimated USD.", unit: "$", step: 0.01 },
  { key: "dailyBudgetUsd", label: "Daily budget (UTC day)", help: "Estimated USD across all sessions.", unit: "$", step: 0.01 },
];

const fetchSettings = () =>
  Promise.all([api<SettingsData>("/api/settings"), api<{ spendTodayUsd: number; backgroundSpendTodayUsd: number }>("/api/status")]);

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [autonomy, setAutonomy] = useState<Autonomy | null>(null);
  const [pricing, setPricing] = useState<[string, Price][]>([]);
  const [spend, setSpend] = useState<{ today: number; bg: number } | null>(null);
  const [charter, setCharter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const apply = ([d, s]: [SettingsData, { spendTodayUsd: number; backgroundSpendTodayUsd: number }]) => {
    setData(d);
    setLimits(d.limits);
    setAutonomy(d.autonomy);
    setPricing(Object.entries(d.pricing));
    setCharter(d.charter);
    setSpend({ today: s.spendTodayUsd, bg: s.backgroundSpendTodayUsd });
  };
  const load = () => fetchSettings().then(apply);
  useEffect(() => {
    fetchSettings()
      .then(apply)
      .catch((e) => setMsg(e.message));
  }, []);

  const save = async (body: unknown, ok: string) => {
    setMsg(null);
    try {
      await api("/api/settings", { method: "PUT", body });
      setMsg(ok);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (!data || !limits || !autonomy) return <div className="panel p-6 text-muted">Loading settings…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">Limits are enforced by the server. Costs are estimates from configurable prices; a request already in flight at a provider cannot be recalled, so budgets are not a hard billing cap.</p>
        {msg && (
          <p className="mt-2 text-sm text-warn" role="status">
            {msg}
          </p>
        )}
      </div>

      <section className="panel p-4" aria-labelledby="charter-title">
        <h2 id="charter-title" className="font-display text-lg font-bold text-prime">
          The Primes&apos; charter
        </h2>
        <p className="mt-1 text-xs text-muted">The standing mission every Prime receives as trusted context from you, the Founder. Limits and permissions are still enforced in code, not by this text.</p>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ charter }, "Charter saved — it applies to new sessions");
          }}
        >
          <textarea className="field min-h-40 text-sm leading-relaxed" value={charter} onChange={(e) => setCharter(e.target.value)} maxLength={4000} aria-label="Charter" />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={charter.trim().length < 20}>
              Save charter
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setCharter(data.defaultCharter)}>
              Restore default
            </button>
          </div>
        </form>
      </section>

      <section className="panel p-4" aria-labelledby="limits-title">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="limits-title" className="font-display text-lg font-bold">
            Deliberation & spending limits
          </h2>
          {spend && (
            <span className="text-xs text-muted">
              Estimated spend today: <b className="text-ink">{formatUsd(spend.today)}</b> of {formatUsd(limits.dailyBudgetUsd)} (background {formatUsd(spend.bg)})
            </span>
          )}
        </div>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save({ limits }, "Limits saved");
          }}
        >
          {LIMIT_FIELDS.map((f) => {
            const [lo, hi] = data.bounds[f.key] ?? [0, 1e9];
            const scale = f.scale ?? 1;
            return (
              <label key={f.key} className="text-xs text-muted">
                <span className="font-semibold text-ink">{f.label}</span>
                {f.unit && ` (${f.unit})`}
                <input
                  type="number"
                  className="field mt-1"
                  min={lo / scale}
                  max={hi / scale}
                  step={f.step ?? 1}
                  value={Number(limits[f.key]) / scale}
                  onChange={(e) => setLimits({ ...limits, [f.key]: Math.round(Number(e.target.value) * scale * 100) / 100 })}
                />
                <span className="mt-1 block text-[11px] text-faint">
                  {f.help} Range {lo / scale}–{hi / scale}.
                </span>
              </label>
            );
          })}
          <label className="flex items-start gap-2 text-xs text-muted sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="mt-0.5" checked={limits.allowUnpriced} onChange={(e) => setLimits({ ...limits, allowUnpriced: e.target.checked })} />
            <span>
              <b className="text-ink">Allow remote models without a configured price.</b> Their cost is unknown, so budgets cannot limit them. Off by default.
            </span>
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button className="btn btn-primary">Save limits</button>
          </div>
        </form>
      </section>

      <section className="panel p-4" aria-labelledby="pricing-title">
        <h2 id="pricing-title" className="font-display text-lg font-bold">
          Model pricing (USD per 1M tokens)
        </h2>
        <p className="mt-1 text-xs text-muted">
          Key format <code>kind:model</code> (e.g. <code>openai:my-model</code>) or <code>providerId:model</code>. Local providers and the demo cost $0. Built-in prices are limited to list prices verified when this
          release was written; check your provider&apos;s current pricing.
        </p>
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Built-in prices ({Object.keys(data.builtinPrices).length})</summary>
          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
            {Object.entries(data.builtinPrices).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: ${v.inputPerM} in / ${v.outputPerM} out
              </li>
            ))}
          </ul>
        </details>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ pricing: Object.fromEntries(pricing.filter(([k]) => k.trim())) }, "Pricing saved");
          }}
        >
          {pricing.map(([k, v], i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_auto] items-center gap-2">
              <input className="field font-mono" aria-label="Model key" value={k} onChange={(e) => setPricing(pricing.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))} placeholder="openai:model-id" />
              <input className="field" aria-label="Input price per 1M tokens" type="number" step="0.01" min="0" value={v.inputPerM} onChange={(e) => setPricing(pricing.map((p, j) => (j === i ? [p[0], { ...p[1], inputPerM: Number(e.target.value) }] : p)))} />
              <input className="field" aria-label="Output price per 1M tokens" type="number" step="0.01" min="0" value={v.outputPerM} onChange={(e) => setPricing(pricing.map((p, j) => (j === i ? [p[0], { ...p[1], outputPerM: Number(e.target.value) }] : p)))} />
              <button type="button" className="btn btn-sm" aria-label="Remove price" onClick={() => setPricing(pricing.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setPricing([...pricing, ["", { inputPerM: 0, outputPerM: 0 }]])}>
              + Add price
            </button>
            <button className="btn btn-sm btn-primary">Save pricing</button>
          </div>
        </form>
      </section>

      <section className="panel p-4" aria-labelledby="auto-title">
        <h2 id="auto-title" className="font-display text-lg font-bold">
          Autonomy
        </h2>
        <p className="mt-1 text-xs text-muted">Everything here is off by default. Background activity is bounded by its own daily budget and session count, and the global pause stops all autonomous work immediately.</p>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ autonomy }, "Autonomy settings saved");
          }}
        >
          <label className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={autonomy.globalPause} onChange={(e) => setAutonomy({ ...autonomy, globalPause: e.target.checked })} />
            <span>
              <b>Global pause</b> — halt background sessions and world auto-run. Founder-initiated sessions are unaffected.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={autonomy.suggestionsEnabled} onChange={(e) => setAutonomy({ ...autonomy, suggestionsEnabled: e.target.checked })} />
            <span>
              <b>Suggested discussions</b>
              <span className="block text-xs text-muted">Members may propose topics from interests you approved in Memory. Proposals wait in a queue for you.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={autonomy.backgroundEnabled} onChange={(e) => setAutonomy({ ...autonomy, backgroundEnabled: e.target.checked })} />
            <span>
              <b>Scheduled background sessions</b>
              <span className="block text-xs text-muted">Deliberate on the top accepted suggestion on a schedule while the app is running.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={autonomy.primeGovernance} onChange={(e) => setAutonomy({ ...autonomy, primeGovernance: e.target.checked })} />
            <span>
              <b>Prime governance of the world</b>
              <span className="block text-xs text-muted">
                The Primes deliberate on each world decision awaiting review and apply clear, non-simulated decisions themselves. You see every decision and outcome in the Chronicle and can still
                decide any item first. Uses the background budget and daily session cap.
              </span>
            </span>
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Council self-examination every N days (0 = off)
            <input
              type="number"
              className="field mt-1"
              min={0}
              max={30}
              value={autonomy.selfExaminationDays}
              onChange={(e) => setAutonomy({ ...autonomy, selfExaminationDays: Number(e.target.value) })}
            />
            <span className="mt-1 block">
              Needs scheduled background sessions. The Primes examine one assumption in how the council itself operates (Beyond the System). Proposed changes are recorded in Discoveries for your
              approval; nothing is applied automatically.
            </span>
          </label>
          <label className="text-xs text-muted">
            Minutes between background sessions
            <input type="number" className="field mt-1" min={15} max={1440} value={autonomy.intervalMinutes} onChange={(e) => setAutonomy({ ...autonomy, intervalMinutes: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-muted">
            Max background sessions per day
            <input type="number" className="field mt-1" min={0} max={24} value={autonomy.maxSessionsPerDay} onChange={(e) => setAutonomy({ ...autonomy, maxSessionsPerDay: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-muted">
            Background daily budget ($, estimated)
            <input type="number" step="0.01" className="field mt-1" min={0} max={20} value={autonomy.backgroundDailyBudgetUsd} onChange={(e) => setAutonomy({ ...autonomy, backgroundDailyBudgetUsd: Number(e.target.value) })} />
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Save autonomy settings</button>
          </div>
        </form>
      </section>
    </div>
  );
}
