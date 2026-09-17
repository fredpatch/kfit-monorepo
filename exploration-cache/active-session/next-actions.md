# Next Actions

> Updated: 2026-09-17

1. Fred validates S2.4 locally:
   - `git switch sprint-2/catalogue-foundation`
   - `git pull`
   - `npm run typecheck --workspace @kfit/client`
   - `npm run build --workspace @kfit/client`
2. Optional browser smoke check:
   - `npm run dev --workspace @kfit/client`
   - open `/` and confirm the public catalogue landing page loads seeded offers from `GET /catalogue/services`;
   - open `/admin` and confirm the existing admin auth shell still renders.
3. If green, close S2.4 in TASKS/changelog/Notion and fast-forward `main` to the validated S2.4 head as requested.
4. Keep out of scope until later Sprint 2 work:
   - real prospect request/contact workflow;
   - variant/component/policy admin editor;
   - capacity computation from active subscriptions;
   - waitlist workflow.
