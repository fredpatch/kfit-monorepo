# Next Actions

> Updated: 2026-09-17

1. Fred pulls `sprint-2/catalogue-foundation` and validates S2.6 locally.
2. Run:
   - `npm run typecheck --workspace @kfit/client`
   - `npm run build --workspace @kfit/client`
3. Manually smoke the authenticated admin capacity workspace:
   - login/admin session;
   - catalogue read;
   - open/unlimited save;
   - limited positive-integer capacity save;
   - waitlist-enabled + waitlist-only save;
   - invalid-combination handling;
   - archived-service read-only behavior;
   - persistence after refresh;
   - public catalogue regression/reflection after refresh.
4. If any check fails: diagnose exact output/behavior, apply the smallest fix, commit, and retest only the affected gate plus required regression checks.
5. If the full gate is green:
   - mark S2.6 validated/closed in repo state;
   - update `changelog.md`;
   - set S2.6 Notion task to `Terminé` and sync Sprint 2/dashboard;
   - fast-forward `main` to the validated S2.6 closure head.
6. Only after S2.6 closure, evaluate the prospect request/contact workflow as the next implementation boundary.
