# Current Task

> Slice: Sprint 2.6 — admin UI capacity / waitlist controls | Date: 2026-09-17 | Status: Implemented, local-dev prerequisite fix awaiting Fred validation

## Task

Validate the S2.6 authenticated admin catalogue capacity/waitlist UI locally before closure.

## Implemented S2.6 scope

- Admin catalogue API client reuses the existing authenticated session and CSRF mechanism.
- Admin services are loaded from the validated admin catalogue endpoint.
- Each service exposes French controls for availability, capacity mode, capacity limit and waitlist enablement.
- Unlimited capacity clears the numeric limit; limited capacity requires a positive integer.
- `waitlist_only` requires waitlist enablement.
- Archived services are read-only.
- Successful saves invalidate both admin and public catalogue queries.
- Loading, empty, fetch error, save pending, save success and save failure states are visible.
- `/admin` keeps existing bootstrap/login/session behavior; `/` keeps the public catalogue.

## Local-dev prerequisite fix implemented

The initial manual test exposed that direct Vite development had no real API process/proxy and that a failed bootstrap-status request silently fell through to the login UI. The prerequisite fix now adds:

- a real local development API composition using the existing Drizzle auth/catalogue repositories and services;
- a `dev:api` launcher that loads the repository-root `.env` explicitly;
- Vite proxying for `/auth`, `/catalogue` and `/health` to the local API;
- explicit bootstrap-status failure UI instead of silently treating the failure as `required: false`;
- first-run local bootstrap creates the privileged V1 identity with role `admin`, without seeded/default credentials.

This prerequisite is implemented/static-only until Fred runs it locally.

## Validation gate

### Local API/bootstrap prerequisite
- [ ] Server build passes.
- [ ] `npm run dev:api` starts against the local PostgreSQL database.
- [ ] `GET /health` through Vite/local browser routing reaches the real API.
- [ ] With an empty `users` table, `/admin` shows `Initialisation sécurisée`.
- [ ] Bootstrap creates the first local admin through the UI.
- [ ] After bootstrap, `/admin` shows the login form and the created credentials can authenticate.

### S2.6 client gate
- [ ] `npm run typecheck --workspace @kfit/client`
- [ ] `npm run build --workspace @kfit/client`
- [ ] Admin catalogue services load.
- [ ] Open/unlimited save succeeds.
- [ ] Limited positive integer capacity save succeeds.
- [ ] Waitlist-enabled + `waitlist_only` save succeeds.
- [ ] Invalid combinations are blocked.
- [ ] Archived services are not editable.
- [ ] Refresh restores persisted values.
- [ ] Public `/` catalogue still loads and reflects saved availability after refresh.

## Closure rule

Do not mark S2.6 complete, update `changelog.md`, or fast-forward `main` to the S2.6 implementation until Fred confirms the complete prerequisite + S2.6 gate green.
