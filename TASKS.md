# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Sprint 0 initialization closed and locally validated.

## Sprint 1 — Authentication, sessions, OTP and security

- [x] Sprint 1 auth foundation closed and locally validated.
- [x] Deferred password reset/recovery HTTP flow closed and locally validated.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: implementation continues on `sprint-2/catalogue-foundation`. Local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Current execution order

1. [x] S2.1 — Catalogue public API foundation — locally validated.
2. [x] S2.2 — Initial services/variants/components/policies seed — locally validated.
3. [x] S2.3 — Admin catalogue editing foundation — locally validated.
4. [x] S2.4 — Public landing page catalogue consumption — locally validated.
5. [x] S2.5 — Capacity/waitlist controls — locally validated by Fred on 2026-09-17.
6. [ ] S2.6 — Admin UI capacity/waitlist controls — implemented through `87010ce5d0ca44716fae71748b9ab289add11f2b`; awaiting Fred local validation.

### S2.6 implemented scope

- Authenticated admin workspace lists existing catalogue services.
- Admin catalogue API client reuses the validated S2.5 admin list and capacity PATCH contracts.
- Capacity mode, capacity limit, availability state and waitlist enablement are editable in French UI.
- Archived services are read-only.
- Client-side validation mirrors the authoritative S2.5 invariants for immediate feedback without replacing server validation.
- Admin requests reuse cookie session + CSRF handling; no new auth mechanism.
- React Query invalidates admin and public catalogue caches after successful mutations.
- Loading, empty, error, save-pending and success/error feedback states are present.
- Public landing route and existing admin auth/bootstrap/login shell remain mounted separately.
- No server, schema or migration change.

### S2.6 validation gate

```bash
git switch sprint-2/catalogue-foundation
git pull

npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Then manually validate locally:

- login as admin under `/admin`;
- catalogue services load in the capacity workspace;
- save an unlimited/open service state;
- save a limited capacity with a positive integer;
- enable waitlist then save `Liste d’attente uniquement`;
- confirm invalid combinations are blocked and archived services remain read-only;
- refresh and confirm saved values persist;
- confirm `/` public catalogue still loads and reflects the updated availability after refresh.

Do not mark S2.6 complete or update `changelog.md` until Fred confirms the gate green.
