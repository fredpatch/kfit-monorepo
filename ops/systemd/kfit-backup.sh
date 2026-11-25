#!/bin/sh
# S9A.7: scheduled production backup, run by kfit-backup.service. Runs `ops:backup` in the ops container of the
# release recorded in the non-secret release env file, and fails closed: the ops image must be this repository's
# GHCR digest ref and already pulled, so Compose can neither pull another image nor build kfit-prod-ops:local.
# Secrets stay in the runtime env file (read by Compose, never by this script).
set -eu

release_env=${KFIT_RELEASE_ENV:-/srv/kfit/config/release.env}
env_file=${KFIT_ENV_FILE:-/srv/kfit/config/.env.prod}
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)

fail() {
  echo "kfit-backup: $1" >&2
  exit 1
}

[ -r "$release_env" ] || fail "release env file not readable: $release_env"
[ -r "$env_file" ] || fail "runtime env file not readable: $env_file"
[ -f "$repo/docker-compose.prod.yml" ] || fail "docker-compose.prod.yml not found in $repo"

# The release file holds image refs only (never a key): anything else is refused, and it is parsed, not sourced.
if grep -Ev '^[[:space:]]*(#.*)?$|^KFIT_(API|CLIENT|OPS)_IMAGE=[^[:space:]]+$' "$release_env" >/dev/null; then
  fail "release env file may only contain KFIT_API_IMAGE, KFIT_CLIENT_IMAGE and KFIT_OPS_IMAGE lines"
fi
ops_image=$(sed -n 's/^KFIT_OPS_IMAGE=//p' "$release_env" | tail -n 1)
echo "$ops_image" | grep -Eq '^ghcr\.io/fredpatch/kfit-monorepo/ops@sha256:[0-9a-f]{64}$' ||
  fail "KFIT_OPS_IMAGE must be ghcr.io/fredpatch/kfit-monorepo/ops@sha256:<64 hex>"
docker image inspect "$ops_image" >/dev/null 2>&1 ||
  fail "ops image not present locally: pull the release (docker compose ... --profile ops pull ops) first"

export KFIT_ENV_FILE="$env_file" KFIT_OPS_IMAGE="$ops_image"
exec docker compose -f "$repo/docker-compose.prod.yml" --profile ops \
  run --rm --no-deps -T --pull never ops \
  npm run ops:backup --workspace @kfit/server
