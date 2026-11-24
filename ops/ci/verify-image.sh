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

case "$kind" in
  api)
    [ "$user" = "node" ] || fail "api must run as node, got '$user'"
    [ "$(in_image 'node --version')" = "v22.23.5" ] || fail "api Node must be v22.23.5"
    in_image 'test -f /app/packages/server/scripts/prod/api-server.mjs &&
      test -d /app/packages/server/dist &&
      test -d /app/packages/shared/dist &&
      test ! -d /app/packages/server/src' || fail "api runtime layout"
    in_image 'find /opt/puppeteer -type f -name chrome -perm -111 -print -quit | grep -q .' ||
      fail "Puppeteer Chrome missing"
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
    cmd=$(docker image inspect --format '{{json .Config.Cmd}}' "$image")
    echo "$cmd" | grep -q 'api-server.mjs' && fail "ops must not start the API by default"
    ;;

  *)
    fail "unknown kind"
    ;;
esac

echo "verify-image $kind: PASS"
