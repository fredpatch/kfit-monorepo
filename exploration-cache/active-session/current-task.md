# Current Task

> Slice: Sprint 3.1 — public request/prospect intake contract | Date: 2026-09-17 | Status: Closed and locally validated

## Result

S3.1 is complete. Fred confirmed the final local validation gate green, including the real PostgreSQL concurrency/idempotency integration test after applying migration `0002_rapid_boomerang.sql`.

## Validated scope

- Shared `POST /requests` contract and stable request error taxonomy.
- Service → controller → route server structure for anonymous public intake.
- Prospect creation/reuse by normalized WhatsApp number.
- `service_requests` creation starts only in `submitted` state.
- Client-generated `submissionToken` is DB-unique and supports idempotent replay.
- Concurrent duplicate-token collisions recover through nested Drizzle transaction/SAVEPOINT and return one created + one replayed result referencing the same request.
- Archived services reject with `REQUEST_SERVICE_ARCHIVED`.
- Temporarily closed services reject with `REQUEST_SERVICE_UNAVAILABLE`.
- Waitlist-only services reject with `REQUEST_WAITLIST_REQUIRED`; S3.1 does not create waitlist entries.
- Non-public/unpublished services reject with `REQUEST_SERVICE_NOT_PUBLIC`.
- Missing/cross-service requested variants reject with the same public `REQUEST_VARIANT_INVALID` response.
- Public abuse safeguards: same-origin-or-null check, process-local IP limiter, honeypot and minimum completion time.
- Audit outcomes use an anonymous actor and do not place PII in metadata.

## Validation evidence

Fred confirmed locally on 2026-09-17:

- migration `0002` applied;
- real PostgreSQL concurrent idempotency integration test green;
- shared build/tests green;
- server typecheck/build/test suite green;
- `db:check` green;
- client typecheck regression green.

## Next slice

S3.2 — Public request form (name + phone, per service). It should consume S3.1 without redefining server business rules.
