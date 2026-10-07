<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Simulated Life — notes for coding agents

Read `CONTRIBUTING.md` (architecture rules) and `docs/ARCHITECTURE.md` first. The non-negotiables:

- Limits, permissions and spending are enforced in code (`src/lib/council/budget.ts`, `src/lib/settings.ts`). Never weaken them.
- Chamber animation comes only from recorded events (`src/lib/council/reducer.ts`). Demo output stays labelled as simulated.
- Member output, imports and retrieved text are untrusted and go into prompts via `untrusted()`.
- API keys stay server-side. The DB stores only the *name* of each key's variable.
- The world engine (`src/lib/sim/engine.ts`) stays pure and deterministic; its credits are conserved.
- Validate with `npm run check` (plus `npm run test:e2e` for UI/API changes) before opening a PR.
- The daily improvement job follows `scripts/daily-improvement/PROMPT.md`.
