---
titre: Architecture overview
public: développeur
statut: à jour
vérifié-sur: d2fc5df
couvre: [S7.3, S7.4a, S7.4b, SEC-01, ARCH-01]
---

# Architecture overview

Short map of the system as implemented. Detailed design lives in `exploration-cache/project/`; this page links to it instead of copying it:

- [database-schema.md](../../exploration-cache/project/database-schema.md): tables and columns
- [relational-contract.md](../../exploration-cache/project/relational-contract.md): relations and integrity rules
- [state-machines.md](../../exploration-cache/project/state-machines.md): status transitions
- [decisions.md](../../exploration-cache/project/decisions.md): architecture decisions
- [drizzle-layout.md](../../exploration-cache/project/drizzle-layout.md): ORM and migration layout

## 1. System

npm workspaces monorepo:

| Package | Role |
| --- | --- |
| `packages/shared` (`@kfit/shared`) | Contracts shared by client and server: routes, DTO types, error code lists, business-time helpers, pure rules used on both sides. |
| `packages/server` (`@kfit/server`) | Express 5 API on Node.js, TypeScript (NodeNext), Drizzle ORM on PostgreSQL 16, scheduled jobs (`node-cron`), ops scripts. |
| `packages/client` | React + Vite single-page app: the coach back office and the public token pages. |

Runtime: Node at the version in `.nvmrc`, at or above the runtime security floor. PostgreSQL runs in Docker. ClamAV scans uploaded files. SMTP sends codes and notification e-mails.

## 2. Server layering

Each module in `packages/server/src/modules/<module>/` follows **route → controller → service → repository**:

- **Express router** (`routes/express-*.router.ts`): HTTP only. Builds a request context, runs the origin and CSRF checks and the public-route rate limiter, maps results to responses.
- **Controller**: validates input, turns service results into HTTP status and body.
- **Service**: business rules, as named constants and pure functions where possible.
- **Repository** (`Drizzle*Repository`): all SQL and transactions, including row locks and audit writes in the same transaction.

Composition happens once, in `packages/server/src/runtime.ts` (`createRuntime({ mode, env })`). `dev-app.ts` and `prod-app.ts` are thin wrappers. Development tools are only mounted in development.

### Express middleware order (`src/app.ts`)

1. `requestIdMiddleware`: keeps a valid `X-Request-Id` UUID, otherwise generates one, and echoes it on every response.
2. HTTP request logger (method, redacted path, status, duration).
3. `rejectEncodedRequestBodies`: 415 `REQUEST_ENCODING_UNSUPPORTED` for any `Content-Encoding` other than `identity` (SEC-01). Counted in `security_event_counters`.
4. `express.json({ limit: "1mb" })`.
5. `GET /health`.
6. Routers: auth first, then catalogue, requests, admin requests, customers, onboarding, consents, questionnaires, subscriptions, today, dashboard analytics, notifications, privacy, dev tools (development only), appointments, follow-ups, progress, documents, finance, quotes, payment proofs, receipts.

## 3. Module map (`packages/server/src/modules`)

| Module | Responsibility |
| --- | --- |
| `appointments` | Coaching appointments and their events; public appointment pages. |
| `auth` | Admin login, OTP challenges, sessions (access + refresh), password recovery, CSRF/origin checks, audit service. |
| `catalogue` | Services, variants, components, policies, and their publication. |
| `consents` | Consent texts (versioned definitions) and consent records, public consent pages. |
| `customers` | Customer records and the customer overview. |
| `dashboard` | « Aujourd'hui » page, alerts and analytics. |
| `dev-tools` | Development-only test-data cleanup (never mounted in production). |
| `documents` | Private documents and versions, storage on disk, ClamAV scan, secure public download links. |
| `finance` | Payment plans, installments, payment events and allocations. |
| `follow-ups` | Follow-ups, their queue and cadence. |
| `notifications` | Coach notifications, e-mail outbox, settings registry, scheduled-job runner. |
| `onboarding` | Onboarding checklist items and medical clearance. |
| `payment-proofs` | Payment proofs uploaded by customers through public links. |
| `privacy` | Archive / unarchive, anonymization, retention holds, file purge job, privacy journal and replay. |
| `progress` | Goals, measurements, progress photos and summaries. |
| `questionnaires` | Questionnaire templates, submissions and answers. |
| `quotes` | Quotes and their versions, public quote pages. |
| `receipts` | Receipts, PDF rendering, public receipt links. |
| `requests` | Public service requests, prospects, contact attempts, qualification, conversion. |
| `subscriptions` | Subscriptions, status history, pauses, components. |

