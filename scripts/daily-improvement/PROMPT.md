# Daily improvement run — instructions for the coding agent

You are making **one bounded, useful improvement** to Simulated Life and opening a pull request for it. Work only inside this repository.

## 1. Understand the current state (read-only)

- `docs/ROADMAP.md`, `docs/BACKLOG.md`, and the last entries of `data/improvements.json`.
- The context files `.daily/recent-commits.txt`, `.daily/recent-runs.json` (CI results) and `.daily/open-prs.json`.
- `AGENTS.md` and `CONTRIBUTING.md` for conventions.

## 2. Choose exactly one improvement

Choose in this priority order:

1. A failing check on `main`. Root-cause it; never skip or disable a test.
2. The first item in `docs/BACKLOG.md` → Ready that is not already covered by an open PR.
3. A real defect you can demonstrate with a failing test.

Prefer real improvements over cosmetic churn: no reformatting, no renames for their own sake, no dependency bumps unless they fix something.

Keep it small. Aim for **≤ 400 changed lines across ≤ 15 files**. If the chosen item is bigger, implement a coherent first slice and say so.

## 3. Implement on a new branch

- `git checkout -b improve/$(date -u +%Y-%m-%d)-<short-slug>`
- Follow the architecture rules in `AGENTS.md`:
  - limits and spending are enforced in code;
  - no fabricated data;
  - demo output stays labelled as simulated;
  - keys stay server-side.
- Add or update tests that prove the change.
- Append one entry to `data/improvements.json` with these fields:
  - `date`, `title`, `purpose`, `change`, `validation`, `risk` (`"low"` or `"review"`), `remainingIssues`;
  - `branch` and `pr` (`null` for now).
- In `docs/BACKLOG.md`, tick the item you completed.

## 4. Validate before opening the PR

Run and capture the results of:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e   # if the UI or API changed (uses Playwright Chromium)
```

If anything fails, fix it. If you cannot make it pass within this run, do **not** open a PR. Instead, record the attempt and the blocker in `data/improvements.json` on the branch, push the branch, and stop.

## 5. Open the pull request

- Commit with a concise message. Use the `Co-Authored-By` trailer conventions in `CONTRIBUTING.md`.
- `git push -u origin <branch>`.
- `gh pr create` with:
  - **Title:** the improvement title.
  - **Body:** `## What`, `## Why`, `## Validation` (paste the command results), `## Risk` and `## Remaining issues`.
- **Labels:**
  - `low-risk` **only if** every changed file is outside the sensitive areas listed in `src/lib/improvements/eligibility.ts`, and the change is small.
  - Otherwise `needs-review`.
  - Changes involving secrets, authentication, spending permissions, destructive migrations, dependencies, workflows or external publishing are **always** `needs-review`.

You never merge anything yourself. The `auto-merge` workflow decides eligibility using rules from the base branch. GitHub then merges only after every required check passes.

## Hard rules

- Never force-push, rewrite history on `main`, or bypass branch protection.
- Never read, print or commit secrets. Never add real payments, trading, purchases or external commitments.
- Never weaken a limit, the spending guard, authentication or the untrusted-content handling.
- Stop when the budget or time is nearly used. A smaller finished change is better than an unfinished large one.
