# Prime Council

> ### ▶ [Try the live demo](https://mfadaee.github.io/Prime-council/)
> Runs in your browser with no setup or keys: watch the Primes deliberate, step in as the Founder, and run the world simulation. All council output in the demo is simulated (no model is called); the world uses the app's real engine.

**A prime council that builds intelligence from scratch.**

You are **the Founder**. The council is made of **Primes**, one agent for each AI model you connect: Claude, GPT, Gemini, local models and others. Under a charter you set, the Primes:
- deliberate together;
- decide;
- govern a simulated world that mirrors ours, to find what is true and add value to human life;
- create the agents that live in that world.

You speak only with the Primes. The agents they create act in the world; you see **major decisions and outcomes** in the Chronicle, not the conversations behind them. Those stay one click away if you want them.

Every animation is driven by a real backend event. Simulated (demo) activity is always labelled. Primes are AI models, and agents are simulations: not people and not conscious beings.

See [docs/VISION.md](docs/VISION.md) for the full vision.

## Live demo (GitHub Pages)

[`index.html`](index.html) is a self-contained demo served by GitHub Pages from `main` (root). It ports the demo provider and the council flow to the browser and inlines the real world engine from `src/lib/sim`. After changing the engine, run `node scripts/build-pages-demo.mjs` to refresh the copy in the page.

## Quick start

Requires Node.js ≥ 20.9.

```bash
npm install
npm run dev            # http://127.0.0.1:3000 — demo mode, embedded Postgres, no keys needed
```

To use real models, copy `.env.example` to `.env.local`, add keys and a model id for each model family, and restart. On first start, the Primes are spread across every configured family (one Prime per AI model where possible). Then verify each provider with "Check now" on the **Primes** page.

```bash
cp .env.example .env.local
# ANTHROPIC_API_KEY=…  OPENAI_API_KEY=…  GEMINI_API_KEY=…  OLLAMA_BASE_URL=…
```

### Database

The app works with zero setup, but you can also use a real PostgreSQL server. The schema and migrations are the same either way.

