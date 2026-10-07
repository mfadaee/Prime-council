# Daily improvement workflow

**Current status: inactive.** Nothing in this repository can make a coding agent run tomorrow on its own. That needs an external scheduler plus an authenticated coding runtime, and neither is switched on yet.

## What a run does

Each run is one bounded job:

1. **Reads** the roadmap, backlog, recent commits, recent CI results and open PRs.
2. **Selects** one useful improvement. A failing check on `main` comes first, then the backlog, then a defect it can demonstrate with a test.
3. **Implements** it on `improve/<date>-<slug>`, with tests, and appends an entry to `data/improvements.json` (shown at `/improvements`).
4. **Validates** with `npm run lint`, `typecheck`, `test`, `build`, plus `test:e2e` when the UI or API changed.
5. **Opens a PR** whose body includes the validation evidence, a risk label (`low-risk` or `needs-review`) and any remaining issues.
6. **Auto-merges** only if all of the following hold:
   - The `auto-merge` workflow judges the PR eligible, using rules read from the **base** branch (`src/lib/improvements/eligibility.ts`).
   - `main` requires the CI check.
   - All required checks have passed. GitHub enforces this; nothing is bypassed.
7. **Records** what changed, why, and what remains, in the PR and in the improvement log.

The agent's full instructions are in `scripts/daily-improvement/PROMPT.md`.

### Always reviewable (never auto-merged)

Changes that touch any of these stay reviewable pull requests:

- secrets and `.env` files;
- authentication (`src/proxy.ts`, `/api/auth`, `/login`) and security controls;
- the request guard;
- spending (budget guard, pricing, limit bounds) and provider adapters, which can spend real money;
- schema and migrations;
- dependencies;
- workflows;
- the improvement job and eligibility rules themselves.

PRs over 400 changed lines or 15 files, or that delete files, also stay reviewable.

### Limits

- **Spend:** `--max-budget-usd`, default $3 per run. Change it with the `DAILY_IMPROVEMENT_BUDGET_USD` repository variable.
- **Runtime:** a 45-minute job timeout.
- **Concurrency:** one run at a time.
- **Tools:** only file edits, npm scripts, git, and a few `gh` read/PR commands.
- **Notifications:** none by email. Status lives in the PR, the Actions run and `/improvements`.

## Option A — GitHub Actions (recommended)

1. Make sure the repository exists and the code is pushed, then run the one-time setup:

   ```bash
   ./scripts/setup-github.sh    # creates/pushes the repo, labels, auto-merge setting, branch protection
   ```

   Branch protection on private repositories requires a paid GitHub plan. Without it, the auto-merge workflow refuses to enable auto-merge, and every PR stays reviewable.

2. Add the secrets and variables. Scripts never set secrets for you.

   ```bash
   gh secret set ANTHROPIC_API_KEY
   gh secret set IMPROVEMENT_GH_TOKEN     # fine-grained PAT: Contents + Pull requests read/write on this repo
   gh variable set IMPROVEMENT_PR_AUTHOR --body mfadaee
   ```

   The PAT is needed because pull requests opened with the default `GITHUB_TOKEN` do not trigger CI. Without CI, required checks never run and nothing could merge.

3. Turn it on:

   ```bash
   gh variable set DAILY_IMPROVEMENT_ENABLED --body true
   ```

   To run it once by hand, use **Actions → Daily improvement → Run workflow**. To pause it, set the variable to `false`.

## Option B — your own machine (cron)

```cron
17 6 * * *  /path/to/simulated-life/scripts/daily-improvement/run-local.sh >> ~/simulated-life-daily.log 2>&1
```

This needs the Claude Code CLI (`claude`) and `gh`, both authenticated. Spend and time are capped with `MAX_BUDGET_USD` and `MAX_MINUTES`. Auto-merge still happens only through the GitHub workflow above.

## Option C — Claude Code scheduled routines

If your Claude account offers scheduled cloud sessions (Routines), you can schedule a daily session on this repository using the prompt in `scripts/daily-improvement/PROMPT.md`. The same PR and auto-merge rules apply.

## Verification status

- **Eligibility rules:** covered by unit tests (`tests/unit/eligibility.test.ts`). The CLI was dry-run locally.
- **Workflow YAML:** parses.
- **Not yet run:** none of the workflows have run, because the GitHub repository had not been created when they were written. Treat the first run as a test and watch it.
