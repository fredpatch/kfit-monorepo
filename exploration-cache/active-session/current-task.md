# Current Task

> Slice: Sprint 3.2 — public request form | Date: 2026-09-17 | Status: Closed and locally validated

## Result

S3.2 is complete. Fred confirmed the full client/manual validation gate green, including direct PostgreSQL inspection through DBeaver for the rapid double-submit/idempotency case.

## Validated scope

- Public catalogue mailto CTA replaced by a real inline request form.
- Open services allow a request intent; temporarily closed and waitlist-only services do not expose normal submission.
- Required fields are full name + WhatsApp; a service-scoped variant selector is shown when variants exist.
- The client consumes the validated S3.1 `POST /requests` contract through a dedicated requests API client.
- One client-generated `submissionToken` is created per request intent and reused across transient retries and accidental duplicate submits.
- `website` honeypot and `formRenderedAt` are sent exactly as required by S3.1.
- Typed request failures are translated to French; raw error codes/reasons are not shown.
- Success displays the server request reference and resets to a fresh token only for a new intent.
- Vite dev proxy includes `/requests`; no server/shared/schema/migration changes were required.
- No new client dependencies were added.

## Validation evidence

Fred confirmed locally on 2026-09-17:

- shared build green;
- client typecheck green;
- client production build green;
- valid open-service submission green;
- service-scoped variant submission green;
- rapid double-submit persisted exactly one `service_requests` row in PostgreSQL, verified with DBeaver;
- transient retry path green;
- temporarily-closed and waitlist-only behavior green;
- stale/archive race rejection localized correctly;
- required field validation, honeypot accessibility behavior and mobile layout green;
- public catalogue regression green.

## Next slice

S3.3 — Admin request queue + contact attempts. Begin with schema/state-machine/pattern inspection and keep implementation server-first.
