# S9D — Copie locale chiffrée sur le PC Windows de Konny

Status: GATE 1 — DESIGN PROPOSAL, NOT IMPLEMENTED.

## Goal

Give Konny a business-owned, off-VPS recovery copy of K'FIT backups on her Windows laptop, while keeping the validated S9A.7 backup engine authoritative and unchanged.

This is an off-server copy mechanism, not a second backup engine.

## Reused PrestiX blueprint

Verified from the uploaded PrestiX repository:

- `backup_access_tokens`: random scoped token, SHA-256 hash persisted, plaintext returned once, label + last-used + revocation;
- middleware accepts either normal privileged browser session or scoped backup token for mirror endpoints;
- mirror scope is limited to manifest + download;
- Windows PowerShell mirror reads a local `config.json` containing API URL, token and `LocalFolder`;
- Windows Task Scheduler runs the mirror unattended;
- server-side UI creates/revokes tokens and shows last use.

Relevant PrestiX files:
- `packages/server/src/modules/backups/services/backup-tokens.service.ts`
- `packages/server/src/modules/backups/middleware/backup-token-or-session.ts`
- `packages/server/src/modules/backups/routes/backups.routes.ts`
- `packages/server/src/modules/backups/controllers/backups.controller.ts`
- `scripts/local-backup-mirror/mirror-backups.ps1`
- `scripts/local-backup-mirror/config.example.json`
- `docs/deployment/local-backup-mirror.md`
- `packages/client/src/pages/settings/backups/BackupsTab.tsx`

## K'FIT invariants

1. S9A.7 remains authoritative: backup creation, encryption, integrity manifest and restore-drill are unchanged.
2. A K'FIT backup unit is the complete directory `kfit-backup-<UTC>` containing exactly:
   - `db.dump.enc`
   - `files.tar.enc`
   - `journal.jsonl.enc`
   - `manifest.json`
3. The Windows mirror never receives `BACKUP_ENCRYPTION_KEY`, DB credentials, SMTP credentials or a normal user session.
4. Token plaintext is returned once. Server stores only a one-way hash.
5. Token grants only:
   - read retained backup manifest;
   - download encrypted backup bundle files.
6. Token cannot create/delete backups, run restore, read business/customer data, or mutate application state.
7. Folder path is local Windows configuration, not a server filesystem setting.
8. Windows pulls over HTTPS. The VPS never initiates a connection to Konny's laptop.
9. No Tailscale, SSH server, inbound Windows port or browser-open requirement.
10. Loss of Windows availability must not fail the VPS backup job. Mirror catches up next time Windows starts/runs.
11. Windows retention is independent from server pruning. The mirror must not blindly delete a local bundle because the VPS no longer advertises it.
12. S9D is validated only after an existing K'FIT restore-drill succeeds from a bundle copied back from Konny's Windows mirror.

## Proposed server contracts

### Admin/session endpoints

- `GET /admin/backups/local-access-tokens`
- `POST /admin/backups/local-access-tokens`
  - body: `{ label }`
  - returns plaintext token once + summary
- `DELETE /admin/backups/local-access-tokens/:id`

Admin-only sensitive credential management. Creation/revocation should use the existing K'FIT sensitive-action safeguards if the reusable auth pattern requires it.

### Mirror endpoints

- `GET /backup-mirror/manifest`
- `GET /backup-mirror/:bundle/:file`

Authentication:
`Authorization: Bearer <scoped-token>`

Manifest should expose only operational backup metadata required to mirror:
- bundle name;
- created timestamp;
- server tier/retention class when available;
- file names;
- byte sizes;
- hashes already present in the K'FIT backup manifest.

No customer/business payload metadata.

Downloads are fixed to the four allowed filenames under a validated bundle directory; no arbitrary path input.

## Token data model

Proposed table `backup_access_tokens`:

- `id` UUID;
- `label`;
- `token_hash`;
- `created_by`;
- `created_at`;
- `last_used_at`;
- `revoked_at`.

