---
titre: Scripts npm
public: développeur
statut: à jour
vérifié-sur: généré (npm run docs:check en CI)
couvre: [DOC-01a]
---

# Scripts npm

> Fichier généré — ne pas modifier à la main (npm run docs:generate).

100 scripts.

## `package.json`

Lancer depuis la racine : `npm run <script>`.

| Script | Commande |
| --- | --- |
| `security:check` | `node packages/server/scripts/security/check-runtime-floor.mjs` |
| `docs:generate` | `node packages/server/scripts/docs/generate-references.mjs` |
| `docs:check` | `node packages/server/scripts/docs/generate-references.mjs --check` |
| `seed:cadence-history` | `npm run seed:cadence-history --workspace @kfit/server` |
| `db:generate:cadence-history` | `npm run db:generate:cadence-history --workspace @kfit/server` |
| `preflight:cadence-history` | `npm run preflight:cadence-history --workspace @kfit/server` |
| `preflight:receipts` | `npm run preflight:receipts --workspace @kfit/server` |
| `preflight:finance` | `npm run preflight:finance --workspace @kfit/server` |
| `preflight:quotes` | `npm run preflight:quotes --workspace @kfit/server` |
| `preflight:payment-proofs` | `npm run preflight:payment-proofs --workspace @kfit/server` |
| `preflight:progress-goals` | `npm run preflight:progress-goals --workspace @kfit/server` |
| `preflight:follow-ups` | `npm run preflight:follow-ups --workspace @kfit/server` |
| `preflight:appointments` | `npm run preflight:appointments --workspace @kfit/server` |
| `typecheck` | `npm run typecheck --workspaces --if-present` |
| `test` | `npm run test --workspaces --if-present` |
| `test:integration` | `npm run test:integration --workspace @kfit/server` |
| `build` | `npm run build --workspaces --if-present` |
| `dev:api` | `npm run dev:api --workspace @kfit/server` |
| `dev:api:watch` | `npm run dev:api:watch --workspace @kfit/server` |
| `start:prod` | `npm run start:prod --workspace @kfit/server` |
| `dev:client` | `npm run dev --workspace @kfit/client` |
| `db:up` | `docker compose up -d postgres` |
| `db:down` | `docker compose down` |
| `db:logs` | `docker compose logs -f postgres` |
| `db:reset` | `docker compose down -v && docker compose up -d postgres` |
| `db:check` | `npm run db:check --workspace @kfit/server` |
| `preflight:onboarding-uniqueness` | `npm run preflight:onboarding-uniqueness --workspace @kfit/server` |
| `preflight:consents` | `npm run preflight:consents --workspace @kfit/server` |
| `preflight:subscription-lifecycle` | `npm run preflight:subscription-lifecycle --workspace @kfit/server` |
| `db:generate` | `npm run db:generate --workspace @kfit/server` |
| `db:migrate` | `npm run db:migrate --workspace @kfit/server` |
| `db:test:prepare` | `npm run db:test:prepare --workspace @kfit/server` |
| `privacy:replay` | `npm run privacy:replay --workspace @kfit/server --` |
| `ops:backup` | `npm run ops:backup --workspace @kfit/server --` |
| `ops:restore` | `npm run ops:restore --workspace @kfit/server --` |
| `ops:restore-drill` | `npm run ops:restore-drill --workspace @kfit/server --` |
| `privacy:journal-sync` | `npm run privacy:journal-sync --workspace @kfit/server` |
| `preflight:otp` | `npm run preflight:otp --workspace @kfit/server` |
| `preflight:smtp` | `npm run preflight:smtp --workspace @kfit/server` |
| `preflight:files` | `npm run preflight:files --workspace @kfit/server` |
| `preflight:pdf` | `npm run preflight:pdf --workspace @kfit/server` |
| `preflight:jobs` | `npm run preflight:jobs --workspace @kfit/server` |
| `preflight:backup` | `npm run preflight:backup --workspace @kfit/server` |
| `preflight:auth-staging` | `npm run preflight:auth-staging --workspace @kfit/server` |
| `preflight:auth-recovery` | `npm run preflight:auth-recovery --workspace @kfit/server` |
| `seed:catalogue` | `npm run seed:catalogue --workspace @kfit/server` |
| `seed:demo-admin` | `npm run build --workspace @kfit/shared && npm run seed:demo-admin --workspace @kfit/server` |
| `seed:demo-consents` | `npm run build --workspace @kfit/shared && npm run seed:demo-consents --workspace @kfit/server` |
| `seed:subscription-duration-snapshots` | `npm run seed:subscription-duration-snapshots --workspace @kfit/server` |
| `preflight:catalogue-seed` | `npm run preflight:catalogue-seed --workspace @kfit/server` |

