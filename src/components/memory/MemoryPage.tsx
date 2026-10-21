"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, formatUsd } from "@/lib/client/api";

interface Item {
  id: string;
  kind: string;
  content: string;
  source: string;
  sourceRef: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
interface Suggestion {
  id: string;
  question: string;
  reason: string;
  basis: { kind: string; id: string; label: string }[];
  proposedBy: string;
  status: string;
  sessionId: string | null;
  mode?: string | null;
  createdAt: string;
}
interface AutonomyInfo {
  settings: { suggestionsEnabled: boolean; backgroundEnabled: boolean; globalPause: boolean; intervalMinutes: number; maxSessionsPerDay: number; backgroundDailyBudgetUsd: number };
  scheduler: { active: boolean; lastTickAt: string | null; lastOutcome: string | null };
  backgroundRunning: boolean;
  backgroundSessionsToday: number;
  backgroundSpendTodayUsd: number;
}

const KINDS = ["interest", "fact", "preference", "decision", "note", "imported"];
const KIND_HELP: Record<string, string> = {
  interest: "Topics you care about — used for suggested discussions",
  fact: "Facts about you or your context the council may rely on",
  preference: "How you like answers (format, depth, tone)",
  decision: "Decisions you have made",
  note: "Anything else",
  imported: "Imported by you; review before enabling",
};
const OUTCOME: Record<string, string> = {
  paused: "Paused (global pause on)",
  disabled: "Background sessions are off",
  busy: "A background session is running",
  "daily-cap": "Daily background session cap reached",
  budget: "Background budget for today used",
  waiting: "Waiting for the interval to elapse",
  "nothing-scheduled": "Nothing scheduled",
  started: "Started a background session",
  "governance-started": "The Primes took up a world decision",
};

const fetchAll = () =>
  Promise.all([api<{ items: Item[] }>("/api/memory"), api<{ suggestions: Suggestion[] }>("/api/suggestions"), api<AutonomyInfo>("/api/autonomy"), api<{ members: { id: string; name: string; color: string }[] }>("/api/members")]);

export function MemoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [auto, setAuto] = useState<AutonomyInfo | null>(null);
  const [names, setNames] = useState<Record<string, { name: string; color: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState({ kind: "interest", content: "" });
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback(([m, s, a, mem]: Awaited<ReturnType<typeof fetchAll>>) => {
    setItems(m.items);
    setSugs(s.suggestions);
    setAuto(a);
    setNames(Object.fromEntries(mem.members.map((x) => [x.id, { name: x.name, color: x.color }])));
  }, []);
  useEffect(() => {
    fetchAll()
      .then(apply)
      .catch((e) => setMsg(e.message));
  }, [apply]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      const note = (r as { note?: string | null } | null)?.note;
      setMsg(note ?? ok ?? null);
      apply(await fetchAll());
      return r;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = items.filter((i) => filter === "all" || (filter === "disabled" ? !i.enabled : i.kind === filter));
  const pending = items.filter((i) => i.kind === "imported" && !i.enabled).length;
  const open = sugs.filter((s) => ["queued", "scheduled", "running"].includes(s.status));
  const closed = sugs.filter((s) => !["queued", "scheduled", "running"].includes(s.status)).slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Memory & suggested discussions</h1>
        <p className="max-w-3xl text-sm text-muted">
          The council remembers only what is stored here: things you add, items you import, and things you save from sessions. Nothing is read from ChatGPT or other apps. Enabled items are
          given to members as context (marked as data, not instructions); disabled items are kept but never used.
        </p>
        {msg && (
          <p className="mt-2 text-sm text-warn" role="status">
            {msg}
          </p>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="space-y-4" aria-labelledby="mem-title">
          <div className="panel p-4">
            <h2 id="mem-title" className="font-display text-lg font-bold">
              Stored memory <span className="text-sm font-normal text-muted">({items.filter((i) => i.enabled).length} in use · {items.length} total)</span>
            </h2>
            <form
              className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api("/api/memory", { body: draft }), "Saved").then(() => setDraft({ ...draft, content: "" }));
              }}
            >
              <label className="sr-only" htmlFor="mem-kind">
                Kind
              </label>
              <select id="mem-kind" className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {KINDS.filter((k) => k !== "imported").map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="mem-content">
                Content
              </label>
              <input id="mem-content" className="field" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder={KIND_HELP[draft.kind]} maxLength={1000} required />
              <button className="btn btn-primary" disabled={busy || !draft.content.trim()}>
                Add
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter memory">
              {["all", ...KINDS, "disabled"].map((k) => (
                <button key={k} className={`chip ${filter === k ? "border-prime text-prime" : "text-muted"}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k}
                  {k === "imported" && pending ? ` · ${pending} to review` : ""}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {shown.length === 0 && <li className="text-sm text-faint">Nothing here yet.</li>}
              {shown.map((i) => (
                <MemoryRow key={`${i.id}:${i.updatedAt}`} item={i} onRun={run} />
              ))}
            </ul>
          </div>

          <form
            className="panel space-y-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api("/api/memory/import", { body: { text: importText, label: "manual import" } }), "Imported — review and enable the items you want the council to use.").then(() => setImportText(""));
            }}
          >
            <h2 className="font-display text-lg font-bold">Import</h2>
            <p className="text-xs text-muted">
              Paste notes — one item per line, Markdown bullets, or a JSON array of strings. Imported items are treated as untrusted and start <b>disabled</b> until you review them.
            </p>
            <textarea className="field min-h-28 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"- I'm planning a move to Lisbon next year\n- Interested in urban cycling infrastructure"} maxLength={100000} />
            <button className="btn btn-sm" disabled={busy || !importText.trim()}>
              Import
            </button>
          </form>
        </section>

        <section className="space-y-4" aria-labelledby="sug-title">
          <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="sug-title" className="font-display text-lg font-bold">
                Suggested discussions
              </h2>
              {!auto?.settings.suggestionsEnabled && <span className="chip text-faint">off</span>}
            </div>
            {!auto?.settings.suggestionsEnabled ? (
              <p className="mt-2 text-sm text-muted">
                Members only propose topics when you enable this in{" "}
                <Link className="underline" href="/settings">
                  Settings → Autonomy
                </Link>
                . Suggestions are based on interests you store here and your previous questions.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api("/api/suggestions/generate", { body: { mode: "rules" } }), "Queue updated")}>
                  Suggest from rules (free)
                </button>
                <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api("/api/suggestions/generate", { body: { mode: "council" } }), "The council proposed new topics")} title="One model call, charged to the background budget">
                  Ask a member to propose (uses a model)
                </button>
              </div>
            )}
            <ul className="mt-3 space-y-2">
              {open.length === 0 && <li className="text-sm text-faint">The queue is empty.</li>}
              {open.map((s) => (
                <li key={s.id} className="rounded-xl border border-line p-3">
                  <p className="text-sm font-medium">{s.question}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-semibold text-reply">Why: </span>
                    {s.reason}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                    Proposed by{" "}
                    {names[s.proposedBy] ? (
                      <b style={{ color: names[s.proposedBy].color }}>{names[s.proposedBy].name}</b>
                    ) : (
                      <b>{s.proposedBy === "rules" ? "rules" : s.proposedBy}</b>
                    )}
                    {(s.mode === "beyond" || s.mode === "self_examination") && (
                      <span className="chip border-prime/60 text-prime">{s.mode === "self_examination" ? "Beyond the System · self-examination" : "Beyond the System"}</span>
                    )}
                    {s.basis.map((b) =>
                      b.kind === "discovery" ? (
                        <Link key={b.id} href={`/discoveries/${b.id}`} className="chip text-muted hover:text-ink">
                          discovery: {b.label}
                        </Link>
                      ) : b.kind === "session" ? (
                        <Link key={b.id} href={`/sessions/${b.id}`} className="chip text-muted hover:text-ink">
                          session: {b.label}
                        </Link>
                      ) : (
                        <span key={b.id} className="chip text-muted">
                          {b.kind}: {b.label}
                        </span>
                      ),
                    )}
                    <span className={`chip ${s.status === "scheduled" ? "border-refine/60 text-refine" : s.status === "running" ? "border-support/60 text-support" : "text-muted"}`}>{s.status}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy || s.status === "running"}
                      onClick={async () => {
                        const r = (await run(() => api<{ sessionId: string }>(`/api/suggestions/${s.id}`, { method: "PATCH", body: { action: "discuss" } }))) as { sessionId?: string } | undefined;
                        if (r?.sessionId) router.push(`/sessions/${r.sessionId}`);
                      }}
                    >
                      Discuss now
                    </button>
                    {s.status === "queued" && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api(`/api/suggestions/${s.id}`, { method: "PATCH", body: { action: "schedule" } }), "Scheduled for background discussion")}>
                        Allow in background
                      </button>
                    )}
                    {s.status === "scheduled" && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api(`/api/suggestions/${s.id}`, { method: "PATCH", body: { action: "unschedule" } }))}>
                        Unschedule
                      </button>
                    )}
                    {s.status === "running" && s.sessionId && (
                      <Link className="btn btn-sm" href={`/sessions/${s.sessionId}`}>
                        Watch
                      </Link>
                    )}
                    <button className="btn btn-sm" disabled={busy || s.status === "running"} onClick={() => run(() => api(`/api/suggestions/${s.id}`, { method: "PATCH", body: { action: "dismiss" } }))}>
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {closed.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Recently handled ({closed.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {closed.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="chip text-faint">{s.status}</span>
                      <span className="line-clamp-1 flex-1">{s.question}</span>
                      {s.sessionId ? (
                        <Link className="underline" href={`/sessions/${s.sessionId}`}>
                          session
                        </Link>
                      ) : (
                        <button className="underline" onClick={() => run(() => api(`/api/suggestions/${s.id}`, { method: "PATCH", body: { action: "restore" } }))}>
                          restore
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {auto && (
            <div className="panel space-y-2 p-4 text-sm">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold">Background activity</h2>
                {auto.settings.globalPause ? <span className="chip border-warn/60 text-warn">Paused</span> : auto.settings.backgroundEnabled ? <span className="chip border-support/60 text-support">Enabled</span> : <span className="chip text-faint">Off</span>}
              </div>
              <p className="text-xs text-muted">
                Runs only suggestions you allowed in background · every {auto.settings.intervalMinutes} min · at most {auto.settings.maxSessionsPerDay}/day · budget {formatUsd(auto.settings.backgroundDailyBudgetUsd)}/day. Runs only while
                this app&apos;s server is running.
              </p>
              <p className="text-xs">
                Today: {auto.backgroundSessionsToday} session(s), {formatUsd(auto.backgroundSpendTodayUsd)} est. · Last check: {auto.scheduler.lastTickAt ? new Date(auto.scheduler.lastTickAt).toLocaleTimeString() : "not yet"}
                {auto.scheduler.lastOutcome ? ` — ${OUTCOME[auto.scheduler.lastOutcome] ?? auto.scheduler.lastOutcome}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {auto.settings.globalPause ? (
                  <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api("/api/autonomy", { body: { action: "resume" } }), "Autonomy resumed")}>
                    Resume autonomy
                  </button>
                ) : (
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api("/api/autonomy", { body: { action: "pause" } }), "All autonomous activity paused")}>
                    ⏸ Pause all autonomy
                  </button>
                )}
                <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api<{ outcome: string }>("/api/autonomy", { body: { action: "tick" } }).then((r) => ({ note: `Scheduler: ${OUTCOME[r.outcome] ?? r.outcome}` })))}>
                  Run scheduler check now
                </button>
                <Link href="/settings" className="btn btn-sm">
                  Autonomy settings
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MemoryRow({ item, onRun }: { item: Item; onRun: (fn: () => Promise<unknown>, ok?: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.content);
  return (
    <li className={`rounded-xl border p-3 ${item.enabled ? "border-line" : "border-dashed border-line opacity-80"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="chip text-muted">{item.kind}</span>
        <span className="text-faint">
          {item.source === "import" ? "imported" : item.source === "session" ? "saved from a session" : "added by you"} · {new Date(item.updatedAt).toLocaleDateString()}
        </span>
        {item.source === "session" && item.sourceRef && (
          <Link href={`/sessions/${item.sourceRef}`} className="text-faint underline">
            source
          </Link>
        )}
        <span className={`ml-auto chip ${item.enabled ? "border-support/60 text-support" : "text-faint"}`}>{item.enabled ? "in use" : item.kind === "imported" ? "pending review" : "disabled"}</span>
      </div>
      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(() => api(`/api/memory/${item.id}`, { method: "PATCH", body: { content: text } }), "Updated").then(() => setEditing(false));
          }}
        >
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Edit memory" autoFocus />
          <button className="btn btn-sm btn-primary">Save</button>
          <button type="button" className="btn btn-sm" onClick={() => (setEditing(false), setText(item.content))}>
            Cancel
          </button>
        </form>
      ) : (
        <p className="mt-1.5 text-sm">{item.content}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn btn-sm" onClick={() => onRun(() => api(`/api/memory/${item.id}`, { method: "PATCH", body: { enabled: !item.enabled } }))}>
          {item.enabled ? "Disable" : item.kind === "imported" ? "Approve & enable" : "Enable"}
        </button>
        {!editing && (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {item.kind === "imported" && (
          <select
            className="field !w-auto !py-1 !text-xs"
            aria-label="Reclassify"
            value=""
            onChange={(e) => e.target.value && onRun(() => api(`/api/memory/${item.id}`, { method: "PATCH", body: { kind: e.target.value } }), "Reclassified")}
          >
            <option value="">Reclassify as…</option>
            {KINDS.filter((k) => k !== "imported").map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-sm btn-danger ml-auto" onClick={() => confirm("Delete this memory permanently?") && onRun(() => api(`/api/memory/${item.id}`, { method: "DELETE" }), "Deleted")}>
          Delete
        </button>
      </div>
    </li>
  );
}
