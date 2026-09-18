#!/usr/bin/env bash
# One-time repo bootstrap: git init, branches, remote, labels, protection.
# Run once from the repo root, after you've dropped these files in place.
#
# Requires: git, gh (authenticated), pnpm, node 22+.
# Usage: ./scripts/bootstrap.sh <owner>/<repo>

set -euo pipefail

REPO="${1:?Usage: $0 <owner>/<repo>}"

command -v gh >/dev/null || { echo "gh CLI not found. Install it first."; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found. corepack enable && corepack prepare pnpm@9 --activate"; exit 1; }

echo "==> Installing dependencies"
pnpm install

echo "==> Verifying the toolchain is green before the first commit"
pnpm lint
pnpm dep-check
pnpm typecheck
pnpm test

echo "==> Initializing git"
if [ ! -d .git ]; then
  git init -b main
fi

git add -A
git commit -m "chore: repo scaffold, architecture guardrails, and opencode automation (phase-0, M0)" || true

echo "==> Creating GitHub repo (skip if it already exists)"
gh repo create "$REPO" --private --source=. --remote=origin --push 2>/dev/null || {
  echo "    repo exists or remote already set; pushing instead"
  git remote add origin "https://github.com/${REPO}.git" 2>/dev/null || true
  git push -u origin main
}

echo "==> Creating develop from main"
git checkout -b develop 2>/dev/null || git checkout develop
git push -u origin develop

echo "==> Creating phase labels (benchmark-gate keys off these)"
for n in 0 1 2 3 4 5 6; do
  gh label create "phase:$n" --repo "$REPO" --color "1d76db" --description "Phase $n work" 2>/dev/null || true
done
gh label create "release" --repo "$REPO" --color "5319e7" --description "develop -> main release PR" 2>/dev/null || true

echo "==> Setting default branch to develop"
gh repo edit "$REPO" --default-branch develop

echo
echo "Next steps, in order:"
echo "  1. Open a trivial PR into develop so CI runs once — branch protection can"
echo "     only require status checks that GitHub has actually seen before."
echo "  2. ./scripts/setup-branch-protection.sh $REPO"
echo "  3. Confirm in Settings > Branches that 'test' and 'benchmark-gate' are the"
echo "     exact check names listed. If GitHub shows them differently, fix the"
echo "     context strings in setup-branch-protection.sh and re-run it."
echo "  4. Replace @OWNER in .github/CODEOWNERS with your GitHub handle."
echo "  5. Add ANTHROPIC_API_KEY under Settings > Secrets > Actions (only needed"
echo "     for the optional .github/workflows/opencode.yml)."
echo "  6. opencode  ->  /phase-start 0"
