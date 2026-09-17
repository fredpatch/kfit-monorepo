# Current Task

> Slice: Sprint 2.6 — admin UI capacity / waitlist controls | Date: 2026-09-17 | Status: Implemented, awaiting Fred validation

## Task

Validate the S2.6 authenticated admin catalogue capacity/waitlist UI locally before closure.

## Implemented scope

- Admin catalogue API client reuses the existing authenticated session and CSRF mechanism.
- Admin services are loaded from the validated admin catalogue endpoint.
- Each service exposes French controls for availability, capacity mode, capacity limit and waitlist enablement.
- Unlimited capacity clears the numeric limit; limited capacity requires a positive integer.
- `waitlist_only` requires waitlist enablement.
- Archived services are read-only.
- Successful saves invalidate both admin and public catalogue queries.
- Loading, empty, fetch error, save pending, save success and save failure states are visible.
- `/admin` keeps existing bootstrap/login/session behavior; `/` keeps the public catalogue.

## Validation gate

- [ ] `npm run typecheck --workspace @kfit/client`
- [ ] `npm run build --workspace @kfit/client`
- [ ] Admin login succeeds locally.
- [ ] Admin catalogue services load.
- [ ] Open/unlimited save succeeds.
- [ ] Limited positive integer capacity save succeeds.
- [ ] Waitlist-enabled + `waitlist_only` save succeeds.
- [ ] Invalid combinations are blocked.
- [ ] Archived services are not editable.
- [ ] Refresh restores persisted values.
- [ ] Public `/` catalogue still loads and reflects saved availability after refresh.

## Closure rule

Do not mark S2.6 complete, update `changelog.md`, or fast-forward `main` to the S2.6 implementation until Fred confirms the complete gate green.
