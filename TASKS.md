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
5. [ ] S2.5 — Capacity/waitlist controls — implemented at `2f13fd66aa6e469b4f302a9591e9f030ce480eb6`; awaiting Fred local validation.

### S2.5 validation gate

Fred must confirm green before S2.5 can be checked complete:

```bash
git switch sprint-2/catalogue-foundation
git pull

npm run build --workspace @kfit/shared
node --test packages/shared/dist/catalogue/contracts.test.js

npm run build --workspace @kfit/server
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js

npm run db:check
```

Expected: shared/server builds green, catalogue contract/service/Express tests green, `db:check` green, no migration expected.