K'FIT adaptation:
- use K'FIT UUID/conventions and audit taxonomy;
- never store plaintext token;
- compare token hashes safely;
- audit create/revoke and successful mirror authentication without logging token value.

## Windows V1

Use a small PowerShell mirror package first; do not block production-readiness on a desktop GUI.

Local config, stored only on Konny's machine:

```json
{
  "ApiBaseUrl": "https://kfitpulse.io",
  "Token": "<one-time backup token>",
  "LocalFolder": "D:\\KFIT-Sauvegardes"
}
```

Responsibilities:

1. read local config;
2. call mirror manifest over HTTPS;
3. determine which complete bundles are absent locally;
4. download missing files to a temporary bundle directory;
5. verify expected size/hash before atomic rename to final `kfit-backup-<UTC>`;
6. never overwrite an existing differing local bundle silently;
7. write a local sync log with no token;
8. return non-zero for failed download/integrity checks;
9. run via Windows Task Scheduler and at user/logon/startup-friendly cadence.

The mirror is pull/catch-up: if the laptop is off at server backup time, the next scheduled Windows run downloads every missing retained server bundle.

## Local retention

Do not inherit PrestiX's exact-mirror deletion behavior.

Gate 1 proposal for K'FIT V1:

- local copies are append-only during normal sync;
- server pruning never directly deletes Windows bundles;
- local pruning is a separate explicit policy;
- initial V1 safety policy: keep all mirrored bundles until storage pressure justifies an explicit retention rule.

Reason: current K'FIT bundles are very small and the Windows copy is the independent failure-domain recovery copy. Automatic deletion adds more risk than value at this stage.

A later retention policy may add daily/weekly/monthly tiers after real storage growth is observed.

## Admin UI

`Réglages → Sauvegardes`, adapted from PrestiX:

KPIs:
- Dernière sauvegarde serveur;
- Espace utilisé (VPS);
- Postes de sauvegarde locale actifs.

Sections:
1. Historique des sauvegardes;
2. Restore-drill status/history using K'FIT's existing ops implementation;
3. `Postes de sauvegarde locale` / scoped tokens:
   - label, e.g. `PC de Konny`;
   - created;
   - last used;
   - active/revoked;
   - create;
   - revoke;
   - one-time token display.

V1 does not claim to know the Windows folder path unless a later agent/status endpoint explicitly reports it. Folder selection remains local.

## Server-first order

1. Shared contracts.
2. DB schema/migration.
3. Service: token lifecycle + manifest/bundle read model.
4. Controller.
5. Routes/middleware.
6. Server tests and security negatives.
7. Windows PowerShell mirror.
8. Admin UI.
9. Local validation.
10. Hosted validation with Konny's Windows laptop.
11. Copy one mirrored bundle back and run existing `ops:restore-drill`.
12. Only then mark S9D validated.

## Security acceptance

- revoked token -> 401;
- missing/invalid token -> 401;
- token cannot call admin/business endpoints;
- no query-string token support (avoid URL/log leakage);
- path traversal attempts -> rejected before filesystem access;
- symlink/unexpected-file bundle -> not served;
- only completed valid bundles are listed;
- token value absent from logs/audit/database;
- create/revoke privileged and audited;
- download response uses fixed content type + attachment naming + no-store;
- rate limiting / abuse guard applied to token-authenticated mirror endpoints.

## Functional acceptance

- Konny can create `PC de Konny` local-access token from Settings.
- Token is shown once.
- Windows script can choose `D:\KFIT-Sauvegardes` (or another local path) in its local config.
- First run downloads all currently retained missing bundles.
- Later run downloads only new missing bundles.
- PC offline during 02:00 backup causes no VPS backup failure; next Windows run catches up.
- Server pruning does not delete existing Windows copies.
- Revoking the token prevents the next sync.
- Restore drill succeeds from a bundle copied from Konny's Windows folder.

## Out of scope

- Cloudflare R2 / Backblaze / object storage;
- desktop GUI/tray app;
- remote control of the Windows folder from the browser;
- automatic restore to production;
- Windows-side decryption;
- exposing the backup encryption key in the admin UI.
