# Technical Gotchas

## S7.1 cadence migration generation and legacy authority

- Use the separately approved `npm run db:generate:cadence-history` wrapper for the initial cadence-history migration: Drizzle's current schema API cannot express the PostgreSQL GiST exclusion guard. The wrapper generates the table/checks/indexes normally, then deterministically emits approved btree_gist extension and half-open no-overlap SQL. Never hand-edit generated migration/snapshot output.
- `seed:cadence-history` is a guarded, one-off local helper for the reviewed two-subscription scope, not a general historical backfill. It loads root `.env`, rejects inherited DATABASE_URL and unexpected targets/counts, starts authority only at execution time, and skips existing history. Any new initialization scope needs its own review/approval; never backdate from subscription start/creation.
- Catalogue seed and cadence source writers share transaction advisory fence key `7247001` before owner row locks. Future cadence/variant writers must join the same protocol and atomic history boundary. Current history may have gaps before prospective authority; such weekly overdue points are unavailable, not zero.

## Existing payment-proof allocation-order assertion

During S7.1, three real PostgreSQL runs failed the unchanged full-confirmation assertion in `payment-proofs.repository.integration.ts:152`: expected allocation amounts `[8000,12000]`, actual `[12000,8000]`. The existing finance reader orders equal-createdAt allocations by UUID, not FIFO installment sequence; S7.1 preserves that query and ledger calculation. Reviewer/QA confirmed no S7.1 regression from this evidence. Latest run: **541/542**, all **35 new S7.1 cases passed**.

The full integration suite remains failed. The three-attempt loop breaker stopped retries; no assertion was weakened or S6 test changed. Investigate/harden the allocation-order contract or assert FIFO allocation-to-installment facts in a separately authorized change. Fred's S7.1 acceptance is separate from these measured agent results and does not establish that this failure was fixed.

Actual catalogue-seed-versus-override/activation races were code-inspected but not directly runtime-tested in S7.1; helper atomicity and database exclusion concurrency were tested. Preserve this coverage distinction in future validation reports.

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


## Integration concurrency test flakiness

One unchanged Sprint 3 PostgreSQL concurrency test may fail intermittently and pass on immediate approved retry. During S4.2 validation it failed once, then the full integration suite passed 35/35 on retry.

Handling:
- do not treat the first failure as automatically acceptable;
- inspect that the failure is the known unchanged Sprint 3 concurrency case;
- rerun the integration suite once;
- any S4.2 failure, repeated Sprint 3 failure, or different failure keeps the validation gate red;
- harden the test separately rather than weakening concurrency assertions.

## Tests: integration database isolation (TEST-01)

Category: Tests.
- POL-01 incident (2026-10-25): integration tests and the dev API shared kfit_dev. The dev jobs (notifications reconcile, delivery, privacy purge) wrote rows on live test fixtures, so cleanups failed on FKs.
- Result: 58 leaked subscriptions and a published synthetic consent text stayed in kfit_dev until a manual, id-scoped delete.
- Rule: integration = kfit_test only (localhost:5433/kfit_test, root `.env.test`, `npm run db:test:prepare`). The single guard is `assertLocalTestDatabase` in src/testing/integration-fixtures.ts; the dev API refuses to start on kfit_test.

## Security: runtime floor (SEC-01)

Category: Security.
- CVE-2026-111497 (published 2026-10-22): Node's Brotli decoder has an out-of-bounds write; patched in 22.23.4, 24.22.1, 26.12.1.
- Express 5 / body-parser 2.x decode `Content-Encoding: br` (and gzip/deflate) request bodies by default; the API now answers 415 REQUEST_ENCODING_UNSUPPORTED to any request body encoding other than identity, before every parser.
- The runtime floor is enforced by the security-floor registry (packages/server/src/security/security-floor.ts): startup refuses production below it, CI and `npm run security:check` fail below it. A new runtime advisory = one registry entry.
