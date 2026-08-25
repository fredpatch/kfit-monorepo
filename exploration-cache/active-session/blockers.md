# Active Blockers

> Updated: 2026-08-25

## Governance

- **Sponsor validation** — Konny must confirm the consolidated V1 Core / V1.1 split and business rules before scope-dependent business modules proceed.

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- **Reusable-pattern source** — resolved for Sprint 1 continuation. The reusable implementation patterns are recorded as Notion project/pattern pages, not a local Markdown folder.
- **Password reset/recovery HTTP flow** — resolved and locally validated by Fred, including server tests, PostgreSQL hard commit, session/trusted-device revocation, `db:check`, and real SMTP/Mailpit HTTP/email preflight.

## Not blockers for closed Sprint 1 auth foundation

The governance/production items above did not block Sprint 1 auth foundation implementation or the post-closure recovery HTTP slice. They remain gates before scope-dependent business modules or production readiness.