## `packages/shared/package.json`

Lancer depuis la racine : `npm run <script> --workspace @kfit/shared`.

| Script | Commande |
| --- | --- |
| `typecheck` | `tsc --noEmit` |
| `build` | `tsc` |
| `test` | `npm run build && node --test "dist/**/*.test.js"` |

## `packages/server/package.json`

Lancer depuis la racine : `npm run <script> --workspace @kfit/server`.

| Script | Commande |
| --- | --- |
| `seed:cadence-history` | `npm run build && node ./scripts/dev/initialize-cadence-history.mjs` |
| `db:generate:cadence-history` | `node ./scripts/db/generate-cadence-history.mjs` |
| `preflight:cadence-history` | `node ./scripts/preflight/cadence-history.mjs` |
| `preflight:receipts` | `node ./scripts/preflight/receipts.mjs` |
| `preflight:finance` | `node ./scripts/preflight/finance.mjs` |
| `preflight:quotes` | `node ./scripts/preflight/quotes.mjs` |
| `preflight:payment-proofs` | `node ./scripts/preflight/payment-proofs.mjs` |
| `preflight:progress-goals` | `node ./scripts/preflight/progress-goals.mjs` |
| `preflight:follow-ups` | `node ./scripts/preflight/follow-ups.mjs` |
| `preflight:appointments` | `node ./scripts/preflight/appointments.mjs` |
| `typecheck` | `tsc --noEmit` |
| `build` | `tsc` |
| `test` | `npm run build && node --test "dist/**/*.test.js" "scripts/**/*.test.mjs"` |
| `test:integration` | `npm run build && node --env-file-if-exists=../../.env --env-file=../../.env.test --test --test-concurrency=1 "dist/**/*.integration.js"` |
| `dev:api` | `npm run build && node ./scripts/dev/api-server.mjs` |
| `dev:api:watch` | `node ./scripts/dev/api-watch.mjs` |
| `start:prod` | `node ./scripts/prod/api-server.mjs` |
| `dev:auth-staging-smoke` | `node ./scripts/dev/auth-staging-smoke-server.mjs` |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate` |
| `db:test:prepare` | `npm run build && node ./scripts/db/prepare-test-database.mjs` |
| `privacy:replay` | `npm run build && node ./scripts/privacy/replay.mjs` |
| `privacy:journal-sync` | `npm run build && node ./scripts/privacy/journal-sync.mjs` |
| `ops:backup` | `npm run build && node ./scripts/ops/backup.mjs` |
| `ops:restore` | `npm run build && node ./scripts/ops/restore.mjs` |
| `ops:restore-drill` | `npm run build && node ./scripts/ops/restore-drill.mjs` |
| `db:check` | `drizzle-kit check` |
| `preflight:onboarding-uniqueness` | `node ./scripts/preflight/onboarding-uniqueness.mjs` |
| `preflight:consents` | `node ./scripts/preflight/consents.mjs` |
| `preflight:subscription-lifecycle` | `node ./scripts/preflight/subscription-lifecycle.mjs` |
| `preflight:otp` | `node ./scripts/preflight/otp.mjs` |
| `preflight:smtp` | `node ./scripts/preflight/smtp.mjs` |
| `preflight:files` | `node ./scripts/preflight/files.mjs` |
| `preflight:pdf` | `node ./scripts/preflight/pdf.mjs` |
| `preflight:jobs` | `node ./scripts/preflight/jobs.mjs` |
| `preflight:backup` | `node ./scripts/preflight/backup-restore.mjs` |
| `preflight:auth-staging` | `node ./scripts/preflight/auth-staging.mjs` |
| `preflight:auth-recovery` | `node ./scripts/preflight/password-recovery.mjs` |
| `seed:catalogue` | `node ./dist/db/seeds/catalogue.seed.js` |
| `seed:demo-admin` | `npm run build && node ./scripts/dev/seed-demo-admin.mjs` |
| `seed:demo-consents` | `npm run build && node ./scripts/dev/seed-demo-consents.mjs` |
| `seed:subscription-duration-snapshots` | `node ./scripts/dev/backfill-subscription-duration.mjs` |
| `preflight:catalogue-seed` | `node ./scripts/preflight/catalogue-seed.mjs` |

## `packages/client/package.json`

Lancer depuis la racine : `npm run <script> --workspace @kfit/client`.

| Script | Commande |
| --- | --- |
| `dev` | `vite` |
| `typecheck` | `npm run build --workspace @kfit/shared && tsc --noEmit` |
| `build` | `vite build` |
| `preview` | `vite preview` |
