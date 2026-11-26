#!/bin/sh
# Fake docker CLI for release-deploy.test.mjs: logs every call, never contacts a daemon. Compose image resolution
# follows the real precedence (shell environment, then --env-file, then the compose default). compose-files gets the
# first line of the -f file of every Compose call.
env | grep '^COMPOSE_' >>"$FAKE_DIR/compose-env"
printf '%s\n' "$*" >>"$FAKE_DIR/docker.log"

case "$1" in
  image)
    [ "${FAKE_IMAGE_MISSING:-0}" = 1 ] && exit 1
    [ "$3" = -f ] && printf 'id-%s\n' "$5"
    exit 0
    ;;
  inspect)
    service=${4#cid-}
    case "$3" in
      *Health*) printenv "FAKE_HEALTH_$service" || echo healthy ;;
      *) cat "$FAKE_DIR/running-$service" ;;
    esac
    exit 0
    ;;
esac

shift
envfile=/dev/null
while :; do
  case "$1" in
    --env-file) envfile=$2 ;;
    --project-directory) ;;
    -f) head -n 1 "$2" >>"$FAKE_DIR/compose-files" ;;
    *) break ;;
  esac
  shift 2
done

resolve() {
  value=$(printenv "$1" || sed -n "s/^$1=//p" "$envfile")
  printf '%s' "${value:-$2}"
}
api=$(resolve KFIT_API_IMAGE kfit-prod-api:local)
client=$(resolve KFIT_CLIENT_IMAGE kfit-prod-client:local)
ops=$(resolve KFIT_OPS_IMAGE kfit-prod-ops:local)
renderer=$(resolve KFIT_RENDERER_IMAGE kfit-prod-renderer:local)

[ "$1" = --profile ] && shift 2
case "$1" in
  config)
    printf '{"services":{"api":{"image":"%s","build":{}},"client":{"image":"%s","build":{}},"ops":{"image":"%s","build":{}},"renderer":{"image":"%s","build":{}},"postgres":{"image":"postgres:16-alpine"},"clamav":{"image":"clamav/clamav:1.5.5"}}}\n' \
      "$api" "$client" "$ops" "$renderer"
    ;;
  pull) exit "${FAKE_PULL_FAIL:-0}" ;;
  up)
    cp "$KFIT_RELEASE_ENV" "$FAKE_DIR/release-at-up"
    printf 'id-%s\n' "${FAKE_RUNNING_API:-$api}" >"$FAKE_DIR/running-api"
    printf 'id-%s\n' "$client" >"$FAKE_DIR/running-client"
    printf 'id-%s\n' "$renderer" >"$FAKE_DIR/running-renderer"
    ;;
  ps) printf 'cid-%s\n' "$3" ;;
esac
exit 0
