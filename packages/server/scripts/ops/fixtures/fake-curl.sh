#!/bin/sh
# Fake curl for release-deploy.test.mjs: serves canned GitHub API responses from $FAKE_GH, never touches the network.
# Without $FAKE_GH, GitHub is unreachable. The Authorization header must come from the -H @file header file.
printf '%s\n' "$*" >>"$FAKE_DIR/curl.log"
out=
url=
header=
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out=$2 && shift ;;
    -H) case "$2" in @*) header=${2#@} ;; esac && shift ;;
    --proto | --proto-redir | --max-redirs | --connect-timeout | --max-time | --retry | --retry-delay | --max-filesize) shift ;;
    https://*) url=$1 ;;
  esac
  shift
done

if [ ! -d "${FAKE_GH:-/nonexistent}" ]; then
  echo "curl: (6) Could not resolve host: api.github.com" >&2
  exit 6
fi
if [ "$(cat "$header" 2>/dev/null)" != "Authorization: Bearer $FAKE_TOKEN" ]; then
  echo "curl: (22) The requested URL returned error: 401" >&2
  exit 22
fi
case "$url" in
  https://api.github.com/repos/fredpatch/kfit-monorepo/actions/workflows/publish-images.yml/runs\?head_sha=*) body=runs.json ;;
  https://api.github.com/repos/fredpatch/kfit-monorepo/actions/runs/*/artifacts\?name=*) body=artifacts.json ;;
  https://api.github.com/repos/fredpatch/kfit-monorepo/actions/artifacts/*/zip) body=artifact.zip ;;
  *) body= ;;
esac
if [ -z "$body" ] || [ "${FAKE_GH_FAIL:-}" = "$body" ] || [ ! -f "$FAKE_GH/$body" ]; then
  echo "curl: (22) The requested URL returned error: 500" >&2
  exit 22
fi
printf '%s\n' "$url" >>"$FAKE_DIR/curl-urls"
cp "$FAKE_GH/$body" "$out"
