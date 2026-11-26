#!/bin/sh
# S9C: the production deployment path. Deploys exactly the four GHCR digest refs of one release manifest
# (api, client, ops, renderer) and never builds an application image on the VPS:
#   sudo ops/deploy/kfit-release.sh <40-hex release commit>
#   sudo ops/deploy/kfit-release.sh /path/to/release-manifest.json
# Rollback is the same command with an older (S9B or later) release.
#
# Commit mode uses /srv/kfit/releases/<commit>.json when it exists (no network). Otherwise it downloads the
# release-manifest-<commit> artifact of the one successful publish-images.yml run on main for that commit, with a
# read-only token (Actions: Read) from /srv/kfit/config/github-actions-read.token passed to curl in a header file.
# Archived manifests are validated release inputs; release.env alone names the current release.
#
# Compose runs the docker-compose.prod.yml of manifest.commit (git show into a temporary file), never the working
# tree's: a checkout newer than the release cannot change its topology. This script itself is the newest tooling.
#
# The manifest is parsed by Python, never sourced. Inherited KFIT_*_IMAGE and COMPOSE_* variables are cleared, because
# Compose lets the shell override --env-file. /srv/kfit/config/release.env (read by the backup timer) and the
# archived manifest are written only after every healthcheck passes.
set -eu
umask 022

fail() {
  echo "kfit-release: $1" >&2
  exit 1
}

