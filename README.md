# Simulated Life

An interactive **AI council** that deliberates for you — *the Prime* — and grows into a **persistent simulated society**.

You ask a question. The council meets in a chamber:

1. The Chair interprets the request.
2. Members answer independently, then critique each other.
3. Material disagreements are resolved.
4. The Synthesizer writes the best supported answer.

Every animation in the chamber is driven by a real backend event. Simulated (demo) activity is always labelled.

> Council members are AI models and inhabitants are simulations — not people and not conscious beings.

## Quick start

Requires Node.js ≥ 20.9.

```bash
npm install
npm run dev            # http://127.0.0.1:3000 — demo mode, embedded Postgres, no keys needed
```

To use real models, copy `.env.example` to `.env.local`, add one or more keys and restart. Then assign models to seats on the **Members** page and click "Check now" to verify each provider.

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

## What you can do

**Council mode** (`/`, `/sessions/:id`)
- Ask a question and watch the chamber live: who is preparing, speaking, reviewing, agreeing, challenging, blocked or offline, plus animated links showing who responds to whom.
- Read the synchronized transcript. Each member's published contribution expands to show rationale, evidence, assumptions and critiques (never hidden chain-of-thought).
- Act as Prime: **stop**, **request another round**, **challenge a claim**, **address one member**, **exclude/re-include** a member, **override** the decision.
- Compare the **initial vs final** answer.
- Track elapsed time, tokens and **estimated** cost.
- **Replay** any finished session on its timeline.

**Members** (`/members`): configure providers (status: available, configured, unavailable, not configured, disabled, demo), check them live, and choose each seat's role, persona, provider and model.

**Settings** (`/settings`): rounds, concurrency, token, timeout, retry, session time and spending limits; the model price table; autonomy switches and the global pause.

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
  components/          chamber, transcript, final answer, settings UIs
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

See [docs/ROADMAP.md](docs/ROADMAP.md) for milestones and [docs/BACKLOG.md](docs/BACKLOG.md) for the improvement backlog.
