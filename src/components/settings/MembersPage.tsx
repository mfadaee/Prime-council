"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { COUNCIL_ROLES, type CouncilRole } from "@/lib/council/types";
import { Avatar } from "@/components/council/Avatar";
import { ROLE_META } from "@/components/council/meta";
import { ProviderStatusBadge } from "./ProviderStatusBadge";

interface Provider {
  id: string;
  kind: string;
  label: string;
  baseUrl: string | null;
  apiKeyEnv: string | null;
  keyPresent: boolean;
  local: boolean;
  enabled: boolean;
  status: string;
  lastCheckAt: string | null;
  lastCheckDetail: string | null;
  models: string[];
}
interface Member {
  id: string;
  name: string;
  role: CouncilRole;
  persona: string;
  providerId: string;
  model: string;
  enabled: boolean;
  color: string;
  monogram: string;
  sharesModelWith: string[];
  updatedAt: string;
}

const KIND_HELP: Record<string, string> = {
  openai: "OpenAI Responses API. Key from OPENAI_API_KEY.",
  anthropic: "Anthropic Messages API (official SDK). Key from ANTHROPIC_API_KEY.",
  google: "Gemini API generateContent. Key from GEMINI_API_KEY.",
  openai_compatible: "Any /v1/chat/completions server (vLLM, LM Studio, llama.cpp, OpenRouter…). Base URL required; key optional.",
  ollama: "Local Ollama via /api/chat. Defaults to http://localhost:11434.",
  demo: "Built-in simulated provider. No model is called; output is labelled simulated.",
};

const fetchAll = () => Promise.all([api<{ providers: Provider[] }>("/api/providers"), api<{ members: Member[] }>("/api/members")]);

export function MembersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = useCallback(([p, m]: [{ providers: Provider[] }, { members: Member[] }]) => {
    setProviders(p.providers);
    setMembers(m.members);
  }, []);
  const load = useCallback(() => fetchAll().then(apply), [apply]);
  useEffect(() => {
    fetchAll()
      .then(apply)
      .catch((e) => setMsg(e.message));
  }, [apply]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Members & providers</h1>
        <p className="max-w-3xl text-sm text-muted">
          A <b>provider</b> serves models; a <b>model</b> is the underlying LLM; a <b>member</b> is a persistent persona with a role and a chosen model. API keys stay in your server environment
          (<code>.env.local</code>) — this page only references variable names and never displays key values.
        </p>
        {msg && (
          <p className="mt-2 text-sm text-warn" role="status">
            {msg}
          </p>
        )}
      </div>

      <section aria-labelledby="prov-title" className="space-y-3">
        <h2 id="prov-title" className="font-display text-lg font-bold">
          Providers
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} p={p} onRun={run} />
          ))}
        </div>
        <AddProvider onRun={run} />
      </section>

      <section aria-labelledby="mem-title" className="space-y-3">
        <h2 id="mem-title" className="font-display text-lg font-bold">
          Council members
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {members.map((m) => (
            <MemberCard key={`${m.id}:${m.updatedAt}`} m={m} providers={providers} members={members} onRun={run} />
          ))}
        </div>
        <AddMember providers={providers} onRun={run} />
      </section>
    </div>
  );
}