Cross-cutting: `src/security/` (security floor, encoding guard, security event counters), `src/runtime/production-guards.ts` (refuse-to-start checks), `src/ops/` (backup, restore, drill), `src/http/` (request id), `src/logging/`.

## 4. Security model

- **Admin session**:
  - cookies `kfit_access` (access JWT), `kfit_refresh` and `kfit_csrf`;
  - the session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production;
  - refresh tokens are stored as peppered hashes;
  - inactivity and absolute session lifetimes come from `AUTH_*_TTL_MS` settings;
  - sensitive admin actions require a recent OTP (fresh OTP window).
- **CSRF and origin**:
  - state-changing admin requests need the double-submit token (`kfit_csrf` cookie = `x-csrf-token` header);
  - a request carrying an `Origin` header must match the host (`AUTH_ORIGIN_INVALID` otherwise).
- **Public links** (`secure_access_tokens`):
  - only a hash of the token is stored;
  - each token is scoped to one resource and action, expires, can be revoked, and can carry a use limit and an OTP requirement;
  - public routes are rate limited per IP (`RATE_LIMITED:<module>` counted per day);
  - tokens are redacted from request logs.
- **Audit**: `audit_events` stores actor, action, result and the request id; IP and user agent are stored only as peppered hashes.
- **Archived-subject freeze** (ARCH-01): writes on an archived customer or prospect are refused (`CUSTOMER_ARCHIVED`, `PROSPECT_ARCHIVED`, 409), except the exemptions listed in the privacy module; public links of an archived subject are revoked at archive time.
- **Uploads**: size limit, file-signature check against the declared type, ClamAV scan before storage.
- **Runtime security floor** (SEC-01): a production start below the floor is refused; development warns; CI fails ([runbook](../runbooks/plancher-securite.md)).
- **Production start guards** (S7.4a): env present and not placeholder, strong secrets, https base URL, no dev/test database, writable privacy journal, privacy jobs on, no published demo consent ([runbook](../runbooks/demarrage-production.md)).

## 5. Data and privacy model

- PostgreSQL schema in `packages/server/src/db/schema/`; migrations generated by drizzle-kit in `packages/server/src/db/migrations/` (never edited by hand).
- Integration tests run only against the local `kfit_test` database; the dev API runs on `kfit_dev`.
- **Lifecycle of a subject** (customer or prospect), in order:
  1. **archive**: only when nothing is in progress; writes are then frozen;
  2. **anonymize**: requires the confirmation name; one declarative plan (`ANONYMIZATION_PLAN`) replaces identity with a pseudonym (« Client anonymisé · XXXX »), wipes free text, health answers and notes, and keeps finance records unchanged;
  3. **purge**: the subject's private files are deleted after `privacy.purge.delay_days` (default 30, 1–365, set in Réglages).
- **Retention holds** (legal, dispute, accounting) block both anonymization and purge.
- Each anonymization is written to the database (`anonymization_events`) and appended to an off-database **privacy journal** (`KFIT_PRIVACY_JOURNAL_DIR`, ids only). After a restore, **replay** re-applies every executed anonymization from journal ∪ database, so a restore from an older backup never resurrects anonymized data.
- **Backups** (S7.4b): encrypted bundle (database, private files, journal) with a signed manifest; restore merges the journal instead of overwriting it ([runbook](../runbooks/sauvegarde-restauration.md)).
- Job runs: `scheduled_job_runs` ([jobs](../reference/jobs.md)). Error codes: [reference](../reference/codes-erreur.md).
