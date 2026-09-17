# Current Task

> Slice: Sprint 2.6 — admin UI capacity / waitlist controls | Date: 2026-09-17 | Status: Implemented, bootstrap prerequisite locally validated, catalogue retest pending

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

## Local-dev prerequisite status

Fred locally confirmed on 2026-09-17 that the real bootstrap/login flow now works and that an admin session can be established through the application.

Validated prerequisite behavior:

- real local API process is reachable by the client;
- `/admin` first-run bootstrap is usable;
- first local privileged identity can be created through the bootstrap UI;
- created credentials can authenticate and restore an active admin session.

The first S2.6 UI smoke then exposed a routing gap: the Vite proxy forwarded `/catalogue` but not the admin route prefix `/admin/catalogue`. Commit `057f091` adds `/admin/catalogue` to the local API proxy.

## Validation gate

### Local API/bootstrap prerequisite
- [x] Real local API/client routing works.
- [x] `/admin` bootstrap flow is reachable when required.
- [x] Bootstrap creates the first local admin through the UI.
- [x] Created credentials can authenticate and restore an active admin session.

### S2.6 client gate
- [ ] `npm run typecheck --workspace @kfit/client`
- [ ] `npm run build --workspace @kfit/client`
- [ ] Admin catalogue services load after proxy fix `057f091`.
- [ ] Open/unlimited save succeeds.
- [ ] Limited positive integer capacity save succeeds.
- [ ] Waitlist-enabled + `waitlist_only` save succeeds.
- [ ] Invalid combinations are blocked.
- [ ] Archived services are not editable.
- [ ] Refresh restores persisted values.
- [ ] Public `/` catalogue still loads and reflects saved availability after refresh.

## Closure rule

Do not mark S2.6 complete, update `changelog.md`, or fast-forward `main` to the S2.6 implementation until Fred confirms the remaining S2.6 client gate green.