function ProviderCard({ p, onRun }: { p: Provider; onRun: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "");
  const [keyEnv, setKeyEnv] = useState(p.apiKeyEnv ?? "");
  const [checking, setChecking] = useState(false);
  const editable = p.kind !== "demo";
  return (
    <article className="panel space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-bold">{p.label}</h3>
        <code className="text-[11px] text-faint">{p.id}</code>
        <span className="ml-auto">
          <ProviderStatusBadge status={p.status} />
        </span>
      </div>
      <p className="text-xs text-muted">{KIND_HELP[p.kind]}</p>
      {p.lastCheckDetail && (
        <p className={`text-xs ${p.status === "unavailable" ? "text-danger" : "text-faint"}`}>
          Last check{p.lastCheckAt ? ` (${new Date(p.lastCheckAt).toLocaleTimeString()})` : ""}: {p.lastCheckDetail}
        </p>
      )}
      {editable && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(() => api(`/api/providers/${p.id}`, { method: "PATCH", body: { baseUrl: baseUrl.trim() || null, apiKeyEnv: keyEnv.trim() || null } }), `${p.label} saved`);
          }}
        >
          {(p.kind === "openai_compatible" || p.kind === "ollama" || baseUrl) && (
            <label className="block text-xs text-muted">
              Base URL
              <input className="field mt-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={p.kind === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1"} />
            </label>
          )}
          {p.kind !== "ollama" && (
            <label className="block text-xs text-muted">
              API key environment variable{" "}
              <span className={p.keyPresent ? "text-support" : "text-faint"}>({p.keyPresent ? "set in environment" : "not set"})</span>
              <input className="field mt-1 font-mono" value={keyEnv} onChange={(e) => setKeyEnv(e.target.value)} placeholder="e.g. OPENAI_API_KEY" />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm">Save</button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await onRun(() => api(`/api/providers/${p.id}/check`, { body: {} }));
                setChecking(false);
              }}
            >
              {checking ? "Checking…" : "Check now"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onRun(() => api(`/api/providers/${p.id}`, { method: "PATCH", body: { enabled: !p.enabled } }))}>
              {p.enabled ? "Disable" : "Enable"}
            </button>
            {!["anthropic", "openai", "google", "ollama", "compat"].includes(p.id) && (
              <button type="button" className="btn btn-sm btn-danger" onClick={() => onRun(() => api(`/api/providers/${p.id}`, { method: "DELETE" }), "Provider removed")}>
                Remove
              </button>
            )}
          </div>
        </form>
      )}
      {p.models.length > 0 && <p className="text-[11px] text-faint">{p.models.length} models discovered (choose one per member below).</p>}
    </article>
  );
}

