# Next Actions

> Updated: 2026-09-17

1. S3.1 is closed and locally validated.
2. Keep Sprint 3 execution on `sprint-3`; do not reopen S3.1 unless investigating a confirmed regression.
3. Next slice: **S3.2 — Public request form (name + phone, per service)**.
4. Before implementation:
   - inspect the current public catalogue page and request API contract;
   - reuse the existing S3.1 submission token, abuse-protection fields and typed errors;
   - keep server rules authoritative;
   - preserve French-first UI and responsive behavior.
5. Implement only S3.2 client integration:
   - request API client;
   - per-service form entry point;
   - name + phone + optional variant context as approved by the contract;
   - submission token generation;
   - honeypot/minimum-time support;
   - loading/disabled/success/error feedback;
   - public catalogue regression protection.
6. Fred validates client typecheck/build and manual browser submission behavior locally before S3.2 can close.
7. Do not start S3.3 admin request queue until S3.2 is testable and locally validated.
8. Production blockers remain separate:
   - legal validation for applicable Gabon requirements;
   - true encrypted off-server backup destination.
