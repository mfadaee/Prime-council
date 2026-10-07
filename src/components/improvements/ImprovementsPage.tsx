"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

interface Item {
  date: string;
  title: string;
  purpose: string;
  change: string;
  validation: string;
  risk: "low" | "review";
  remainingIssues: string;
  branch: string | null;
  pr: string | number | null;
}
interface Resp {
  items: Item[];
  error: string | null;
  schedule: { configuredIn: string[]; activeHere: boolean; note: string };
}

export function ImprovementsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Resp>("/api/improvements")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Improvement history</h1>
        <p className="max-w-3xl text-sm text-muted">
          What changed in Prime Council, why, and how it was validated. The daily improvement job adds one entry per run in its pull request; entries appear here once merged.
        </p>
      </div>

      <section className="panel space-y-2 p-4 text-sm" aria-labelledby="sched-title">
        <div className="flex items-center gap-2">
          <h2 id="sched-title" className="font-display text-lg font-bold">
            Daily improvement job
          </h2>
          <span className="chip border-warn/60 text-warn">Not active from this app</span>
        </div>
        <p className="text-muted">{data?.schedule.note ?? "…"}</p>
        <ul className="list-disc pl-5 text-xs text-muted">
          <li>Runs one bounded improvement per day on a new branch, with a spending cap (default $3) and a 45-minute runtime limit.</li>
          <li>Runs lint, typecheck, tests and build, then opens a pull request with validation evidence.</li>
          <li>Small changes outside sensitive areas may auto-merge only after all required checks pass. Secrets, auth, spending, migrations, dependencies and workflows always stay reviewable.</li>
        </ul>
        <p className="text-xs text-faint">Configured in: {data?.schedule.configuredIn.map((c) => <code key={c} className="mr-2">{c}</code>)}</p>
      </section>

      {(err || data?.error) && (
        <p className="text-sm text-danger" role="alert">
          {err ?? data?.error}
        </p>
      )}

      <ol className="relative space-y-4 border-l border-line pl-5">
        {data?.items.map((it, i) => (
          <li key={i} className="panel relative p-4">
            <span className="absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-bg bg-prime" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-bold">{it.title}</h2>
              <span className={`chip ${it.risk === "low" ? "border-support/60 text-support" : "border-warn/60 text-warn"}`}>{it.risk === "low" ? "low risk" : "reviewed"}</span>
              <span className="ml-auto text-xs text-faint">
                {it.date}
                {it.branch ? ` · ${it.branch}` : ""}
                {it.pr ? (
                  <>
                    {" · "}
                    {typeof it.pr === "string" ? (
                      <a className="underline" href={it.pr} target="_blank" rel="noopener noreferrer">
                        pull request
                      </a>
                    ) : (
                      `PR #${it.pr}`
                    )}
                  </>
                ) : null}
              </span>
            </div>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-wider text-faint">Purpose</dt>
              <dd>{it.purpose}</dd>
              <dt className="text-xs font-semibold uppercase tracking-wider text-faint">Change</dt>
              <dd>{it.change}</dd>
              <dt className="text-xs font-semibold uppercase tracking-wider text-faint">Validation</dt>
              <dd>{it.validation}</dd>
              <dt className="text-xs font-semibold uppercase tracking-wider text-faint">Remaining</dt>
              <dd className="text-muted">{it.remainingIssues || "—"}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
