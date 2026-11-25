# S9A.7 — Hostinger backup baseline packaging

Status: implementation brief
Sprint: 9A
Task: S9A.7 — Backup baseline

## Context

Validated before this task:
- PostgreSQL production database is migrated (21/21 migrations).
- `/srv/kfit/private` and `/srv/kfit/privacy-journal` are persistent host bind mounts.
- S9A.5 storage/ClamAV/PDF gates are green.
- S9A.6 bootstrap/database/required-consent gates are green.
- Real SMTP S9A.4 remains deferred pending Konny Gmail.

S9A.7 inspection found:
- `/srv/kfit/backups` exists on the VPS but is currently `root:root 700`.
- no `BACKUP_*` values are present in `/srv/kfit/config/.env.prod`.
- `docker-compose.prod.yml` gives `ops` no private-storage, journal, or backup mounts.
- the current `ops` image does not install PostgreSQL client binaries or Docker CLI.
- `loadOpsConfig` supports `BACKUP_PG_MODE=docker|native`, but as packaged neither mode is production-usable.
- mounting the Docker socket into the ops container is not acceptable.

## Goal

Make the existing S7.4b backup / restore / restore-drill implementation executable from the production `ops` container on Hostinger without weakening container isolation.

## Required design

Use **native PostgreSQL mode** from the ops container.

Reason:
- ops already joins `kfit_backend` and receives `DATABASE_URL`;
- native mode avoids Docker socket access and host Docker control;
- existing backup code already supports native `pg_dump` / `pg_restore`;
- only client binaries and persistent mounts are missing.

## Scope

### 1. Ops image PostgreSQL tools

Adapt the `ops` Dockerfile target so it contains the PostgreSQL client tools required by existing native backup/restore code:
- `pg_dump`
- `pg_restore`
- `psql` if required by existing ops helpers

Keep:
- non-root `node` user;
- `KFIT_OPS_PREBUILT=true`;
- no Docker CLI;
- no Docker socket;
- no runtime compilation.

Use a client major compatible with production PostgreSQL 16 and the existing major-version guard.

### 2. Production compose mounts for ops

Add explicit bind mounts to the `ops` service:
- `${KFIT_PRIVATE_HOST_DIR:-/srv/kfit/private}` -> `/srv/kfit/private`
- `${KFIT_PRIVACY_JOURNAL_HOST_DIR:-/srv/kfit/privacy-journal}` -> `/srv/kfit/privacy-journal`
- `${KFIT_BACKUP_HOST_DIR:-/srv/kfit/backups}` -> `/srv/kfit/backups`

Use `create_host_path: false`.

The ops tooling must be able to:
- read private files and journal for backup;
- write encrypted bundles under primary and secondary backup directories;
- perform the existing isolated restore drill without touching production files.

Do not mount the Docker socket.

### 3. Production env and runbook

Document production values:

```dotenv
BACKUP_ENCRYPTION_KEY=<64 hex chars, secret>
BACKUP_DIR=/srv/kfit/backups/primary
BACKUP_SECONDARY_DIR=/srv/kfit/backups/secondary
BACKUP_PG_MODE=native
BACKUP_PG_SERVICE=postgres
```

For native mode, `BACKUP_COMPOSE_FILE` should be absent/empty unless the existing implementation truly requires it.

Document host provisioning:
- `/srv/kfit/backups/primary`
- `/srv/kfit/backups/secondary`
- both writable by UID/GID 1000 used by ops;
- permissions 0700;
- backup encryption key only in `/srv/kfit/config/.env.prod` (0600), never logged.

For the controlled synthetic beta, primary + secondary may temporarily be two separate directories on the same VPS. Preserve the gate: **before real customer data, secondary backup must be off-server and restore-tested from that off-server copy.**

### 4. Host scheduler artifacts

Add versioned systemd artifacts under an appropriate `ops/systemd/` location:
- oneshot service invoking the production backup through `docker compose ... --profile ops run --rm --no-deps ops ...`;
- timer with a sensible daily schedule;
- scheduled path must load immutable image refs and fail closed.

Do not let the scheduled path fall back to `kfit-prod-ops:local`.
Do not persist secrets in the systemd unit.

### 5. Release-manifest / fail-closed hardening

The runbook says release manifests should be retained under `/srv/kfit/releases/<commit>.json`, but the VPS currently has no `/srv/kfit/releases`.

For this task:
- document required directory/permissions;
- ensure scheduler can source selected immutable ops image without rebuilding locally;
- prefer a non-secret release env file such as `/srv/kfit/config/release.env` containing only immutable image refs, or an equally fail-closed mechanism;
- never store backup keys there;
- normal scheduled backup must guarantee Compose cannot build `kfit-prod-ops:local`.

### 6. Validation / tests

Add/update static or CI checks for:
- ops image contains required PostgreSQL client tools;
- production compose ops service contains required mounts;
- no Docker socket mount exists;
- scheduler refuses missing/non-digest `KFIT_OPS_IMAGE`;
- production documented backup mode is `native`;
- existing backup/restore/restore-drill tests remain green;
- existing path overlap, crypto, manifest, target and rotation guards remain unchanged.

## Runtime acceptance by Fred

After implementation is merged/published:
1. provision backup dirs + encryption key;
2. pull/use new immutable ops image;
3. run one production backup;
4. verify encrypted primary bundle + secondary copy + successful run record;
5. run `ops:restore-drill`;
6. verify throwaway DB/temp files cleaned and source DB untouched;
7. install/enable host systemd timer;
8. trigger one manual service/timer run and confirm success;
9. verify retention/rotation preserves the current valid bundle.

Do not mark S9A.7 complete before Fred's runtime validation.

## Out of scope

- real off-server provider integration (required before real customer data);
- S9A.4 Gmail SMTP;
- PDF renderer isolation / SYS_ADMIN removal (S9B);
- backup crypto format or business-data semantic changes.

## Implementation report required

Return:
- files changed;
- design choices;
- tests run/results;
- commit SHA;
- remaining Fred runtime steps;
- any deviation from this brief with rationale.
