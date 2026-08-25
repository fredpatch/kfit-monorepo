# K'FIT — Backup + isolated restore pre-flight

## Goal

Prove before functional development that K'FIT can recover both PostgreSQL data and private files from an encrypted backup without overwriting the active environment.

## Scope of the Sprint 0 proof

The pre-flight:

1. Creates a temporary marker record in `scheduled_job_runs`.
2. Creates a temporary marker under private storage.
3. Runs `pg_dump` against the Docker PostgreSQL 16 service.
4. Packages the SQL dump and private-file marker in one pre-flight payload.
5. Encrypts the payload with AES-256-GCM using `BACKUP_ENCRYPTION_KEY`.
6. Copies the encrypted bundle to a secondary directory and verifies SHA-256 equality.
7. Deletes the primary copy so recovery is performed from the secondary copy.
8. Decrypts the secondary copy.
9. Creates a separate temporary PostgreSQL database and restores the dump into it.
10. Restores private files into a separate temporary filesystem tree.
11. Verifies the database marker and file SHA-256/content.
12. Confirms the active development database was not replaced.
13. Drops the temporary restore database and removes source markers.

## Run

Docker PostgreSQL must be running and migrations must already be applied.

Generate a development-only encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the result in the local `.env` file:

```env
BACKUP_ENCRYPTION_KEY=<64 hexadecimal characters>
```

Then run from the repository root:

```bash
npm run preflight:backup
```

## Acceptance criteria

The command must report:

- PostgreSQL source ready;
- source DB/private-file markers created;
- encrypted AES-256-GCM backup created;
- secondary-copy SHA-256 integrity verified;
- decryption from the secondary copy succeeds;
- isolated PostgreSQL restore succeeds;
- private-file restore + SHA-256 check succeeds;
- active development DB remains separate;
- final `Backup + isolated restore pre-flight PASSED`.

## Production rule

The `offsite-simulated` directory is only a Sprint 0 mechanism test. It is **not** an off-server backup because it remains on the same development host.

Production must use:

- daily encrypted PostgreSQL and private-file backups;
- a second copy outside the production VPS/storage failure domain;
- restricted backup credentials and encryption-key management;
- retention/rotation policy;
- periodic isolated restore tests;
- restore procedures that replay/apply relevant privacy actions before recovered data is reopened to normal application traffic.

Backup encryption keys must never be committed to Git.
