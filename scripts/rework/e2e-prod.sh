#!/bin/sh
# Builds the COMMITTED HEAD in a clean worktree outside the synced Desktop folder, serves it on a free-ish port against the
# throwaway database, runs Playwright against it, then stops the server. Uncommitted changes are NOT tested: commit first.
# Why: a dev server in a cloud-synced folder is slow and flaky; a production build of a clean checkout is fast and ties the
# result to an exact commit.   Usage: scripts/rework/e2e-prod.sh e2e/rework/piano.spec.ts --project=desktop --workers=1
set -e
ROOT=$(git rev-parse --show-toplevel)
W=/private/tmp/bnp-e2e
PORT=${E2E_PORT:-3307}
DB=${E2E_DATABASE_URL:-postgresql://yisehakberhanu@127.0.0.1:5433/bnp_rework_verify?schema=public}
case "$DB" in *verify*|*test*) ;; *) echo "Refusing: E2E_DATABASE_URL must name a verify/test database"; exit 2;; esac
pkill -f "next start -p $PORT" 2>/dev/null || true
git worktree remove --force "$W" 2>/dev/null || rm -rf "$W"
git worktree add -f --detach "$W" HEAD >/dev/null
echo "Testing commit $(git -C "$W" rev-parse --short HEAD)"
ln -sfn "$ROOT/node_modules" "$W/node_modules"
cp "$ROOT/.env" "$W/.env"
cd "$W"
DATABASE_URL="$DB" DIRECT_URL="$DB" npx prisma generate >/dev/null 2>&1
DATABASE_URL="$DB" DIRECT_URL="$DB" npx next build >/tmp/e2e-build.log 2>&1 || { tail -20 /tmp/e2e-build.log; exit 1; }
(DATABASE_URL="$DB" DIRECT_URL="$DB" NEXTAUTH_URL="http://localhost:$PORT" nohup npx next start -p "$PORT" >/tmp/e2e-server.log 2>&1 &)
i=0; until [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://localhost:$PORT/login")" = "200" ]; do i=$((i+1)); [ $i -gt 60 ] && { echo "server did not start"; exit 1; }; sleep 2; done
cd "$ROOT"
set +e
E2E_BASE_URL="http://localhost:$PORT" E2E_DATABASE_URL="$DB" npx playwright test "$@"
STATUS=$?
pkill -f "next start -p $PORT" 2>/dev/null || true
exit $STATUS
