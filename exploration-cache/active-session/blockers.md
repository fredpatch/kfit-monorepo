# Active Blockers

> Updated: 2026-09-17

## Current technical validation pending

- None for S3.1. The slice is locally validated and closed.

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- Sprint 2.1 through S2.6 locally validated and closed.
- S3.1 public request/prospect intake locally validated.
- Migration `0002_rapid_boomerang.sql` applied locally.
- Concurrent same-token idempotency path validated against real PostgreSQL.
- Public service gating rule resolved: archived, temporarily closed, waitlist-only and non-public/unpublished services are rejected with stable typed errors.
- Requested variant rule resolved: nonexistent and cross-service variants collapse to public `REQUEST_VARIANT_INVALID`.
- Remote Sprint 3 execution branch normalized from the validated `main` S3.1 head without history rewrite.

## Known non-blocking notes

- Public IP rate limiting is process-local/in-memory and should be revisited for multi-replica production topology.
- Deployment `trust proxy` behavior remains a production/staging wiring concern.
- Prospect-reuse race, rate-limiter memory growth, timing clock-skew hardening, audit symmetry and router origin-helper deduplication remain backlog/gotcha-level improvements, not S3.1 blockers.

Next active implementation boundary is S3.2 public request form.
