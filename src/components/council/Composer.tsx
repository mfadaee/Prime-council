"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";

export function Composer({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { id } = await api<{ id: string }>("/api/sessions", { body: { question: q } });
      router.push(`/sessions/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`panel ${compact ? "p-3" : "p-4"}`} aria-label="Ask the council">
      <label htmlFor="question" className="font-display text-sm font-bold text-prime">
        ♛ Ask the council
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
          placeholder="What should the council deliberate on?"
          maxLength={4000}
          required
        />
        <button className="btn btn-primary sm:self-stretch sm:px-5" disabled={busy || q.trim().length < 3}>
          {busy ? "Convening…" : "Convene"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">Ctrl/⌘ + Enter to submit · rounds, time and spending are capped in Settings.</p>
      {err && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
