#!/bin/sh
# S9D: transport the latest already-encrypted production backup bundle to an off-server rclone remote.
# This process never reads .env.prod and never receives BACKUP_ENCRYPTION_KEY. It is append-only from the VPS:
# rclone copy --immutable may create missing objects but cannot overwrite an existing differing object, and no
# sync/delete command is used. A full read-back check is required before success is reported.
set -eu

backup_dir=${KFIT_BACKUP_PRIMARY_DIR:-/srv/kfit/backups/primary}
rclone_config=${KFIT_RCLONE_CONFIG:-/srv/kfit/config/rclone-offsite.conf}
remote=${KFIT_OFFSITE_REMOTE:-}

fail() {
  echo "kfit-offsite-backup: $1" >&2
  exit 1
}

command -v rclone >/dev/null 2>&1 || fail "rclone not found"
[ -n "$remote" ] || fail "KFIT_OFFSITE_REMOTE is required"
case "$remote" in
  *[!A-Za-z0-9._:/-]*|*..*|/*|:*|*:) fail "KFIT_OFFSITE_REMOTE has an invalid form" ;;
  *:*) ;;
  *) fail "KFIT_OFFSITE_REMOTE must be an rclone remote path (remote:bucket/prefix)" ;;
esac

[ -d "$backup_dir" ] || fail "backup directory not found: $backup_dir"
[ -f "$rclone_config" ] && [ ! -L "$rclone_config" ] && [ -r "$rclone_config" ] ||
  fail "rclone config must be a readable regular non-symlink file: $rclone_config"

if [ "$(uname -s 2>/dev/null || true)" = Linux ]; then
  mode=$(stat -c '%a' "$rclone_config" 2>/dev/null || true)
  owner=$(stat -c '%u' "$rclone_config" 2>/dev/null || true)
  [ "$mode" = 600 ] || [ "$mode" = 400 ] ||
    fail "rclone config must be mode 600 or 400: $rclone_config"
  [ "$owner" = "$(id -u)" ] ||
    fail "rclone config must be owned by the backup service user: $rclone_config"
fi

latest=$(
  find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name 'kfit-backup-*' -printf '%f\n' |
    LC_ALL=C sort | tail -n 1
)
[ -n "$latest" ] || fail "no completed backup bundle found in $backup_dir"
echo "$latest" | grep -Eq '^kfit-backup-[0-9]{8}T[0-9]{6}Z$' ||
  fail "latest backup bundle name is invalid"

bundle="$backup_dir/$latest"
for name in db.dump.enc files.tar.enc journal.jsonl.enc manifest.json; do
  [ -f "$bundle/$name" ] && [ ! -L "$bundle/$name" ] && [ -r "$bundle/$name" ] ||
    fail "backup bundle is incomplete: $latest"
done
count=$(find "$bundle" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
[ "$count" = 4 ] || fail "backup bundle contains unexpected entries: $latest"

destination="${remote%/}/$latest"
echo "kfit-offsite-backup: uploading $latest"
rclone --config "$rclone_config" copy "$bundle" "$destination" --immutable
echo "kfit-offsite-backup: verifying $latest by read-back"
rclone --config "$rclone_config" check "$bundle" "$destination" --one-way --download
echo "kfit-offsite-backup: $latest uploaded and verified"