[ $# -eq 1 ] || fail "usage: kfit-release.sh <40-hex release commit> | <release-manifest.json>"
# Exactly 40 lowercase hex characters is a commit; anything else is a manifest path.
requested=
manifest=$1
case "$1" in
  *[!0-9a-f]*) ;;
  *) if [ ${#1} -eq 40 ]; then requested=$1; fi ;;
esac
token_file=${KFIT_GITHUB_TOKEN_FILE:-/srv/kfit/config/github-actions-read.token}
repo=${KFIT_REPO:-/srv/kfit/app}
env_file=${KFIT_ENV_FILE:-/srv/kfit/config/.env.prod}
release_env=${KFIT_RELEASE_ENV:-/srv/kfit/config/release.env}
releases=${KFIT_RELEASES_DIR:-/srv/kfit/releases}
health_timeout=${KFIT_DEPLOY_HEALTH_TIMEOUT:-600}
health_interval=${KFIT_DEPLOY_HEALTH_INTERVAL:-5}

case "$health_timeout$health_interval" in
  *[!0-9]*) fail "KFIT_DEPLOY_HEALTH_TIMEOUT and KFIT_DEPLOY_HEALTH_INTERVAL must be whole seconds" ;;
esac
command -v python3 >/dev/null || fail "python3 is required"
command -v docker >/dev/null || fail "docker is required"
command -v git >/dev/null || fail "git is required"
release_dir=$(dirname -- "$release_env")
# safe.directory: under sudo, root reads a checkout owned by the deploy user. Read-only commands only.
repo_git() {
  git -c safe.directory="$repo" -C "$repo" "$@"
}
repo_git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository: $repo"
[ -r "$env_file" ] || fail "runtime env file not readable: $env_file"
[ -d "$releases" ] && [ -w "$releases" ] || fail "release archive directory not writable: $releases"
[ -d "$release_dir" ] && [ -w "$release_dir" ] || fail "release env directory not writable: $release_dir"

# Strict manifest and Compose checks. Same contract as ops/ci/release-manifest.mjs.
py() {
  python3 -I - "$@" <<'PY'
import json, os, re, stat, sys

REPO = "fredpatch/kfit-monorepo"
WORKFLOW = ".github/workflows/publish-images.yml"
MAX_MANIFEST = 65536
MAX_ARTIFACT = 1048576
KEYS = {"KFIT_API_IMAGE": "api", "KFIT_CLIENT_IMAGE": "client", "KFIT_OPS_IMAGE": "ops", "KFIT_RENDERER_IMAGE": "renderer"}
SERVICES = {kind: key for key, kind in KEYS.items()}
TOP_LEVEL = {"repository", "commit", "workflow_run", "created", "images", "compose_env"}


def die(message):
    print("kfit-release: " + message, file=sys.stderr)
    sys.exit(1)


def unique_pairs(pairs):
    data = {}
    for key, value in pairs:
        if key in data:
            die("manifest has a duplicate key: " + json.dumps(key))
        data[key] = value
    return data


def no_constant(name):
    die("manifest has a non-standard JSON constant: " + name)


def digest_ref(kind, value, label):
    pattern = r"ghcr\.io/fredpatch/kfit-monorepo/" + kind + r"@sha256:[0-9a-f]{64}"
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        die(f"{label} must be ghcr.io/{REPO}/{kind}@sha256:<64 lowercase hex>")
    return value


def manifest(path, out):
    try:
        with open(path, "rb") as handle:
            raw = handle.read(MAX_MANIFEST + 1)
    except OSError:
        die("manifest not readable: " + path)
    if len(raw) > MAX_MANIFEST:
        die("manifest is larger than 64 KiB")
    try:
        data = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs, parse_constant=no_constant)
    except (UnicodeDecodeError, ValueError):
        die("manifest is not valid UTF-8 JSON")
    if not isinstance(data, dict):
        die("manifest must be a JSON object")
    unexpected = sorted(json.dumps(key) for key in set(data) - TOP_LEVEL)
    if unexpected:
        die("manifest has unexpected keys: " + ", ".join(unexpected))
    if data.get("repository") != REPO:
        die("manifest repository must be " + REPO)
    commit = data.get("commit")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        die("manifest commit must be 40 lowercase hex characters")
    for key in ("workflow_run", "created"):
        if key in data and not isinstance(data[key], str):
            die(f"manifest {key} must be a string")
    env = data.get("compose_env")
    if not isinstance(env, dict) or set(env) != set(KEYS):
        die("compose_env must hold exactly KFIT_API_IMAGE, KFIT_CLIENT_IMAGE, KFIT_OPS_IMAGE and KFIT_RENDERER_IMAGE"
            " (manifests from before S9B are refused)")
    refs = {key: digest_ref(kind, env[key], key) for key, kind in KEYS.items()}
    images = data.get("images")
    if not isinstance(images, dict) or set(images) != set(SERVICES):
        die("manifest images must describe exactly api, client, ops and renderer")
    for kind, key in SERVICES.items():
        entry = images[kind]
        if (not isinstance(entry, dict) or set(entry) != {"ref", "tag"} or entry["ref"] != refs[key]
                or entry["tag"] != f"ghcr.io/{REPO}/{kind}:sha-{commit}"):
            die(f"manifest images.{kind} does not match compose_env and commit")
    with open(out, "w", encoding="ascii", newline="\n") as handle:
        handle.writelines(f"{key}={refs[key]}\n" for key in KEYS)
    print(commit)


def release_lines(path):
    with open(path, encoding="ascii") as handle:
        return handle.read().splitlines()


def read_release(path):
    return dict(line.split("=", 1) for line in release_lines(path))


def resolved(config_path, release_path):
    refs = read_release(release_path)
    try:
        with open(config_path, encoding="utf-8") as handle:
            services = json.load(handle)["services"]
    except (OSError, ValueError, KeyError, TypeError):
        die("could not read the resolved Compose configuration")
    wanted = {kind: refs[key] for kind, key in SERVICES.items()}
    for kind, ref in wanted.items():
        image = (services.get(kind) or {}).get("image")
        if image != ref:
            die(f"Compose resolves {kind} to {image!r}, not the manifest ref {ref}")
    for name, service in services.items():
        if "build" in service and service.get("image") not in wanted.values():
            die(f"service {name} would use {service.get('image')!r}: only manifest digest refs may be deployed")
    for image in sorted({service.get("image") for service in services.values() if service.get("image")}):
        print(image)


def current(release_path, releases):
    try:
        lines = sorted(line for line in release_lines(release_path) if line.startswith("KFIT_"))
        names = sorted(os.listdir(releases))
    except (OSError, ValueError):
        return
    for name in names:
        if not re.fullmatch(r"[0-9a-f]{40}\.json", name):
            continue
        try:
            with open(os.path.join(releases, name), encoding="utf-8") as handle:
                env = json.load(handle)["compose_env"]
            if sorted(f"{key}={value}" for key, value in env.items()) == lines:
                print(name[:-5])
                return
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue


def token(path, header):
    try:
        info = os.lstat(path)
    except OSError:
        die("GitHub token file not readable: " + path)
    if not stat.S_ISREG(info.st_mode):
        die("GitHub token file must be a regular file: " + path)
    if os.name == "posix" and info.st_mode & 0o077:
        die("GitHub token file must not be readable by group or others (chmod 600): " + path)
    try:
        with open(path, "rb") as handle:
            raw = handle.read(4097)
    except OSError:
        die("GitHub token file not readable: " + path)
    values = [line.strip() for line in raw.decode("ascii", "replace").splitlines() if line.strip()]
    if len(raw) > 4096 or len(values) != 1 or not re.fullmatch(r"[A-Za-z0-9_]{20,255}", values[0]):
        die("GitHub token file must hold exactly one token (letters, digits and underscores): " + path)
    descriptor = os.open(header, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="ascii", newline="\n") as handle:
        handle.write("Authorization: Bearer " + values[0] + "\n")


def api_list(path, key, what):
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        die(f"GitHub returned an unreadable {what} response")
    items = data.get(key) if isinstance(data, dict) else None
    if not isinstance(items, list) or data.get("total_count") != len(items):
        die(f"GitHub {what} response is incomplete or paginated: refusing to guess")
    return [item for item in items if isinstance(item, dict)]


def positive_id(value, what):
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        die(f"GitHub returned an invalid {what} id")
    return value


def run(sha, path):
    runs = [r for r in api_list(path, "workflow_runs", "workflow runs")
            if r.get("head_sha") == sha and r.get("head_branch") == "main" and r.get("path") == WORKFLOW
            and isinstance(r.get("repository"), dict) and r["repository"].get("full_name") == REPO]
    if not runs:
        die(f"no {WORKFLOW} run on main for commit {sha}")
    pending = [r for r in runs if r.get("status") != "completed"]
    if pending:
        die(f"publish-images run {pending[0].get('id')} for {sha} is {pending[0].get('status')!r}, not completed:"
            " wait for it to finish")
    succeeded = [r for r in runs if r.get("conclusion") == "success"]
    if not succeeded:
        conclusions = ", ".join(sorted({repr(r.get("conclusion")) for r in runs}))
        die(f"no successful publish-images run for {sha} (conclusion: {conclusions})")
    ids = {r.get("id") for r in succeeded}
    if len(ids) != 1:
        die(f"several successful publish-images runs for {sha}: refusing to choose between them")
    print(positive_id(succeeded[0].get("id"), "workflow run"))


def artifact(sha, run_id, path):
    name = "release-manifest-" + sha
    found = [a for a in api_list(path, "artifacts", "artifacts") if a.get("name") == name]
    if not found:
        die(f"run {run_id} has no artifact {name}")
    if len(found) > 1:
        die(f"run {run_id} has several artifacts named {name}: refusing to choose")
    item = found[0]
    if item.get("expired") is not False:
        die(f"artifact {name} has expired (GitHub keeps it 90 days): deploy from an archived manifest")
    origin = item.get("workflow_run")
    if (not isinstance(origin, dict) or str(origin.get("id")) != run_id or origin.get("head_sha") != sha
            or origin.get("head_branch") != "main"):
        die(f"artifact {name} does not belong to run {run_id} of commit {sha} on main")
    size = item.get("size_in_bytes")
    if isinstance(size, bool) or not isinstance(size, int) or not 0 < size <= MAX_ARTIFACT:
        die(f"artifact {name} has an unexpected size")
    print(positive_id(item.get("id"), "artifact"))


def unzip(path, out):
    import zipfile, zlib
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) != 1 or entries[0].filename != "release-manifest.json":
                die("artifact must contain exactly one file, release-manifest.json")
            entry = entries[0]
            if entry.is_dir() or (entry.external_attr >> 16) & 0o170000 not in (0, stat.S_IFREG):
                die("release-manifest.json in the artifact is not a regular file")
            if entry.file_size > MAX_MANIFEST or entry.compress_size > MAX_ARTIFACT:
                die("release-manifest.json in the artifact is larger than 64 KiB")
            with archive.open(entry) as source:
                data = source.read(MAX_MANIFEST + 1)
    except (OSError, EOFError, RuntimeError, NotImplementedError, ValueError, zipfile.BadZipFile, zlib.error):
        die("artifact is not a valid ZIP archive")
    if len(data) > MAX_MANIFEST:
        die("release-manifest.json in the artifact is larger than 64 KiB")
    with open(out, "wb") as handle:
        handle.write(data)


