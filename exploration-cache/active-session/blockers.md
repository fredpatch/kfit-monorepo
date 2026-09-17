# Active Blockers

> Updated: 2026-09-17

## Current technical validation pending

- None for S3.1 or S3.2. Both slices are locally validated and closed.

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- Sprint 2.1 through S2.6 locally validated and closed.
- S3.1 public request/prospect intake locally validated, including migration `0002` and real-PostgreSQL concurrent same-token idempotency.
- S3.2 public request form locally validated, including DB verification of single-row persistence for rapid duplicate submission.
- Local Vite proxy preserves forwarded browser host for same-origin-protected admin mutations and proxies `/requests` for public intake.
- Public service gating and requested-variant rules remain server-authoritative.

## Known non-blocking notes

- Public IP rate limiting is process-local/in-memory and should be revisited for multi-replica production topology.
- Deployment `trust proxy` behavior remains a production/staging wiring concern.
- Prospect-reuse race, rate-limiter memory growth, timing clock-skew hardening, audit symmetry and router origin-helper deduplication remain backlog/gotcha-level improvements.
- Client test framework is still absent; S3.2 followed the existing client validation convention of typecheck/build plus Fred functional validation.
- S3.2 reviewer noted only cosmetic transient-action styling and non-blocking refetch/double-click edge notes.

Next active implementation boundary is S3.3 admin request queue + contact attempts.
