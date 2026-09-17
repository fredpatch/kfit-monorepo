# Next Actions

> Updated: 2026-09-17

1. Fred pulls `sprint-2/catalogue-foundation`.
2. Validate the new local API/bootstrap prerequisite first:
   - ensure repository-root `.env` contains `DATABASE_URL` and a development `AUTH_OTP_PEPPER` of at least 32 characters;
   - start PostgreSQL;
   - run server build;
   - run `npm run dev:api`;
   - in a second terminal run `npm run dev:client`;
   - verify `/admin` reaches the real bootstrap-status endpoint.
3. If the local database has no users, `/admin` must show `Initialisation sécurisée`; create the first local admin through the UI, then verify login with that same account.
4. Run the S2.6 client static gate:
   - `npm run typecheck --workspace @kfit/client`
   - `npm run build --workspace @kfit/client`
5. Manually smoke the authenticated admin capacity workspace:
   - catalogue read;
   - open/unlimited save;
   - limited positive-integer capacity save;
   - waitlist-enabled + waitlist-only save;
   - invalid-combination handling;
   - archived-service read-only behavior;
   - persistence after refresh;
   - public catalogue regression/reflection after refresh.
6. If any check fails: diagnose exact output/behavior, apply the smallest fix, commit, and retest only the affected gate plus required regression checks.
7. If the full prerequisite + S2.6 gate is green:
   - mark S2.6 validated/closed in repo state;
   - update `changelog.md`;
   - set S2.6 Notion task to `Terminé` and sync Sprint 2/dashboard;
   - fast-forward `main` to the validated S2.6 closure head.
8. Only after S2.6 closure, evaluate the prospect request/contact workflow as the next implementation boundary.