mode, *args = sys.argv[1:]
{"manifest": manifest, "resolved": resolved, "current": current, "token": token, "run": run, "artifact": artifact,
 "unzip": unzip}[mode](*args)
PY
}

tmp=$(mktemp -d)
lock=$releases/.kfit-release.lock
locked=
cleanup() {
  rm -rf "$tmp"
  if [ -n "$locked" ]; then rmdir "$lock"; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir "$lock" 2>/dev/null || fail "another deployment holds $lock (remove it only if no deployment is running)"
locked=1

# Commit mode: the archived manifest, or the GitHub artifact as a temporary candidate. It is archived only at the
# commit point below, like any other manifest.
if [ -n "$requested" ]; then
  repo_git cat-file -e "$requested^{commit}" 2>/dev/null ||
    fail "release commit $requested is not in $repo (git fetch first): nothing was changed"
  manifest=$releases/$requested.json
  if [ ! -e "$manifest" ]; then
    command -v curl >/dev/null || fail "curl is required to download the release manifest"
    manifest=$tmp/release-manifest.json
    api=https://api.github.com/repos/fredpatch/kfit-monorepo/actions
    # The token stays in a 0600 header file: never on a command line, in the output or in a written release file.
    # Plain --location: curl drops the Authorization header when GitHub redirects the download to another host.
    py token "$token_file" "$tmp/github.header"
    github() {
      curl --silent --show-error --fail --proto =https --proto-redir =https --location --max-redirs 5 \
        --connect-timeout 10 --max-time 120 --retry 2 --retry-delay 3 --max-filesize 1048576 \
        -H @"$tmp/github.header" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
        -o "$2" "$1" || fail "GitHub request failed ($3): nothing was changed"
    }
    echo "kfit-release: fetching the release manifest of $requested from GitHub Actions"
    github "$api/workflows/publish-images.yml/runs?head_sha=$requested&per_page=100" "$tmp/runs.json" "workflow runs"
    run_id=$(py run "$requested" "$tmp/runs.json")
    github "$api/runs/$run_id/artifacts?name=release-manifest-$requested&per_page=100" "$tmp/artifacts.json" "artifacts"
    artifact_id=$(py artifact "$requested" "$run_id" "$tmp/artifacts.json")
    github "$api/artifacts/$artifact_id/zip" "$tmp/artifact.zip" "artifact download"
    rm -f "$tmp/github.header"
    py unzip "$tmp/artifact.zip" "$manifest"
  fi
fi

commit=$(py manifest "$manifest" "$tmp/release.env")
if [ -n "$requested" ] && [ "$commit" != "$requested" ]; then
  fail "manifest commit $commit is not the requested commit $requested: nothing was changed"
fi
archive=$releases/$commit.json
if [ -e "$archive" ] && ! cmp -s -- "$manifest" "$archive"; then
  fail "$archive already exists with different content: refusing an ambiguous release"
fi
previous=$(py current "$release_env" "$releases" || true)

compose_file=$tmp/docker-compose.prod.yml
repo_git cat-file -e "$commit^{commit}" 2>/dev/null ||
  fail "release commit $commit is not in $repo (git fetch first): nothing was changed"
repo_git show "$commit:docker-compose.prod.yml" >"$compose_file" 2>/dev/null && [ -s "$compose_file" ] ||
  fail "docker-compose.prod.yml cannot be read from commit $commit: nothing was changed"

deploy_failed() {
  echo "kfit-release: $1" >&2
  echo "kfit-release: $release_env was not changed: release $commit is not recorded as current." >&2
  echo "kfit-release: to roll back, rerun this helper with the previous release:" >&2
  echo "kfit-release:   sudo $0 ${previous:-<previous commit>}" >&2
  exit 1
}

unset KFIT_API_IMAGE KFIT_CLIENT_IMAGE KFIT_OPS_IMAGE KFIT_RENDERER_IMAGE
for var in $(env | sed -n 's/^\(COMPOSE_[A-Za-z0-9_]*\)=.*/\1/p'); do
  unset "$var"
done
export KFIT_ENV_FILE="$env_file"
dc() {
  docker compose --env-file "$tmp/release.env" --project-directory "$repo" -f "$compose_file" "$@"
}

echo "kfit-release: checking release $commit"
dc --profile ops config --format json >"$tmp/config.json" || fail "docker compose config failed: nothing was changed"
py resolved "$tmp/config.json" "$tmp/release.env" >"$tmp/images"

echo "kfit-release: pulling the four release images"
dc --profile ops pull api client ops renderer || fail "pull failed: nothing was changed"
while read -r image; do
  docker image inspect "$image" >/dev/null 2>&1 || fail "image not present on this host: $image (nothing was changed)"
done <"$tmp/images"

# No profile: ops stays a one-off tool and the retired Mailpit bridge is never started.
echo "kfit-release: deploying $commit"
dc up -d --no-build --pull never || deploy_failed "docker compose up failed"

deadline=$(($(date +%s) + health_timeout))
while :; do
  pending=
  for service in postgres clamav renderer api client; do
    id=$(dc ps -q "$service" 2>/dev/null | head -n 1)
    state=missing
    if [ -n "$id" ]; then
      state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null) || state=missing
    fi
    [ "$state" = healthy ] || pending="$pending $service=$state"
  done
  [ -z "$pending" ] && break
  [ "$(date +%s)" -lt "$deadline" ] || deploy_failed "not healthy after ${health_timeout}s:$pending"
  sleep "$health_interval"
done

for pair in api:KFIT_API_IMAGE client:KFIT_CLIENT_IMAGE renderer:KFIT_RENDERER_IMAGE; do
  service=${pair%%:*}
  ref=$(sed -n "s/^${pair#*:}=//p" "$tmp/release.env")
  want=$(docker image inspect -f '{{.Id}}' "$ref") || want=
  got=$(docker inspect -f '{{.Image}}' "$(dc ps -q "$service" | head -n 1)") || got=
  [ -n "$want" ] && [ "$got" = "$want" ] || deploy_failed "$service is not running $ref"
done

# Commit point: same-directory temporary files renamed over the targets, so readers see the old or the new file.
if [ ! -e "$archive" ]; then
  cp -- "$manifest" "$releases/.$commit.json.$$"
  chmod 644 "$releases/.$commit.json.$$"
  mv -f -- "$releases/.$commit.json.$$" "$archive"
fi
cp -- "$tmp/release.env" "$release_dir/.release.env.$$"
chmod 644 "$release_dir/.release.env.$$"
mv -f -- "$release_dir/.release.env.$$" "$release_env"
echo "kfit-release: $commit is current ($release_env, $archive)"
