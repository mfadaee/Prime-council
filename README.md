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

**With Docker** (nothing else to install):

```bash
git clone https://github.com/mfadaee/prime-council && cd prime-council
docker compose up --build    # http://localhost:3000 — demo mode, no keys needed
```

Data is kept in the `prime-data` volume. To use real models, put keys in `.env.local` (below) and run the same command. Inside the container, a model server on your machine is `http://host.docker.internal:<port>`, not `localhost`.

**In a dev container** (VS Code or GitHub Codespaces):

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/mfadaee/prime-council)

VS Code: open the folder and choose **Reopen in Container**. The container installs dependencies, starts `npm run dev:demo` and forwards port 3000 (demo mode, no keys).
In Codespaces the forwarded port is private to your GitHub account. If the page says *"Prime Council is local-only"*, the forwarded request did not arrive as `localhost`: add `SIMLIFE_ACCESS_TOKEN=<long random value>` (`openssl rand -hex 32`) to `.env.local` in the codespace, restart `npm run dev:demo`, and sign in at `/login`. The access check is never loosened for Codespaces.

**With Node.js** ≥ 20.9:

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

## What you can do

**Council & Chronicle** (`/`, `/sessions/:id`)
- The home page shows the Primes, your outcome tiles and the **Chronicle** of major decisions and world milestones.
- **The charter** (Settings) is the Primes' standing mission, given to every Prime as trusted context.
- Ask a question and watch the chamber live: who is preparing, speaking, reviewing, agreeing, challenging, blocked or offline, plus animated links showing who responds to whom.
- Read the synchronized transcript. Each member's published contribution expands to show rationale, evidence, assumptions and critiques (never hidden chain-of-thought).
- Act as Prime: **stop**, **request another round**, **challenge a claim**, **address one member**, **exclude/re-include** a member, **override** the decision.
- Compare the **initial vs final** answer.
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

**Improvements** (`/improvements`): the history of changes, with purpose, validation and remaining issues, plus the status of the daily improvement job.

## How it compares

Several good open-source projects put more than one model, or many agents, to work together. Prime Council takes ideas from them and combines them in one local app. Pick the one that fits what you want to do.

| Project | What it is | How Prime Council differs |
|---|---|---|
| [karpathy/llm-council](https://github.com/karpathy/llm-council) | A small web app: several models answer through OpenRouter, review and rank each other's answers anonymously, then a "chairman" model writes the final answer. Its author calls it a weekend hack ([write-up](https://www.analyticsvidhya.com/blog/2025/12/llm-council-by-andrej-karpathy/)). | Same council idea, plus: direct provider adapters (Anthropic, OpenAI, Gemini, Ollama, any OpenAI-compatible server), a keyless demo mode, controls while the council deliberates (stop, challenge, address one member, override), replay, spending limits enforced in code, and persistent memory. |
| [Mixture-of-Agents](https://www.together.ai/blog/together-moa) (Together AI) | A research method and reference code: layers of "proposer" models whose answers an "aggregator" model combines into one. | MoA is a technique to raise answer quality. Prime Council is an application you watch and steer, with critique and resolve rounds you can see. |
| [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) | An MIT-licensed starter kit for a virtual town where AI characters live and chat, inspired by the *Generative Agents* paper. Runs on Convex, with Ollama by default. | Prime Council's world is a deterministic economy that you can snapshot and replay. Its projects go to a council of real models for decisions, rather than being a chat sandbox. |
| Agent frameworks (AutoGen, CrewAI, LangGraph…) | Libraries for building your own multi-agent pipelines in code. | Prime Council is a finished app, not a framework. You configure it in the UI; you don't write orchestration code. |

The comparison reflects each project's public description at the time of writing. Corrections are welcome: open an issue or PR.

## FAQ

**Do I need API keys to try it?** No. With no keys, every seat uses the built-in demo provider. The full pipeline runs, and its output is labelled **Simulated**. Add keys later in `.env.local`.

**Which models does it support?** Anthropic, OpenAI and Google Gemini directly; local models through Ollama; and anything that speaks the OpenAI `/v1/chat/completions` API (vLLM, LM Studio, llama.cpp, OpenRouter…). See [docs/PROVIDERS.md](docs/PROVIDERS.md).

**Can it run up a big bill?** Before each model call, the app reserves the call's worst-case estimated cost. It refuses the call if that would pass the per-session or daily limit, which also covers calls running in parallel. By default it refuses models that have no price in Settings. Costs are estimates, so this limits how much new work starts; it is not a hard billing cap. Set a spending limit with your provider as well.

**Does it need a database server?** No. It uses embedded PostgreSQL (PGlite) by default. A real PostgreSQL server is optional.

**Can I expose it on a network?** It is local-only by default. See [Remote access](#remote-access): set `SIMLIFE_ACCESS_TOKEN` and put it behind HTTPS.

**Are the agents people?** No. Primes are AI models. The world's inhabitants are deterministic simulations.

## Architecture (short)

How one council session runs (`src/lib/council/orchestrator.ts`):

```mermaid
flowchart LR
  Q["Founder's question"] --> I["Interpret<br/>(Chair)"]
  I --> A["Analyst"] & S["Skeptic"] & R["Researcher"] & B["Builder"]
  subgraph IND["Independent contributions: in parallel, blind"]
    A
    S
    R
    B
  end
  A & S & R & B --> C["Critique"]
  C --> RS["Resolve<br/>revise · defend · concede"]
  RS -- "material challenge left<br/>and rounds remain" --> C
  RS --> SY["Synthesize<br/>(Synthesizer)"]
  SY --> F["Final answer<br/>+ preserved disagreement"]
  P(["Founder: stop · another round ·<br/>challenge · address · exclude · override"]) -.-> C
  G[["Budget guard: reserve worst-case cost<br/>before every model call"]] -.-> IND
```

How events reach the browser, live and on replay:

```mermaid
flowchart LR
  UI["Browser"] -- "POST /api/sessions" --> RUN["CouncilRun<br/>(server process)"]
  RUN -- "calls" --> PR["Provider adapters<br/>Anthropic · OpenAI · Gemini ·<br/>OpenAI-compatible · Ollama · demo"]
  RUN -- "1 append" --> DB[("session_events<br/>Postgres / PGlite")]
  RUN -- "2 publish" --> BUS["In-process bus"]
  DB -- "replay from seq" --> SSE["GET /api/sessions/:id/stream<br/>(SSE, resumable)"]
  BUS -- "follow live" --> SSE
  SSE --> RED["reducer(events) → chamber state<br/>same reducer for live and replay"]
  RED --> UI
```

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
