#!/bin/sh
# S9A.2b: verify the exact locally-built K'FIT image before GHCR login/push.
# Usage: verify-image.sh api|client|ops <image>
set -eu

kind=${1:?image kind required}
image=${2:?image reference required}

fail() {
  echo "verify-image $kind: $1" >&2
  exit 1
}

in_image() {
  docker run --rm --network none --entrypoint sh "$image" -c "$1"
}

user=$(docker image inspect --format '{{.Config.User}}' "$image")

# S9A.6: ops commands (scripts/ops/run.mjs) must run the image's compiled dist, never recompile into the read-only tree.
check_prebuilt_ops() {
  docker image inspect --format '{{json .Config.Env}}' "$image" | grep -q '"KFIT_OPS_PREBUILT=true"' ||
    fail "KFIT_OPS_PREBUILT=true missing"
  out=$(in_image 'cd /app/packages/server && node scripts/ops/run.mjs set-role 2>&1 || true')
  if echo "$out" | grep -qE 'npm run build|> tsc|build failed'; then fail "ops runner recompiles at run time"; fi
}

case "$kind" in
  api)
    [ "$user" = "node" ] || fail "api must run as node, got '$user'"
    [ "$(in_image 'node --version')" = "v22.23.5" ] || fail "api Node must be v22.23.5"
    in_image 'test -f /app/packages/server/scripts/prod/api-server.mjs &&
      test -d /app/packages/server/dist &&
      test -d /app/packages/shared/dist &&
      test ! -d /app/packages/server/src' || fail "api runtime layout"
    # drizzle-kit is dev-only (typescript is not: puppeteer pulls it in), so its presence means the prune was skipped.
    in_image 'test ! -e /app/node_modules/drizzle-kit &&
      test ! -e /app/packages/server/node_modules/drizzle-kit' || fail "api ships dev dependencies"
    in_image 'find /opt/puppeteer -type f -name chrome -perm -111 -print -quit | grep -q .' ||
      fail "Puppeteer Chrome missing"
    check_prebuilt_ops
    leaks=$(in_image 'find /app /opt/puppeteer -path "*/node_modules" -prune -o \( -name ".env*" -o -name "*.pem" -o -name "*.key" \) -print 2>/dev/null || true')
    [ -z "$leaks" ] || fail "forbidden runtime files: $leaks"
    ;;

  client)
    # nginx:alpine keeps the default root master process; this verifier checks the static-only runtime contract.
    in_image 'nginx -t' >/dev/null 2>&1 || fail "nginx -t failed"
    in_image 'test -f /usr/share/nginx/html/index.html &&
      find /usr/share/nginx/html/assets -type f -name "*.js" -print -quit | grep -q . &&
      test ! -e /app' || fail "client build/runtime layout"
    leaks=$(in_image 'find /usr/share/nginx/html -name ".env*" -o -name "*.pem" -o -name "*.key" 2>/dev/null || true')
    [ -z "$leaks" ] || fail "forbidden client files: $leaks"
    ;;

  ops)
    [ "$user" = "node" ] || fail "ops must run as node, got '$user'"
    [ "$(in_image 'node --version')" = "v22.23.5" ] || fail "ops Node must be v22.23.5"
    in_image 'test -d /app/packages/server/src &&
      test -d /app/packages/server/src/db/migrations &&
      test -x /app/node_modules/.bin/drizzle-kit &&
      test -f /app/packages/server/package.json' || fail "ops tooling layout"
    check_prebuilt_ops
    # S9A.7: native backups need PostgreSQL 16 client tools (>= the postgres:16 server) and no Docker access.
    for tool in pg_dump pg_restore psql; do
      in_image "$tool --version" | grep -Eq "^$tool \(PostgreSQL\) 16\." || fail "$tool 16 missing"
    done
    in_image '! command -v docker >/dev/null 2>&1' || fail "ops must not ship a Docker CLI"
    cmd=$(docker image inspect --format '{{json .Config.Cmd}}' "$image")
    echo "$cmd" | grep -q 'api-server.mjs' && fail "ops must not start the API by default"
    ;;

  *)
    fail "unknown kind"
    ;;
esac

echo "verify-image $kind: PASS"
