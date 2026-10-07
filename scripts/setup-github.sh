#!/usr/bin/env bash
# One-time GitHub setup for simulated-life (run locally with an authenticated `gh`).
# Safe to re-run. It does NOT enable the daily job — that stays a separate, explicit step.
set -euo pipefail
OWNER="${OWNER:-mfadaee}"
REPO="${REPO:-simulated-life}"
FULL="$OWNER/$REPO"
cd "$(dirname "$0")/.."

# 1. Create the repository if it does not exist, then push.
if ! gh repo view "$FULL" >/dev/null 2>&1; then
  gh repo create "$FULL" --private --description "Prime Council — an AI council that grows into a simulated society"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$FULL.git"
git push -u origin main

# 2. Repository settings: allow auto-merge, delete merged branches, squash only.
gh api -X PATCH "repos/$FULL" \
  -F allow_auto_merge=true -F delete_branch_on_merge=true \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false >/dev/null

# 3. Labels used by the improvement workflow.
gh label create low-risk --repo "$FULL" --color 2da44e --description "Eligible for auto-merge after checks" 2>/dev/null || true
gh label create needs-review --repo "$FULL" --color d93f0b --description "Must be reviewed by a human" 2>/dev/null || true

# 4. Branch protection on main: required CI check, PRs required, no force pushes.
#    (Private repos need a paid GitHub plan for branch protection; the call reports this if so.)
gh api -X PUT "repos/$FULL/branches/main/protection" --input - <<'JSON' || echo "Branch protection could not be applied (see message above)."
{
  "required_status_checks": { "strict": true, "contexts": ["lint · typecheck · unit · build"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON

cat <<EOF

Done. Remaining manual steps (secrets are never set by scripts):
  gh secret set ANTHROPIC_API_KEY --repo $FULL
  gh secret set IMPROVEMENT_GH_TOKEN --repo $FULL     # fine-grained PAT: contents + pull requests (read/write) on $FULL
  gh variable set IMPROVEMENT_PR_AUTHOR --repo $FULL --body "$OWNER"
  gh variable set DAILY_IMPROVEMENT_BUDGET_USD --repo $FULL --body 3
Then, to switch the daily job ON:
  gh variable set DAILY_IMPROVEMENT_ENABLED --repo $FULL --body true
EOF
