# Active Blockers

> Updated: 2026-09-17

## Current technical validation pending

- None for Sprint 2. S2.1 through S2.6 are locally validated and closed.

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- Reusable-pattern source resolved: Notion project/pattern pages.
- Password reset/recovery HTTP flow locally validated.
- Sponsor validation treated as confirmed for execution.
- Sprint 2.1 through S2.6 locally validated.
- Real local API/bootstrap/login path validated.
- `/admin/catalogue` local proxy gap fixed and validated.
- Direct `/bootstrap` is not a client route; bootstrap is conditionally rendered inside `/admin` from the server bootstrap-status result.

Sprint 3 has not started yet; no Sprint 3 implementation blocker is currently recorded.
