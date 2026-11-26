# S9D — Off-server encrypted backup via Cloudflare R2

Status: IMPLEMENTATION READY, NOT YET VPS-VALIDATED.

## Goal

Move every successfully created K'FIT encrypted backup bundle into a genuinely separate failure domain, without giving the transport layer access to backup plaintext or `BACKUP_ENCRYPTION_KEY`.

## Reused mechanism

Keep the validated S9A.7 backup/restore engine unchanged. Reuse its hard commit point: only completed `kfit-backup-<UTC>` directories exist under the final name. S9D begins only after that process succeeds.

## Architecture

```text
ops:backup (existing)
  -> encrypted primary bundle on VPS
  -> systemd ExecStartPost
  -> kfit-offsite-backup.sh
  -> rclone copy --immutable
  -> private Cloudflare R2 bucket
  -> rclone check --download
```

The R2 credentials are transport credentials only. They are stored in a dedicated rclone config, not in `.env.prod`, and the off-site script never reads the production env file.

## Invariants

1. No change to backup encryption, manifest/HMAC, GFS rotation or restore semantics.
2. No `BACKUP_ENCRYPTION_KEY` in rclone config, off-site env, systemd unit or command line.
3. Dedicated private bucket and bucket-scoped Object Read & Write credential.
4. VPS performs `copy --immutable` only; no remote sync/delete/purge.
5. R2 Bucket Lock protects objects from overwrite/delete during the chosen retention window.
6. Exact latest completed bundle only; expected four regular files, no extras/symlinks.
7. Upload success is followed by full `check --download`; systemd fails if either step fails.
8. S9D closure requires a restore drill from a bundle downloaded from R2, not from either VPS-local backup directory.
9. S9A.9 remains independent and asynchronous.

## Acceptance

- CI/tests green after implementation.
- Host rclone installed and version reported.
- R2 bucket + bucket lock configured.
- credentials/config stored mode 600 under `/srv/kfit/config`, never pasted into chat.
- immediate systemd backup: local encrypted backup succeeded + R2 upload/read-back succeeded.
- newest R2 bundle downloaded to `/srv/kfit/backups/offsite-drill/<bundle>`.
- existing `ops:restore-drill` succeeds against that downloaded bundle and cleans the temporary DB.
- only after Fred confirms these results: mark S9D validated/Terminé and update changelog.
