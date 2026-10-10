# Changelog

All notable changes to Prime Council are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project is pre-1.0 (`0.1.0` in `package.json`) and has no tagged releases yet, so everything is under **Unreleased**, grouped by milestone. Milestone status lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## [Unreleased]

### Added — repository health
- Security policy (`SECURITY.md`), Dependabot config, pull request and issue templates, CodeQL code scanning, and this changelog.

### Added — world decision links (#2, 2026-10-07)
- Sessions the Primes held about a world decision link back to the world's decisions.

### Changed — Prime Council direction (#1, 2026-10-07)
- Renamed to Prime Council: you are the Founder, council seats are Primes, one per configured AI model family where possible, with a shared-model warning.
- Editable charter (Settings) given to every Prime as trusted context.
- Chronicle home page with outcome tiles, major decisions and world milestones; sessions the Primes start themselves open with the conversation hidden.
- Opt-in Prime governance: pending world decisions go to the Primes within a background budget and daily cap.
- Agents record which Prime created them; maximum population raised to 500 with bounded relationship state.
- `npm run typecheck` runs `next typegen` first, so fresh clones typecheck.

### Added — Milestone 4: continuous improvement (2026-10-07)
- CI: lint, typecheck, unit and PostgreSQL integration tests, build, Playwright e2e (desktop + mobile).
- Daily improvement workflow (off by default), auto-merge eligibility rules read from the base branch, `scripts/setup-github.sh`.
- Improvement history shown at `/improvements`; vision, roadmap, backlog and contributing docs.

### Added — Milestone 3: living society (2026-10-07)
- Deterministic, seeded world engine: inhabitants with roles, skills, goals, homes, workplaces and relationships.
- Closed fictional economy in integer cents (production, market, trade, treasury, levy and dividend) with credits conserved every tick.
- Inhabitant-proposed projects; large ones go to the council docket.
- Append-only world event log, per-tick replay, snapshots and restore; pause, step and speed controls; animated world map.

### Added — Milestone 2: persistent intelligence (2026-10-07)
- Memory screen with add, edit, delete, enable/disable and reviewed imports (imported items start disabled).
- Suggested discussions with reasons, and opt-in background sessions with their own cap, interval, budget and global pause.

### Added — Milestone 1: council MVP (2026-10-07)
- Bounded deliberation pipeline (interpret → independent → critique → resolve → synthesize), live council chamber, SSE streaming and replay.
- Prime controls: stop, another round, challenge, address one member, exclude/include, override, compare initial vs final.
- Provider adapters: Anthropic, OpenAI, Gemini, OpenAI-compatible, Ollama, plus a labelled demo provider.
- Spending controls with per-session and daily budgets; timeouts, bounded retries and cancellation.
- PostgreSQL via Drizzle (server or embedded PGlite) with automatic migrations.
- Local-only access by default, optional access token, CSRF header, rate limits, secret redaction and audit log.
