# Current Task

> Slice: Sprint 2.6 — admin UI capacity / waitlist controls | Date: 2026-09-17 | Status: Closed and locally validated

## Result

S2.6 is complete. Fred confirmed the full local validation gate green after the local-development routing/bootstrap prerequisite was fixed.

## Validated scope

- Authenticated admin catalogue workspace loads existing services.
- Capacity mode, capacity limit, availability state and waitlist enablement are editable in French UI.
- Open/unlimited, limited positive-integer capacity, and waitlist-only mutations succeed.
- Invalid combinations are blocked.
- Archived services are read-only.
- Saved values persist after refresh.
- Public catalogue remains functional and reflects saved availability.
- Client typecheck and production build are green.
- Real local API/bootstrap/login path works against PostgreSQL/Drizzle.
- Vite proxies `/auth`, `/catalogue`, `/admin/catalogue` and `/health` to the local API.
- No S2.6 database migration was required.

## Sprint boundary

Sprint 2 is now closed and locally validated.

Next selected backlog task for Sprint 3: **Public request form (name + phone, per service)**. It remains not started and must begin on a Sprint 3 execution branch after pattern/backlog inspection.
