#!/usr/bin/env bash
# One-time setup: configure branch protection on `develop` and `main` so the
# merge gate in AGENTS.md §7 is enforced by GitHub itself, not just by the
# agent following instructions. Run once after the repo exists and has had
# at least one CI run (so the check names below actually exist to select).
#
# Requires: `gh auth login` already done, and admin rights on the repo.
#
# Usage: ./scripts/setup-branch-protection.sh <owner>/<repo>

set -euo pipefail

REPO="${1:?Usage: $0 <owner>/<repo>}"

protect() {
  local branch="$1"
  local require_review="$2" # "true" or "false"

  echo "Protecting $REPO@$branch (required review: $require_review)..."

  local reviews_json="null"
  if [ "$require_review" = "true" ]; then
    reviews_json='{"required_approving_review_count":1,"dismiss_stale_reviews":true}'
  fi

  gh api \
    --method PUT \
    "repos/${REPO}/branches/${branch}/protection" \
    --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test", "benchmark-gate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": ${reviews_json},
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
}

# develop: gate is CI + benchmark, no required human review — this is the
# branch AGENTS.md §7/§9 expects to move via /phase-merge without a human
# clicking "approve" every time, as long as checks are green.
protect "develop" "false"

# main: same mechanical checks, PLUS a required human review, as the second
# (redundant, deliberate) safeguard alongside /release's own confirmation
# step in AGENTS.md §8.
protect "main" "true"

echo
echo "Done. Note: 'benchmark-gate' will show as a required check even on"
echo "phase 0/1 PRs, where that job intentionally no-ops (skips itself)."
echo "GitHub treats a skipped required check as passing, so this is fine —"
echo "just don't remove the job from the workflow file, or the branch"
echo "protection rule will block merges waiting for a check that never runs."
