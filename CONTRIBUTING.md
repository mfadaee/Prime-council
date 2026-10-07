# Contributing

Thanks for improving Prime Council. Contributors may be humans or coding agents; both follow the same rules.

## Workflow

1. Branch from `main`. Automated improvement branches use `improve/<date>-<slug>`.
2. Keep each change focused: one improvement per pull request.
3. Before opening a PR, run:
   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # when UI or API behaviour changes
   ```
4. Describe **what**, **why**, **validation** (command results) and **remaining issues** in the PR.
5. Label PRs `low-risk` or `needs-review` (see [docs/DAILY_IMPROVEMENT.md](docs/DAILY_IMPROVEMENT.md)). Never force-push `main` or bypass branch protection.

Commits are authored as the repository owner. Commits made with an AI assistant keep its `Co-Authored-By` trailer.

## Architecture rules

- **Limits live in code.**
  - Rounds, concurrency, tokens, timeouts, retries and spending are enforced in `src/lib/council/*` and `src/lib/settings.ts`.
  - Never rely on a prompt to enforce a limit or permission.
- **One reducer for the chamber.**
  - The UI renders council activity only from recorded events, via `src/lib/council/reducer.ts`.
  - Do not add animations that are not backed by an event.
- **Label simulation.**
  - Anything produced by the demo provider stays marked `simulated` end to end.
  - The world is a simulation with fictional resources only: no real payments, trading, purchases or external commitments.
- **Untrusted input.**
  - Member output, imported memory and retrieved pages go into prompts through `untrusted()`.
  - Only whitelisted, schema-validated fields of member output are used.
- **Secrets.**
  - Keys come from the server environment only.
  - Store the *name* of a key's variable, never its value.
  - Redact provider errors.
- **Additive schema.** Change `src/lib/db/schema.ts` additively, then run `npm run db:generate`. Never write destructive migrations without review.
- **Deterministic world.** `src/lib/sim/engine.ts` must stay pure and seeded. New rules need tests for:
  - determinism;
  - credit conservation;
  - non-negative stock.
- **No fabricated data.** No invented facts, sources, customers or history, and no built-in prices that were not verified.

## Next.js 16

This project uses Next.js 16 with Cache Components. Read `node_modules/next/dist/docs/` before relying on older patterns:
- middleware is `proxy.ts`;
- route handlers call `connection()` so they run at request time;
- client hooks that read the URL need a `<Suspense>` boundary.

## Tests

| Kind | Where | Notes |
|---|---|---|
| Unit | `tests/unit` | In-memory PGlite per test. Fake adapters script provider behaviour. |
| Integration | `tests/integration` | Set `TEST_DATABASE_URL` to a disposable PostgreSQL database. |
| End-to-end | `tests/e2e` | Runs against a production build with a fresh embedded database, in demo mode. |
