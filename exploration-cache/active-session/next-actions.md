# Next Actions

> Updated: 2026-09-17

1. S3.1 and S3.2 are closed and locally validated.
2. Keep Sprint 3 execution on `sprint-3`; do not reopen validated slices unless investigating a confirmed regression.
3. Next slice: **S3.3 — Admin request queue + contact attempts**.
4. Before implementation:
   - inspect `service_requests`, `contact_attempts` and related state-machine definitions;
   - inspect current admin routing/auth/permission patterns;
   - consult Shared API Contracts, Explicit State Transitions, Audit Event System and Domain Error Taxonomy patterns;
   - define server-first read and command contracts;
   - preserve S3.1/S3.2 behavior unchanged.
5. Implement S3.3 in server-first order: contracts → Service → Controller → Route/Middleware → server validation → admin client integration → Fred validation.
6. Do not include qualification reviews (S3.4) or waitlist management (S3.5) in S3.3.
7. Do not mark S3.3 complete until Fred confirms successful local execution and functional validation.
8. Production blockers remain separate:
   - legal validation for applicable Gabon requirements;
   - true encrypted off-server backup destination.
