#!/usr/bin/env bash
#
# sync-eslint-mirror.sh — regenerate the standalone ESLint plugin mirror.
#
# The monorepo (this repo) is the SOURCE OF TRUTH. The plugin lives in eslint/.
# For consumers who want the clean one-liner
#
#     npm i -D github:nitsanavni/eslint-plugin-no-greater-than
#
# we mirror eslint/'s contents to the ROOT of a standalone public repo
# (https://github.com/nitsanavni/eslint-plugin-no-greater-than), so npm finds a
# root package.json. This script re-runs the subtree split and force-pushes it,
# adding a small banner to the mirror README so a casual cloner knows it's
# generated (and that tests/fixtures.test.js is monorepo-coupled — it requires
# ../../fixtures/cases.json, which only exists here; npm install never runs it).
#
# Usage:  scripts/sync-eslint-mirror.sh
# Run from a clean working tree on the monorepo's main branch.

set -euo pipefail

MIRROR_URL="https://github.com/nitsanavni/eslint-plugin-no-greater-than.git"
PREFIX="eslint"
SPLIT_BRANCH="eslint-only-sync"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# 1. Subtree split: produce a branch whose root is the eslint/ package.
git branch -D "$SPLIT_BRANCH" 2>/dev/null || true
git subtree split --prefix="$PREFIX" -b "$SPLIT_BRANCH"

# 2. Add a "generated mirror" banner on top of the split (one extra commit).
banner_tmp="$(mktemp)"
cat > "$banner_tmp" <<'BANNER'
> **This repo is a generated mirror.** It is published from the `eslint/`
> package of [nitsanavni/no-greater-than](https://github.com/nitsanavni/no-greater-than)
> via `scripts/sync-eslint-mirror.sh`. File issues/PRs against the monorepo.
>
> Consume it with one step (no clone needed):
>
> ```bash
> npm i -D eslint github:nitsanavni/eslint-plugin-no-greater-than
> ```
>
> Note: `tests/fixtures.test.js` requires `../../fixtures/cases.json`, which
> lives only in the monorepo, so it fails here — that's expected for the mirror
> (npm install never runs tests; the other two test files pass).

BANNER

worktree="$(mktemp -d)"
git worktree add -q "$worktree" "$SPLIT_BRANCH"
cat "$banner_tmp" "$worktree/README.md" > "$worktree/README.md.new"
mv "$worktree/README.md.new" "$worktree/README.md"
git -C "$worktree" add README.md
git -C "$worktree" -c commit.gpgsign=false commit -q -m "docs: mark as generated mirror; note fixtures test is monorepo-coupled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

# 3. Force-push the mirror's main.
git -C "$worktree" push --force "$MIRROR_URL" "$SPLIT_BRANCH:main"

# 4. Clean up.
git worktree remove --force "$worktree"
git branch -D "$SPLIT_BRANCH"
rm -f "$banner_tmp"

echo "Mirror synced -> $MIRROR_URL (main)"
