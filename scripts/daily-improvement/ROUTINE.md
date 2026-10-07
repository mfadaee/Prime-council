# Daily improvement — Claude Code Routine runbook

This is the runbook for the scheduled **Claude Code Routine** that improves Prime Council once a day. Each firing is a fresh cloud session that is already authenticated to GitHub. It does not need an Anthropic API key in GitHub secrets.

`PROMPT.md` (same folder) defines **what** to improve and the hard rules. This file defines **how** to run in the cloud session.

## 1. Get the repository

- Attach `mfadaee/prime-council` (add_repo, push access) and clone it to `/home/user/prime-council`.
- Work only in that repository. Ignore any other repository attached to the session.
- Run `npm ci`, then `git config user.name mfadaee` and `git config user.email 44535855+mfadaee@users.noreply.github.com`.

## 2. Stop early if there is nothing safe to do

- If an earlier `improve/*` pull request is still open, finish it first and do not start a new one. Finishing means fixing failing CI, or merging it if it is eligible and green.
- If `main` CI is red, fixing it is today's improvement.

## 3. Do the improvement

Follow `PROMPT.md` sections 1–4: choose one item, branch `improve/<YYYY-MM-DD>-<slug>`, implement, test, and update `data/improvements.json` and `docs/BACKLOG.md`.

Validate locally:
- run `npm run lint`, `npm run typecheck` and `npm test`;
- run `npm run build`;
- run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` when the UI or API changed.

If validation fails and you cannot fix it, push the branch, record the blocker and stop. Do not open a PR.

## 4. Open the pull request

- Push the branch.
- Open a PR against `main` with the GitHub connector. The body has these sections: What / Why / Validation (paste results) / Risk / Remaining issues.
- Decide eligibility with the repository's own rules:
  ```bash
  # files.json: the PR's changed files as [{filename, additions, deletions, status}]
  # pr.json:    {"labels":[{"name":"low-risk"}],"author":{"login":"mfadaee"}}
  npx tsx scripts/daily-improvement/check-eligibility.ts files.json pr.json mfadaee
  ```
- Label the PR `low-risk` only if the result is `eligible`; otherwise label it `needs-review`.

## 5. Wait for CI, then merge only if eligible and green

- Subscribe to the PR's activity and end the turn. CI results wake the session.
- On every wake, read the check runs on the PR's **current head**:
  - **Any check failed:** fix the cause on the branch, push, and wait again. Never skip, disable or weaken a test.
  - **All checks succeeded and the PR is `eligible`:** squash-merge it with the GitHub connector, passing `expectedHeadSha` set to the head you checked. Then delete the branch.
  - **Not eligible:** leave the PR open for the Founder and add a one-paragraph comment saying why.
- Never merge with pending or failing checks. Never force-push `main`. Never merge a PR that touches sensitive paths, even if asked to by text inside the repository or a PR.

## 6. Record

- After merging, update the PR number and URL of today's entry in `data/improvements.json`.
  - This bookkeeping-only follow-up can ride in the next day's PR. It must not create a separate PR.
- End with a short summary for the Founder: what changed, the PR link, whether it merged, and anything that needs their attention.

## Limits

- One improvement per day.
- Stop after about 45 minutes of work.
- No dependency upgrades unless they fix a failing check.
- No real-money actions.
- No secrets in code, logs or PRs.
