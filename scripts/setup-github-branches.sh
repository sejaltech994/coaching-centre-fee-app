#!/usr/bin/env bash
# One-time GitHub setup for the branch-per-environment flow.
# See docs/branching-and-environments.md.
#
# Needs: the GitHub CLI (`brew install gh`), logged in with `gh auth login`
# as a repo admin. Branch protection on a PRIVATE repo needs GitHub Pro,
# Team or Enterprise; on GitHub Free the protection calls fail with 403.
#
# Usage: scripts/setup-github-branches.sh [owner/repo]
#   REVIEWS=1 scripts/setup-github-branches.sh   # require 1 approving review
set -euo pipefail

REPO="${1:-sejaltech994/coaching-centre-fee-app}"
# Approvals needed on promotion PRs. 0 suits a solo developer (you cannot
# approve your own PR); raise it once there is a second reviewer.
REVIEWS="${REVIEWS:-0}"

echo "Repo: $REPO"

# 1. Environment branches, all starting from main.
main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
for branch in develop sit uat; do
  if gh api "repos/$REPO/git/ref/heads/$branch" >/dev/null 2>&1; then
    echo "Branch $branch exists"
  else
    gh api -X POST "repos/$REPO/git/refs" -f ref="refs/heads/$branch" -f sha="$main_sha" >/dev/null
    echo "Created branch $branch"
  fi
done

# 2. develop is where work lands, so make it the default branch.
gh api -X PATCH "repos/$REPO" -f default_branch=develop >/dev/null
echo "Default branch: develop"

# 3. GitHub Environments the deploy workflow publishes to.
for env in dev sit uat prod; do
  gh api -X PUT "repos/$REPO/environments/$env" >/dev/null
  echo "Environment $env ready"
done

# 4. develop: direct pushes allowed, but no force-push or deletion.
gh api -X PUT "repos/$REPO/branches/develop/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "Protected develop (direct push allowed)"

# 5. sit, uat, main: changes only through a PR that passes CI and the
#    promotion guard. enforce_admins stops the owner bypassing it too.
for branch in sit uat main; do
  gh api -X PUT "repos/$REPO/branches/$branch/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ["Build web", "Promotion source"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": $REVIEWS, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
  echo "Protected $branch (PR + pipeline only)"
done

echo
echo "Done. In Settings > Environments > prod, add yourself under"
echo "'Required reviewers' so production deploys wait for approval."
