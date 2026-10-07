#!/usr/bin/env bash
# Run the daily improvement job on your own machine with the Claude Code CLI,
# e.g. from cron:  17 6 * * *  /path/to/simulated-life/scripts/daily-improvement/run-local.sh
#
# Requires: claude (Claude Code CLI, authenticated), gh (authenticated), node 20.9+.
# Limits: MAX_BUDGET_USD (default 3) and MAX_MINUTES (default 45).
set -euo pipefail
cd "$(dirname "$0")/../.."

MAX_BUDGET_USD="${MAX_BUDGET_USD:-3}"
MAX_MINUTES="${MAX_MINUTES:-45}"
LOG_DIR=".daily"
mkdir -p "$LOG_DIR"

git fetch origin main --quiet
git checkout main --quiet
git pull --ff-only --quiet origin main
npm ci --silent

git log --oneline -30 > "$LOG_DIR/recent-commits.txt"
gh run list --limit 15 --json name,conclusion,headBranch,createdAt > "$LOG_DIR/recent-runs.json" || echo "[]" > "$LOG_DIR/recent-runs.json"
gh pr list --state open --json number,title,headRefName,labels > "$LOG_DIR/open-prs.json" || echo "[]" > "$LOG_DIR/open-prs.json"

timeout "${MAX_MINUTES}m" claude -p "$(cat scripts/daily-improvement/PROMPT.md)" \
  --max-budget-usd "$MAX_BUDGET_USD" \
  --allowedTools "Read,Edit,Write,Glob,Grep,Bash(npm run *),Bash(npm test*),Bash(npx playwright *),Bash(git *),Bash(gh pr create *),Bash(gh pr list *),Bash(gh pr edit *),Bash(gh run list *),Bash(date*)" \
  | tee "$LOG_DIR/run-$(date -u +%Y%m%dT%H%M%SZ).log"