| Mode | How |
|---|---|
| Embedded PostgreSQL (default) | Nothing to do. Data lives in `./.data/pglite` ([PGlite](https://pglite.dev)) |
| PostgreSQL server | `docker compose up -d db`, then `DATABASE_URL=postgres://simlife:simlife@localhost:5432/simlife` in `.env.local` |

Migrations in `./drizzle` are applied automatically on start. After changing `src/lib/db/schema.ts`, run `npm run db:generate`.

### Demo mode

With no provider configured, every seat uses the built-in **demo provider**:

- The full pipeline runs: events, streaming, controls, persistence, replay.
- Output is clearly marked **Simulated**, and no model is called.
- Latency is simulated too.
- Demo text never presents invented facts or sources.

`npm run dev:demo` (or `SIMLIFE_DEMO=1`) forces demo mode even when keys are present.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server bound to 127.0.0.1 |
| `npm run build && npm start` | Production build + server (127.0.0.1) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit tests (Vitest, in-memory Postgres) |
| `TEST_DATABASE_URL=postgres://… npm test` | Also run the real-PostgreSQL integration test |
| `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e` | Browser tests (desktop + mobile) against a production build |
| `npm run check` | lint + typecheck + unit tests + build |
| `BEYOND_EVAL=1 npm run eval:beyond` | Opt-in: compare Beyond the System with standard sessions on real models (spends budget) |

## What you can do

**Council & Chronicle** (`/`, `/sessions/:id`)
- The home page shows the Primes, your outcome tiles and the **Chronicle** of major decisions and world milestones.
- **The charter** (Settings) is the Primes' standing mission, given to every Prime as trusted context.
- Ask a question and watch the chamber live: who is preparing, speaking, reviewing, agreeing, challenging, blocked or offline, plus animated links showing who responds to whom.
- Read the synchronized transcript. Each member's published contribution expands to show rationale, evidence, assumptions and critiques (never hidden chain-of-thought).
- Act as Prime: **stop**, **request another round**, **challenge a claim**, **address one member**, **exclude/re-include** a member, **override** the decision.
- Compare the **initial vs final** answer.
- Choose **⟁ Beyond the System** to have the Primes map the current system, separate real constraints from changeable conventions, propose structurally different alternatives (including one that reframes the problem), attack them, and design the smallest reversible experiment. Every Prime carries this lens in ordinary sessions too, and uses it only when it matters.
- Track elapsed time, tokens and **estimated** cost.
- **Replay** any finished session on its timeline.

**Primes** (`/members`): give each Prime its own model family where possible (the council warns when Primes share a model); configure providers (status: available, configured, unavailable, not configured, disabled, demo), check them live, and choose each seat's role, persona, provider and model.

**Settings** (`/settings`): rounds, concurrency, token, timeout, retry, session time and spending limits; the model price table; autonomy switches and the global pause.

**Memory** (`/memory`)
- Inspect, add, edit, disable and delete what the council may use.
- Explicitly import notes. Imported items start disabled until you review them.
- Nothing is read from other apps.
- **Suggested discussions** (opt-in) propose topics from your approved interests and from unresolved points in past sessions. Each shows why it was suggested and what it is based on.
- **Background sessions** (opt-in, off by default) only run topics you allowed. They have their own daily cap, interval and budget, and a one-click global pause.

**World** (`/world`)
- A deterministic simulated community with a fictional economy:
  - inhabitants with roles, skills, goals, homes, workplaces and relationships;
  - production, a market, trade and a treasury;
  - projects proposed by inhabitants;
  - growth and guilds within your limits.
- Projects above a threshold go to the **council docket**. Ask the council to deliberate (a linked session), or decide yourself. Decisions enter the world as explicit events.
- Run, pause, step and change speed; take snapshots and restore them; replay any stored tick.
- An animated map shows who is doing what.

**Discoveries** (`/discoveries`): every Beyond-the-System investigation, searchable and linked by recurring assumptions. Record what happened when you ran an experiment, mark which assumptions held, approve follow-ups, revisit an investigation to build on it, or ask the council to **examine itself** (what it proposes about its own design is a record for you — never applied automatically). Details in [docs/BEYOND_THE_SYSTEM.md](docs/BEYOND_THE_SYSTEM.md).

**Improvements** (`/improvements`): the history of changes, with purpose, validation and remaining issues, plus the status of the daily improvement job.

## Architecture (short)

```
src/
  app/                 Next.js App Router pages + route handlers (/api/*)
  proxy.ts             access control (local-only by default, token for remote)
  lib/
    db/                Drizzle schema, Postgres/PGlite client, migrations in /drizzle
    providers/         adapters (anthropic, openai, google, openai-compatible, ollama, demo),
                       registry/status, pricing, HTTP with timeout/cancel/redaction
    council/           orchestrator (bounded pipeline), budget guard, prompts, parsing,
                       event bus, reducer (events → chamber state), service layer
    security/          rate limiting, secret redaction
    memory/            memory CRUD + reviewed imports
    autonomy/          suggestions, bounded background scheduler
    sim/               deterministic world engine, store (events, ticks, snapshots), runner
    improvements/      auto-merge eligibility rules, improvement log
  instrumentation.ts   boot: recover sessions, start scheduler + world runner
  components/          chamber, transcript, final answer, memory, world map, settings UIs
tests/unit             orchestration, failures, cancellation, spend, adapters, reducer
tests/integration      real PostgreSQL (opt-in)
tests/e2e              Playwright: demo flow, provider failure, stop, replay, mobile, a11y, security
```

The core flow:

1. `POST /api/sessions` creates a session and starts a `CouncilRun` in the server process.
2. The run emits typed events (`phase.started`, `member.state`, `member.message`, `member.link`, `usage.updated`, `session.final`, …). Each event is first appended to `session_events`, then published on an in-process bus.
3. `GET /api/sessions/:id/stream` is a resumable Server-Sent Events stream. It replays from the database, then follows the bus, de-duplicating by sequence number.
4. The browser folds events through a pure reducer (`src/lib/council/reducer.ts`). The same reducer drives the live view and the replay timeline.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Providers are covered in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Security model

- **Local-first.** Servers bind to `127.0.0.1`, and the proxy refuses requests addressed to any non-loopback host unless `SIMLIFE_ACCESS_TOKEN` is set. This also defeats DNS rebinding.
- **Remote access.** Before exposing the app, set `SIMLIFE_ACCESS_TOKEN`. The Prime then signs in at `/login` and receives an httpOnly cookie; API clients can send `Authorization: Bearer <token>`.
- **Write protection.** All writes require the `x-simlife-request: 1` header, which cross-site pages cannot send without a CORS preflight. Writes are also rate-limited, and model-calling actions have a tighter limit.
- **Keys.** Keys live only in the server environment. The database stores the *name* of each key's variable, and responses only say whether a key is present. Provider errors are redacted.
- **Untrusted content.** Member output, imported content and retrieved pages are wrapped as untrusted data in prompts. Members can only return whitelisted JSON fields. Limits, permissions and spending are enforced in code, so text cannot change them.
- **Limits.** Provider timeouts, bounded retries, cancellation of queued and in-flight calls, and per-session and daily spending reservations.
- **Audit.** Records are kept for sessions, Prime actions, settings and configuration changes.

## Project status

- [docs/VISION.md](docs/VISION.md) — product vision and principles
- [docs/ROADMAP.md](docs/ROADMAP.md) — staged roadmap and milestone status
- [docs/BACKLOG.md](docs/BACKLOG.md) — daily improvement backlog
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — provider integration
- [docs/DAILY_IMPROVEMENT.md](docs/DAILY_IMPROVEMENT.md) — the daily coding workflow. **Inactive until set up.**
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution rules

## Remote access

The app is local-only by default. To reach it from another device:
1. Set `SIMLIFE_ACCESS_TOKEN` to a long random value.
2. Bind to a reachable address (`next start -H 0.0.0.0`).
3. Put it behind HTTPS.

The proxy then requires the token (sign in at `/login`). Without a token, requests that are not addressed to localhost are refused.
