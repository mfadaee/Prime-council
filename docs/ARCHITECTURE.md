# Architecture

Simulated Life is one Next.js (App Router) application with a server-side orchestration layer, PostgreSQL persistence and Server-Sent Events. It is built in layers so the council and the world simulation can each run on their own while linking through explicit events.

```
Browser ── fetch/SSE ──► Route handlers (/api/*) ──► Services ──► Engines ──► Providers
   ▲                          │                         │            │
   └──── reducer(events) ◄────┴── session_events ◄──────┴── event bus┘
```

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| Access | `src/proxy.ts`, `src/lib/api.ts` | Loopback-only or token auth; CSRF header; rate limits; validation; JSON errors |
| Services | `src/lib/council/service.ts`, `src/lib/settings.ts` | Build rosters, resolve providers and prices, start/continue sessions, apply Prime actions |
| Council engine | `src/lib/council/orchestrator.ts` | Bounded deliberation pipeline, budget guard, concurrency, retries, cancellation, events |
| Providers | `src/lib/providers/*` | One adapter per API kind behind `ProviderAdapter`; status checks; pricing |
| Persistence | `src/lib/db/*`, `drizzle/` | Drizzle schema; node-postgres or embedded PGlite; auto-migrations |
| Live delivery | `src/lib/council/bus.ts`, `/api/sessions/:id/stream` | In-process pub/sub plus a resumable SSE stream |
| View state | `src/lib/council/reducer.ts` | A pure function from events to chamber state, shared by the live and replay views |
| UI | `src/components/**` | Chamber, transcript, final answer, controls, settings |

## Council pipeline

```
interpret (Chair)
  → independent contributions (Analyst, Skeptic, Researcher, Builder — in parallel, blind)
  → [critique → resolve] × rounds   (stops early when no material challenge remains)
  → synthesize (Synthesizer)
```

- **Independence.** Initial prompts contain only the question, the Chair's interpretation and approved memory. Tests check that no member sees another's answer before critique.
- **Critique targets** are validated: self-targets and unknown members are dropped, and names are mapped to ids.
- **Resolution** asks challenged members only to revise, defend or concede on the merits.
- **Synthesis** is instructed to weigh evidence over majority, to treat same-model agreement as weak, and to preserve disagreement and uncertainty.
- **Bounds** (all in code):
  - `maxRounds` (default 1) and `hardMaxRounds` (≤ 5, default 3), including Prime-requested rounds;
  - concurrency semaphore; `maxOutputTokens`; per-call timeout; bounded retries for transient errors only;
  - session wall-clock limit; budget reservations.
- **Cancellation.** One `AbortController` per run, plus one per member call:
  - **Stop** aborts every queued and in-flight call;
  - **Exclude** aborts only that member's calls;
  - aborted calls are recorded as `cancelled` usage.
- **Continuation.** "Another round" and "Challenge a claim" on a finished session rebuild its state from the `contributions` table, run one more bounded round, then re-synthesize.

### Events

Defined in `src/lib/council/types.ts` (`CouncilEvent`), each with a gap-free per-session `seq`:

`session.started`, `phase.started`, `member.state`, `member.message`, `member.link`, `member.error`, `budget.blocked`, `usage.updated`, `prime.intervention`, `session.final`, `session.override`, `session.ended`.

Every event is first inserted into `session_events`, then published. The SSE route subscribes first, replays from the database after `?after=`/`Last-Event-ID`, then flushes buffered live events. This means there are no gaps and no duplicates. The reducer is idempotent on `seq`.

### Simulated labelling

- Each roster entry records `simulated` (provider kind `demo`).
- Each event records `simulated`: for member events, whether that member is simulated; for session events, whether all members are.
- The UI badges simulated messages, sessions and the chamber.

## Spending model

- Usage comes from the provider (`usage_source = provider`) when reported, otherwise it is estimated as characters ÷ 4.
- Cost is `tokens × price`, using the table in `src/lib/providers/pricing.ts` plus Prime overrides. It is always labelled an estimate.
- `BudgetGuard` reserves each call's worst-case cost before it starts and settles to the actual cost afterwards.
- Limits apply per session, per UTC day, and separately to background activity.
- Unpriced remote models are refused unless the Prime allows them.

## Data model

| Table | Holds |
|---|---|
| `providers` | Provider instances (kind, base URL, key *variable name*, local flag, last check, models) |
| `members` | Personas (role, persona, provider, model, colour, monogram, seat) |
| `council_sessions` | Question, status, roster snapshot, limits, final/initial answers, override, totals |
| `session_events` | Append-only event log (replay) |
| `contributions` | Published member output (rebuilds state for continuation) |
| `usage_records` | Every call's tokens, cost estimate, outcome, scope |
| `settings` | Limits, autonomy, pricing |
| `memory_items`, `suggestions` | Approved memory; suggested discussions |
| `audit_log` | Prime actions, configuration changes, scheduler and world actions |
| `worlds`, `world_events`, `world_ticks`, `world_snapshots` | Simulation state, event log, per-tick history, snapshots |

Schema changes are additive only: new tables or nullable columns.

## Deployment assumptions

The orchestrator and the SSE bus run inside one long-lived Node.js server process (`next start`). This is the intended local-first setup. Running several replicas, or serverless functions, would need a shared bus (e.g. Postgres `LISTEN/NOTIFY`) and a job runner; see the backlog.