function AddProvider({ onRun }: { onRun: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ id: "", kind: "openai_compatible", label: "", baseUrl: "", apiKeyEnv: "", local: false });
  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Add provider
      </button>
    );
  return (
    <form
      className="panel grid gap-2 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onRun(
          () => api("/api/providers", { body: { ...f, baseUrl: f.baseUrl || null, apiKeyEnv: f.apiKeyEnv || null } }),
          "Provider added — run a check to confirm it is reachable",
        ).then(() => setOpen(false));
      }}
    >
      <label className="text-xs text-muted">
        Id
        <input className="field mt-1" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="lm-studio" required />
      </label>
      <label className="text-xs text-muted">
        Kind
        <select className="field mt-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {["openai_compatible", "ollama", "openai", "anthropic", "google"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Label
        <input className="field mt-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required />
      </label>
      <label className="text-xs text-muted">
        Base URL
        <input className="field mt-1" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
      </label>
      <label className="text-xs text-muted">
        API key env var (optional)
        <input className="field mt-1 font-mono" value={f.apiKeyEnv} onChange={(e) => setF({ ...f, apiKeyEnv: e.target.value })} placeholder="LMSTUDIO_API_KEY" />
      </label>
      <label className="flex items-center gap-2 self-end text-xs text-muted">
        <input type="checkbox" checked={f.local} onChange={(e) => setF({ ...f, local: e.target.checked })} /> Runs locally (no cost)
      </label>
      <p className="text-[11px] text-warn sm:col-span-2">Only point a provider at a server you trust: its key variable is sent to that URL.</p>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary btn-sm">Add</button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MemberCard({ m, providers, members, onRun }: { m: Member; providers: Provider[]; members: Member[]; onRun: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [f, setF] = useState(m);
  const prov = providers.find((p) => p.id === f.providerId);
  const listId = `models-${m.id}`;
  const dirty = JSON.stringify(f) !== JSON.stringify(m);
  const shares = members.filter((o) => o.id !== m.id && o.enabled && o.providerId === f.providerId && o.model === f.model);
  return (
    <form
      className="panel space-y-3 p-4"
      aria-label={`Member ${m.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        const { name, role, persona, providerId, model, enabled, color, monogram } = f;
        onRun(() => api(`/api/members/${m.id}`, { method: "PATCH", body: { name, role, persona, providerId, model, enabled, color, monogram } }), `${f.name} saved`);
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar id={m.id} monogram={f.monogram || "?"} color={f.color} size={48} dim={!f.enabled} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">{f.name}</p>
          <p className="text-xs text-muted">
            {ROLE_META[f.role].title} · {prov ? <ProviderStatusBadge status={prov.status} /> : "unknown provider"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Seated
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Name
          <input className="field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} />
        </label>
        <label className="text-xs text-muted">
          Role
          <select className="field mt-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as CouncilRole })}>
            {COUNCIL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Provider
          <select
            className="field mt-1"
            value={f.providerId}
            onChange={(e) => {
              const np = providers.find((p) => p.id === e.target.value);
              setF({ ...f, providerId: e.target.value, model: np?.kind === "demo" ? "demo-simulated" : np?.models[0] ?? (f.model === "demo-simulated" ? "" : f.model) });
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.status.replace("_", " ")})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Model
          <input className="field mt-1 font-mono" list={listId} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="model id" required />
          <datalist id={listId}>
            {prov?.models.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-muted">
          Colour
          <input type="color" className="field mt-1 h-9 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
        </label>
        <label className="text-xs text-muted">
          Monogram
          <input className="field mt-1" value={f.monogram} onChange={(e) => setF({ ...f, monogram: e.target.value.slice(0, 2) })} maxLength={2} />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Persona (shapes tone and focus; the role sets the job)
        <textarea className="field mt-1 min-h-16" value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} maxLength={600} />
      </label>
      {shares.length > 0 && prov?.kind !== "demo" && (
        <p className="text-xs text-warn">Same provider and model as {shares.map((s) => s.name).join(", ")}. The council labels this; agreement between them is weaker evidence.</p>
      )}
      {prov && prov.kind !== "demo" && !prov.models.length && <p className="text-[11px] text-faint">Run “Check now” on {prov.label} to list available model ids.</p>}
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={!dirty}>
          Save
        </button>
        {dirty && (
          <button type="button" className="btn btn-sm" onClick={() => setF(m)}>
            Revert
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-danger ml-auto"
          onClick={() => confirm(`Remove ${m.name} from the council? Past sessions keep their record.`) && onRun(() => api(`/api/members/${m.id}`, { method: "DELETE" }), `${m.name} removed`)}
        >
          Remove
        </button>
      </div>
    </form>
  );
}

function AddMember({ providers, onRun }: { providers: Provider[]; onRun: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", role: "analyst" as CouncilRole, providerId: "demo", model: "demo-simulated", color: "#7dd3fc", monogram: "", persona: "" });
  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Add member
      </button>
    );
  return (
    <form
      className="panel grid gap-2 p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onRun(() => api("/api/members", { body: { ...f, monogram: f.monogram || f.name.slice(0, 1).toUpperCase() } }), `${f.name} joined the council`).then(() => setOpen(false));
      }}
    >
      <label className="text-xs text-muted">
        Name
        <input className="field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={40} />
      </label>
      <label className="text-xs text-muted">
        Role
        <select className="field mt-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as CouncilRole })}>
          {COUNCIL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_META[r].title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Provider
        <select className="field mt-1" value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Model
        <input className="field mt-1 font-mono" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} required />
      </label>
      <label className="text-xs text-muted">
        Colour
        <input type="color" className="field mt-1 h-9 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
      </label>
      <div className="flex items-end gap-2">
        <button className="btn btn-primary btn-sm">Add</button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
