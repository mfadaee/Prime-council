"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { DiscoveryRecord } from "@/lib/discovery/types";
import { STATUS_TONE } from "./DiscoveryView";

export function DiscoveriesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<DiscoveryRecord[] | null>(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<{ discoveries: DiscoveryRecord[] }>(`/api/discoveries?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => setItems(r.discoveries))
        .catch(() => {});
    }, 250);
    return () => (clearTimeout(t), ctl.abort());
  }, [q]);

  const selfExamine = async (queue: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ sessionId?: string; suggestionId?: string }>("/api/discoveries/self-examine", { body: { focus: focus || undefined, queue } });
      if (r.sessionId) router.push(`/sessions/${r.sessionId}`);
      else setNotice("Queued as a suggestion — discuss or schedule it from Memory.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h1 className="font-display text-xl font-bold">⟁ Discoveries</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every Beyond-the-System investigation is kept here: the system the council mapped, which assumptions were real constraints and which were changeable conventions, every alternative
          (including ones that lost the debate), the proposed experiment and what was learned. Revisit one to build on it instead of starting over.
        </p>
        <input className="field mt-3" type="search" placeholder="Search assumptions, alternatives, lessons…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search discoveries" />
      </section>

      <section className="panel p-4" aria-labelledby="self-title">
        <h2 id="self-title" className="font-display text-base font-bold">
          Examine the council itself
        </h2>
        <p className="mt-1 text-sm text-muted">
          The Primes apply Beyond the System to their own roles, checks, memory and orchestration, using a factual description of how the council runs today. Changes they propose are recorded for
          your approval and still go through a branch, tests and pull-request review — nothing is applied automatically. Concluding that no change is needed is a valid outcome.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className="field flex-1" placeholder="Optional focus, e.g. “our consensus mechanism”" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={500} />
          <button className="btn btn-primary" disabled={busy} onClick={() => selfExamine(false)}>
            Convene now
          </button>
          <button className="btn" disabled={busy} onClick={() => selfExamine(true)}>
            Queue for later
          </button>
        </div>
        {notice && (
          <p className="mt-2 text-xs text-muted" role="status">
            {notice}
          </p>
        )}
      </section>

      <section aria-label="Discovery list" className="space-y-2">
        {items === null && <div className="panel p-4 text-muted">Loading…</div>}
        {items?.length === 0 && (
          <div className="panel p-4 text-sm text-faint">
            {q ? "No discovery matches." : "No investigations yet. Choose “Beyond the System” when you ask the Primes a question."}{" "}
            <Link href="/" className="underline">
              Ask the Primes
            </Link>
          </div>
        )}
        {items?.map((d) => (
          <Link key={d.id} href={`/discoveries/${d.id}`} className="panel block p-4 hover:opacity-90">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={`chip ${STATUS_TONE[d.status]}`}>{d.status}</span>
              {d.scope === "council" && <span className="chip border-prime/60 text-prime">self-examination</span>}
              {d.parentId && <span className="chip text-muted">revisit</span>}
              {d.simulated && <span className="chip sim-badge !text-[10px]">Simulated</span>}
              {d.experiment && <span className="chip text-muted">experiment: {d.experiment.status.replace("_", " ")}</span>}
              <time className="ml-auto text-faint" dateTime={d.updatedAt}>
                {new Date(d.updatedAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-1.5 font-medium">{d.question}</p>
            <p className="mt-1 text-xs text-muted">
              {d.assumptions.length} assumption(s) · {d.assumptions.filter((a) => a.kind === "constraint").length} constraint(s) kept · {d.alternatives.length} alternative(s) ·{" "}
              {d.lessons.length} lesson(s)
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
