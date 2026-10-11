# Improvement backlog

This is the queue the daily improvement job picks from: one bounded item per run. Prefer real fixes over cosmetic churn.

Each item carries its risk level and whether it may auto-merge:
- **low/auto:** may auto-merge after required checks pass.
- **review:** must stay a reviewable pull request.

Anything touching secrets, authentication, spending permissions, destructive migrations or external publishing is always **review**.

## Ready

- [ ] **low/auto** — Speed up unit tests by sharing one PGlite instance per test file, with per-test truncation.
- [ ] **low/auto** — Add a transcript search box (client-side filter over message text).
- [ ] **low/auto** — Show a per-member token/cost breakdown in the session view.
- [ ] **low/auto** — Keyboard shortcut help dialog (`?`) for Prime controls.
- [ ] **low/auto** — Export a session as Markdown (question, final answer, contributions, critiques).
- [ ] **low/auto** — Add a light colour scheme behind `prefers-color-scheme: light`, keeping contrast ≥ 4.5:1.
- [ ] **review** — Researcher web tools (fetch with allow-list, untrusted wrapping, audit records).
- [ ] **review** — Postgres `LISTEN/NOTIFY` event bus for multi-process deployments.
- [ ] **review** — Token streaming for adapters that support streamed output.
- [ ] **low/auto** — World map: show trade arrows between inhabitants and the market on evening ticks.
- [x] **low/auto** — Link world-origin council sessions back to the world docket from the session header.
- [ ] **review** — Model-written project pitches for inhabitants (budgeted under the background scope).

### Adoption (time to first run)

- [x] **review** — One-command Docker start: a `Dockerfile` (multi-stage, `next start -H 0.0.0.0 -p 3000` inside the container only) plus an `app` service in `docker-compose.yml` published on `127.0.0.1:3000`, demo mode by default. Browser requests still arrive as `localhost:3000`, so the loopback check in `src/proxy.ts` is unchanged. Review: changes the bind address inside the container.
- [ ] **review** — Dev container (`.devcontainer/devcontainer.json`: Node 22, `npm ci`, forward 3000, `npm run dev:demo`). Works as-is in local VS Code. GitHub Codespaces forwards requests with a `*.app.github.dev` host, which `src/proxy.ts` refuses without `SIMLIFE_ACCESS_TOKEN`, so document that step rather than loosening the check.
- [ ] **review** — Public read-only demo mode (`SIMLIFE_PUBLIC_DEMO=1`): forces the demo provider, never reads provider keys, allows only starting demo sessions and viewing, with the existing rate limits. This is what a hosted live demo would need. Touches access control, so review.
- [ ] **review** — `npx` launcher (`bin` entry that runs a prebuilt app in demo mode). Needs publishing to npm, which the owner does.
- [ ] **review** — MCP server mode: expose "ask the council" as an MCP tool so other agents can convene the Primes. Bounded by the existing budget guard.
- [ ] **low/auto** — `.env.example`: commented OpenAI-compatible presets for hosted providers (base URL + model variable names only), each base URL checked against the provider's own docs.

## Done

Completed items are recorded in [`data/improvements.json`](../data/improvements.json) and shown at `/improvements`.
