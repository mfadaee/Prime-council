"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { api, formatUsd } from "@/lib/client/api";

const NAV = [
  { href: "/", label: "Council" },
  { href: "/sessions", label: "Sessions" },
  { href: "/discoveries", label: "Discoveries" },
  { href: "/members", label: "Primes" },
  { href: "/memory", label: "Memory" },
  { href: "/world", label: "World" },
  { href: "/settings", label: "Settings" },
  { href: "/improvements", label: "Improvements" },
];

interface Status {
  demoForced: boolean;
  database: string;
  providers: { id: string; status: string; kind: string }[];
  seats: { total: number; simulated: number };
  spendTodayUsd: number;
  dailyBudgetUsd: number;
  globalPause: boolean;
}

export function SiteHeader() {
  const path = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api<Status>("/api/status").then((s) => alive && setStatus(s)).catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  const liveSeats = status ? status.seats.total - status.seats.simulated : 0;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-3 py-2.5 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg pr-2" aria-label="Prime Council — Council chamber">
          <LogoMark size={34} />
          <span className="whitespace-nowrap font-display text-base font-bold tracking-tight sm:text-lg">
            Prime <span className="bg-gradient-to-r from-prime to-[#ff8fcb] bg-clip-text text-transparent">Council</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-2 hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive(n.href) ? "bg-white/10 text-ink" : "text-muted hover:bg-white/5 hover:text-ink"}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {status && (
            <>
              {status.demoForced || liveSeats === 0 ? (
                <span className="chip sim-badge" title="Every council seat uses the simulated demo provider; no model is called.">
                  Demo mode
                </span>
              ) : (
                <span className="chip border-support/50 text-support" title="Enabled council seats assigned to a real model (simulated seats are labelled)">
                  {liveSeats}/{status.seats.total} seats on real models
                </span>
              )}
              {status.globalPause && <span className="chip border-warn/60 text-warn">Autonomy paused</span>}
              <span className="chip hidden text-muted sm:inline-flex" title="Estimated spend today (UTC) vs daily budget">
                {formatUsd(status.spendTodayUsd)} / {formatUsd(status.dailyBudgetUsd)} today
              </span>
            </>
          )}
          <button className="btn btn-sm lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-3 pb-3 lg:hidden">
          <ul className="grid grid-cols-2 gap-1 pt-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm ${isActive(n.href) ? "bg-white/10" : "text-muted"}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
