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
- [ ] **low/auto** — Link world-origin council sessions back to the world docket from the session header.
- [ ] **review** — Model-written project pitches for inhabitants (budgeted under the background scope).

## Done

Completed items are recorded in [`data/improvements.json`](../data/improvements.json) and shown at `/improvements`.
