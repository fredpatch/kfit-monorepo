# Session Context

> Date: 2026-08-25 | Sprint: Sprint 0 closure

## Where we left off

Sprint 0 technical foundations have been implemented and locally validated. The repository contains the monorepo structure, PostgreSQL/Drizzle schema, Docker dev services, and pre-flight harnesses for OTP/SMTP, private files + ClamAV, Puppeteer PDF generation, scheduled jobs, and encrypted backup/isolated restore.

## Validated today

- Root monorepo typecheck after workspace TypeScript fixes
- Drizzle check/generate and initial migration
- Native PostgreSQL and Docker PostgreSQL connectivity
- Docker PostgreSQL moved to host port 5433 to coexist with native PostgreSQL on 5432
- Mailpit SMTP + Nodemailer send test
- OTP generation/hash/expiry/single-use/resend/lockout
- Private storage policy, file signatures, 10 MB limit, ClamAV clean + EICAR detection
- Puppeteer French branded multi-page PDF generation
- node-cron tick, PostgreSQL advisory lock, stable run idempotency, failure/retry metrics
- AES-256-GCM PostgreSQL + private-file backup, secondary-copy recovery, isolated restore, SHA-256 verification

## State of the codebase

- Sprint 0 infrastructure is implementation-ready.
- No functional V1 business routes/services have been started.
- Sprint 1 must remain server-first and use the reusable authentication/OTP blueprints.

## Active constraints

- Do not bypass the reusable-pattern review before implementing covered capabilities.
- Record the local reusable-pattern library path before Sprint 1 implementation begins.
- Sponsor scope validation remains open.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.
