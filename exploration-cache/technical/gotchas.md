# Technical Gotchas

## PostgreSQL host-port ambiguity on Windows dev

K'FIT can coexist with a native PostgreSQL installation, but they must not share the same host endpoint.

Validated convention:
- native PostgreSQL: `localhost:5432`
- K'FIT Docker PostgreSQL: `localhost:5433`
- Docker-internal PostgreSQL: `postgres:5432`

`DATABASE_URL` must point to the intended host endpoint. Drizzle commands can silently target the wrong PostgreSQL instance if the host port is ambiguous.

## Drizzle config vs TypeScript project scope

`drizzle.config.ts` must be covered by Node typings. Installing `@types/node` alone is insufficient when the config file is outside the effective TypeScript project/include scope.

## Drizzle check/generate do not require a live DB

Do not hard-fail `drizzle.config.ts` when `DATABASE_URL` is absent for commands that only inspect/generate migrations. Database credentials are required for live DB operations such as migrate.

## Docker database validation

A healthy `docker compose exec postgres psql ...` proves the container DB itself is healthy, but does not prove host-side tools are connecting to that same instance. Validate host `DATABASE_URL` separately.

## ClamAV first startup

ClamAV may take time on first startup while signature data initializes. Pre-flight scripts should wait for `clamd` readiness rather than treating startup delay as scan failure.

## Scheduled jobs in replicated deployments

Do not start the same uncoordinated node-cron loop in every API replica. K'FIT jobs require coordinated ownership/locking. PostgreSQL advisory locks + durable `scheduled_job_runs` tracking are the validated V1 mechanism.

## Job idempotency

A scheduler firing once is not sufficient proof of safety. Stable `(job_key, run_key)` identity, duplicate prevention, retry-safe effects, outcome/error logging, and attempt counters are required.

## Backup copy terminology

The Sprint 0 `offsite-simulated` directory proves secondary-copy and recovery mechanics only. A folder on the same workstation/VPS is not a true off-server backup. Production requires a physically separate failure domain.

## Restore safety

Never restore a backup directly over the active database as the first recovery test. Restore into an isolated database/filesystem target, verify markers/integrity, then use a controlled promotion/recovery procedure.

## Backup encryption key

`BACKUP_ENCRYPTION_KEY` must never be committed. Production backup keys must be stored separately from the encrypted backup payloads and must not reuse Sprint 0/dev test keys.


## Staging-style auth proxy is transport validation

The Sprint 1 staging auth proxy uses a local smoke server behind Nginx to validate cookie and CSRF transport behavior before full app containers exist. This proves proxy/cookie/CSRF/session mechanics, not real database persistence. The real staging deployment must replace the smoke server with the concrete application container.


## Docker Compose service-specific validation and env files

Compose can still parse service-level `env_file` declarations for unrelated services when running commands against a single service. The Sprint 1 auth proxy harness therefore treats `.env.staging` as optional in `docker-compose.staging.yml` so Nginx-only auth validation does not require staging DB secrets.
