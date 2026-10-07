"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatDuration, formatTokens, formatUsd } from "@/lib/client/api";
import { StatusBadge } from "./SessionView";

interface Row {
  id: string;
  question: string;
  status: string;
  origin: string;
  simulated: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  startedAt: string;
  endedAt: string | null;
}

export function SessionsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api<{ sessions: Row[] }>("/api/sessions").then((r) => setRows(r.sessions)).catch(() => setRows([]));
  }, []);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Session history</h1>
        <p className="text-sm text-muted">Every session is stored as an event log. Open one to review it or replay it on the timeline.</p>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-faint">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-semibold">Question</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Origin</th>
              <th className="px-3 py-3 font-semibold">Duration</th>
              <th className="px-3 py-3 font-semibold">Tokens</th>
              <th className="px-3 py-3 font-semibold">Est. cost</th>
              <th className="px-3 py-3 font-semibold">Started</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-faint">
                  No sessions yet. <Link href="/" className="underline">Ask the council</Link>.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-line/60 hover:bg-white/[0.03]">
                <td className="max-w-[420px] px-4 py-3">
                  <Link href={`/sessions/${r.id}`} className="line-clamp-2 font-medium hover:underline">
                    {r.question}
                  </Link>
                  {r.simulated && <span className="chip sim-badge mt-1 !text-[10px]">Simulated</span>}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-3 capitalize text-muted">{r.origin}</td>
                <td className="px-3 py-3 text-muted">{r.endedAt ? formatDuration(new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) : "—"}</td>
                <td className="px-3 py-3 text-muted">
                  {formatTokens(r.inputTokens)} / {formatTokens(r.outputTokens)}
                </td>
                <td className="px-3 py-3 text-muted">{formatUsd(r.costUsd)}</td>
                <td className="px-3 py-3 text-muted">{new Date(r.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
