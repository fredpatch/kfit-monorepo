# Active Blockers

> Updated: 2026-08-25

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- **Reusable-pattern source** — resolved. The reusable implementation patterns are recorded as Notion project/pattern pages, not a local Markdown folder.
- **Password reset/recovery HTTP flow** — resolved and locally validated by Fred, including server tests, PostgreSQL hard commit, session/trusted-device revocation, `db:check`, and real SMTP/Mailpit HTTP/email preflight.
- **Sponsor validation** — treated as confirmed for execution. Sprint 2 may proceed.
- **Sprint 2.1 catalogue foundation** — resolved and locally validated by Fred.
- **Sprint 2.2 initial catalogue seed** — resolved and locally validated by Fred.

## Current technical validation pending

- None for the closed S2.2 slice.
