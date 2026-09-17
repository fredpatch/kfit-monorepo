# Current Task

> Slice: Sprint 2.4 — public landing page catalogue consumption | Date: 2026-09-17 | Status: Implemented, awaiting local validation

## Task

Consume the validated public catalogue API from the client landing page.

## Implemented scope

- Public `/` route renders the K'FIT catalogue landing page.
- Existing admin login/session shell remains available under `/admin`.
- Public page uses React Query and a dedicated catalogue API client for `GET /catalogue/services`.
- Landing page displays service cards with French labels, XAF pricing, availability, duration, capacity, components, variants and a demand CTA.
- Loading, empty and error states are present.
- Responsive CSS added for mobile and desktop layouts.
- Auth bootstrap/session checks are scoped to `/admin`, so public visitors do not trigger admin auth calls.

## Awaiting Fred validation

Run locally:

```bash
git switch sprint-2/catalogue-foundation
git pull
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Optional browser smoke check after the build:

```bash
npm run dev --workspace @kfit/client
```

Then open `/` and `/admin`.

## Explicitly out of scope for this slice

- Prospect request workflow.
- Real WhatsApp/contact routing.
- Admin UI catalogue editor.
- Variant/component/policy editors.
- Capacity computation from active subscriptions.
- Server/API/schema changes.
