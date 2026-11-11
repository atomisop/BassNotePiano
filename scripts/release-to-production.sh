#!/usr/bin/env bash
# Puts main live. Netlify deploys the `release` branch to production, so this moves `release` forward to the newest commit on main,
# and only if CI passed on that exact commit. It never rewinds or force-pushes: if `release` holds anything main does not, it stops.
# Run from a checkout of main (the workflow does). See docs/RELEASES.md.
#
# Test knobs (the test sets them so it does not wait): RELEASE_CI_WAIT_TRIES, RELEASE_CI_WAIT_SECONDS.
set -euo pipefail

TRIES="${RELEASE_CI_WAIT_TRIES:-30}"
PAUSE="${RELEASE_CI_WAIT_SECONDS:-20}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

sha=$(git rev-parse HEAD)

# 1. What is live now, and what would this ship?
if git ls-remote --exit-code --heads origin release >/dev/null 2>&1; then
  git fetch --quiet origin release
  live=$(git rev-parse FETCH_HEAD)
  if [ "$live" = "$sha" ]; then
    echo "Nothing new: release is already at ${sha:0:7}."
    echo "Nothing new to release. The live site is already at ${sha:0:7}." >>"$SUMMARY"
    exit 0
  fi
  if ! git merge-base --is-ancestor "$live" "$sha"; then
    echo "::error::The release branch has commits that main does not have, so it cannot be moved forward safely. Nothing was changed."
    exit 1
  fi
  shipping=$(git log --oneline "$live..$sha")
else
  echo "There is no release branch yet: this first run creates it from main."
  shipping=$(git log --oneline -1 "$sha")
fi

# 2. CI must have passed on this exact commit. Wait for it if it is still running (a fix merged a minute ago).
run=""
for _ in $(seq 1 "$TRIES"); do
  run=$(gh run list --workflow ci.yml --branch main --commit "$sha" --limit 1 --json databaseId,status --jq '.[0] | select(. != null) | "\(.databaseId) \(.status)"' || true)
  [ -n "$run" ] && break
  sleep "$PAUSE"
done
if [ -z "$run" ]; then
  echo "::error::CI has not started for ${sha:0:7}, so it was not released. Run this again in a few minutes."
  exit 1
fi
id=${run% *}
status=${run#* }
if [ "$status" != "completed" ]; then
  echo "CI is still running for ${sha:0:7}: waiting for it."
  gh run watch "$id" --interval 30 --exit-status >/dev/null || true
fi
conclusion=$(gh run view "$id" --json conclusion --jq .conclusion)
if [ "$conclusion" != "success" ]; then
  echo "::error::CI did not pass on ${sha:0:7} (result: ${conclusion:-unknown}), so nothing was released. Fix main, then run this again."
  exit 1
fi

# 3. Fast-forward only: a plain push is refused by Git if it would rewrite anything.
git push origin "$sha:refs/heads/release"

{
  echo "### Released to production: ${sha:0:7}"
  echo
  echo "Netlify now builds it (it skips the build when only docs or tests changed)."
  echo
  echo '```'
  echo "$shipping"
  echo '```'
} >>"$SUMMARY"
echo "Released ${sha:0:7}:"
echo "$shipping"
