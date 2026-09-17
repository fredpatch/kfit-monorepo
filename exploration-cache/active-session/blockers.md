# Active Blockers

> Updated: 2026-09-17

## Current technical validation pending

- **S2.6 local-dev auth/bootstrap prerequisite** — implemented but not locally validated. Unblock condition: real local API starts against PostgreSQL, Vite reaches it, empty-user `/admin` shows secure bootstrap, first admin creation/login succeeds.
- **S2.6 local validation** — Owner: Fred. Unblock condition: client typecheck/build green plus manual authenticated admin capacity/waitlist smoke and public catalogue regression confirmed.

## Before production

- **Legal validation** — privacy, consent, retention, health notice, terms/cancellation/refund and image/testimonial rules must be reviewed for the applicable Gabon context.
- **True off-server backup destination** — production must store a second encrypted backup copy outside the production VPS/storage failure domain.

## Resolved / clarified

- Reusable-pattern source resolved: Notion project/pattern pages.
- Password reset/recovery HTTP flow locally validated.
- Sponsor validation treated as confirmed for execution.
- Sprint 2.1 through S2.5 locally validated.
- Direct `/bootstrap` is not a client route; bootstrap is conditionally rendered inside `/admin` from the server bootstrap-status result.
- The prior login-screen behavior did not prove a user existed: bootstrap-status API failures were previously collapsed to `required: false`; the client now surfaces that failure explicitly.

S2.6 remains open until Fred confirms the local API/bootstrap prerequisite and the full client/manual validation gate.
