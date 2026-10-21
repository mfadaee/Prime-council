"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { SessionMode } from "@/lib/council/types";

export function Composer({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SessionMode>("standard");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { id } = await api<{ id: string }>("/api/sessions", { body: { question: q, mode } });
      router.push(`/sessions/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`panel ${compact ? "p-3" : "p-4"}`} aria-label="Ask the Primes">
      <label htmlFor="question" className="font-display text-sm font-bold text-prime">
        ♛ Ask the Primes
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <textarea
          id="question"
          className="field min-h-[52px] flex-1 resize-y"
          rows={compact ? 1 : 2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
          }}
          placeholder={mode === "beyond" ? "What system, goal or problem should the Primes question?" : "What should the Primes deliberate on?"}
          maxLength={4000}
          required
        />
        <button className="btn btn-primary sm:self-stretch sm:px-5" disabled={busy || q.trim().length < 3}>
          {busy ? "Convening…" : "Convene"}
        </button>
      </div>
      <fieldset className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <legend className="sr-only">Deliberation mode</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode" value="standard" checked={mode === "standard"} onChange={() => setMode("standard")} />
          Standard
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode" value="beyond" checked={mode === "beyond"} onChange={() => setMode("beyond")} />
          <span>
            <b className="text-prime">⟁ Beyond the System</b>
            {!compact && <span className="text-faint"> — map the assumptions, separate real constraints from conventions, generate different alternatives, design an experiment</span>}
          </span>
        </label>
      </fieldset>
      <p className="mt-1.5 text-[11px] text-faint">Ctrl/⌘ + Enter to submit · rounds, time and spending are capped in Settings.</p>
      {err && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
