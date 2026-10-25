# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

Sprint 6 S6.1–S6.4 are validated and Sprint 6 is closed on `main`. The former `sprint-5` branch remains historical.

```text
Branch            main
Sprint            7 — Dashboard, notifications, rétention, sauvegardes et durcissement
Active slice      S7.3a — privacy server (archive, anonymize, holds, purge job, journal + replay)
Workflow state    AWAITING_HUMAN_VALIDATION — S7.3a delivered 2026-10-25, uncommitted (sprint-7.md § S7.3a execution)
Last validated    S7.2 — validated by Fred 2026-10-25
Implementation    2dc7c43 (S7.2a server) + 0eac6d4 (S7.2b client, UX-16)
S7.2 delivered    S7.2a server (engine, outbox, jobs, API, migration 0014) + S7.2b client (UX-16 bell, panel, Réglages)
S7.3 rules        Fred 2026-10-25: rules 2–9 approved, rule 1 amended; decisions D1–D12 in sprint-7.md
S7.3a delivered   migration 0015, privacy module (archive, anonymize, holds, purge job, journal, privacy:replay/journal-sync); unit 569, integration 566
Recette 2026-10-25 fixes
  REG-F1          variant-less offers qualify and convert (R1–R4, no migration); validated by Fred 2026-10-25 (001f55d)
  CONS-02a        optional consents + consent texts admin API (REG-F6, REG-F7), server slice; validated by Fred 2026-10-25 (sprint-7.md § CONS-02a execution); committed 2aae7f9
  CONS-02b        client slice; committed 2026-10-25, browser NOT VALIDATED by agent (sprint-7.md § CONS-02b execution); next: Fred validates
  CAT-03a         catalogue variants, components, rules editable (REG-F2), server slice; committed 2026-10-25, migration 0016 (sprint-7.md § CAT-03a execution)
  CAT-03b         client slice (D8 tabs + « Avant publication »); validated live by Fred 2026-10-25, committed (sprint-7.md § CAT-03b execution)
S7.4 prereqs      production guard: refuse production start if any published consent definition title contains « DÉMONSTRATION » (D9, not implemented)
Next action       Fred: local validation of S7.3a (sprint-7.md § S7.3a execution, manual steps 1–6); S7.3b client after
Test script       item 9: npm test now runs every compiled test (530 server, was 5); PDF Chromium tests SKIP without browser

UI refonte        UX-1 → UX-15 done; Fred local checks of UX-9d, UX-10, UX-13 passed (2026-10-24)
UX-9d/9e          Aujourd'hui fidelity fixes + alerts dedupe pushed (1d3a476, 6ca2a2f)
UX-16             implemented inside S7.2b (bell + panel, mobile sheet, Configuration › Réglages)
UX-12a/12b        all 7 customer token pages on the public shell (4288d46, 57e5613)
UX-11             landing + request page pushed (bf87713)
UX-15             « Paiements » + « Documents » pushed (27042a1, f86cdcb)
UX-14             pushed (56f8454, b751757, 63279f3; OTP e-mail fix f989bec)
UX-13             legacy stylesheet + wrapper removed, recette done (14106e7)
UX next           Track B closed; UX-16 lands with S7.2. Remaining UI items wait on coach onboarding (name, logo, photo)
```

## S7.1 — closed 2026-10-23

Validated by Fred (PostgreSQL 542/542 after `bb3ba76`, browser/mobile/keyboard and DBeaver green). Full evidence: `exploration-cache/tasks/sprint-7.md` § S7.1 execution and closure.

## Blockers

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.
- Device-OTP login + trusted device per the Sprint 1 auth contract (today `/auth/login` issues a session on any device).

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Remote/chat runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            main
Sprint            7
Slice             S7.1
Workflow state    CLOSED
Validated         Sprint 6 closed; S7.1 accepted by Fred on 2026-10-23
Approved goal     Historical dashboard analytics and derived alerts; approved prospective cadence-history amendment
Done              Migration 0013, prospective two-row initialization, atomic cadence writers, analytics/alerts, French UX-9c, Reviewer and QA
Implementation    ed1c7d0
Pending           Separate S7.2 Gate 1; existing integration-order investigation and recorded runtime coverage limits
Validation        typecheck/build/schema/diff passed; server 523/523, shared 56/56; PostgreSQL 541/542, all 35 new cases passed
Acceptance        sprint-7.md S7.1 Gate 1 and cadence-history amendment; Fred's cumulative-funnel decision
Files/layers      shared/dashboard; server/dashboard/cadence/schema/seed/finance read model; client/TodayPage/charts/API/proxy
Human acceptance  Fred confirmed "All green" and authorized docs/commit/push
Rules             No invented legacy cadence, gap/null semantics, owner finance truth, cumulative cohort, admin GET-only endpoints
Risks             Existing payment-proof ordering assertion still fails; actual catalogue-seed concurrency not runtime-tested
Not validated     No agent browser/mobile/keyboard run; no separately observed human per-check counts
Assumptions       No new business rule; accepted limitations remain documented
Next action       Await a separately approved S7.2 plan; publication is authorized
UI state          UX-9c accepted; UX-10 validated by Fred 2026-10-24; Refonte UI closed (Track B)
Out of scope      S7.2 notifications/email, retention, backup/hardening, Sprint 8/V1.1 and deployment
```

### Refonte UI handoff (Track B)

```text
Branch            main
Step              Refonte UI closed 2026-10-24 (UX-1 → UX-15; UX-16 implemented inside S7.2)
Workflow state    CLOSED
Validation done   Each step applied and pushed by Fred; Fred local checks of UX-9d, UX-10 and UX-13 passed (2026-10-24);
                  UX-13 real-API recette at 1440 / 390 px; UX-14c questionnaire integration 47/47 on local PostgreSQL
Not validated     Profile tabs with real customer data in the agent recette (mocked data only); Fred's own pass covers them
Pending decisions Customer wording « ta coach » → coach onboarding (later)
Risks             See « Risks / pre-prod items » below
Next action       Fred: choose the next track (pre-prod blockers listed below)
```

## Refonte UI — suivi

> Goal: rebuild the admin and public screens to the validated mockups without changing business logic.
> Mockups: canvas « K'FIT — Refonte UI » (boards 01–11). Plan: Notion « 🎨 K'FIT - Refonte UI · Plan d'implémentation ». Backlog: Notion « K'FIT — Development Backlog » (UX-* and [API·UX] items).

### Process (agreed)

1. Check repo state on `main` before each step (repo = source of truth).
2. Read current code + board; list API gaps; any business rule → short numbered list for Fred (yes/no) before code.
3. API additions allowed only when read-only or presentation-level; business rules untouched. Every gap goes to the Notion backlog; anything needing another sprint is deferred there.
4. Deliver one `.diff` per step (`git diff --cached --binary`, checked with `git apply --check` on a fresh `origin/main` worktree) + commit message. **Fred applies and pushes; Claude never commits/pushes.**
5. Checks per step: client `tsc --noEmit`, client build, server tsc + unit tests, shared tests, browser check desktop + 390 px when the dev env is up.
6. After push: update this section, `changelog.md`, Notion backlog status.

UI conventions: French UI, explicit business rules, one primary action per view, charts only for a tracked indicator, no invented data in placeholders.

### Status

| Step | Board | Scope | API added (read-only) | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| UX-1 | 01 | Foundation: Tailwind v4, shadcn primitives, tokens, status map; legacy CSS isolated | — | Done | 88235de |
| UX-2 | 01 | Admin shell, React Router routes, sidebar, mobile nav | — | Done | 141175f |
| UX-3 | 01b | Data kit: DataTable, read-only tables, charts (KPI tile, sparkline, bars, stacked) | — | Done | c2d4497 |
| UX-4a | 03 | Client profile shell | `GET /admin/customers/:id` | Done | 477650a |
| UX-4b | 03, 08 | Profile Aperçu + Progression | — | Done | f92e7cb |
| UX-4c | 03b | Profile Analyse tab | `GET /admin/customers/:id/analytics` | Done | 972dc22 |
| UX-5 | 04 | Clients list + creation | `GET /admin/customers/overview` | Done | b8a1135 |
| UX-6 | 05 | Requests queue + detail | — | Done | f21120f |
| UX-7 | 06 | Catalogue + capacity | `GET /admin/catalogue/services/overview` | Done | 86362d5 |
| UX-8 | 07 | Questionnaires (families, versions, editor) | — | Done | 309294d |
| UX-9 | 02 | Aujourd'hui dashboard; `/admin` opens it; business time zone | `GET /admin/today`, `GET /admin/appointments` | Done | a122ccd |
| UX-9b | 02 | Layout aligned to mockup; requests chart placeholder | — | Done | 8a4e435 |
| UX-9c | 02 | Weekly requests chart + conversion, KPI sparklines/deltas, finance summary, operational alerts (built in S7.1) | `GET /admin/dashboard/*` (S7.1) | Done — first-name greeting still open | ed1c7d0 |
| UX-9d | 02 | Fidelity fixes: board 02 order (À traiter under the charts), 8-week default, segmented period switch, header wording, compact funnel, « Stable » deltas, XAF, business-date label, task list capped at 8 | — | Done — Fred validated 2026-10-24 | 1d3a476 |
| UX-9e | 02 | Alerts on Aujourd'hui limited to payments and quotes (no duplicate of À traiter) | — | Done | 6ca2a2f |
| UX-10 | 09 | Connexion, Mot de passe oublié, Initialisation, password meter; recovery service bound in `dev-app.ts` (SMTP) | none (existing `/auth/recovery/*`) | Done — Fred validated 2026-10-24 | e0ae7f1 |
| UX-11 | 10, 11a | Landing `/` (offers from the public catalogue, family filter, plans, steps, FAQ, CTA) + request page `/demande/:offre`; intake rules unchanged; legacy wrapper removed | — | Done — prod still needs coach onboarding (name/logo/photo) and legal pages | bf87713 |
| UX-12a | 11e–h | Shared public shell (`components/public/PublicShell.tsx`, one no-referrer hook) + /document, /devis, /recu, /justificatif restyled; logic unchanged | — | Done | 4288d46 |
| UX-12b | 11b–d | /questionnaire (one question per screen, health consent step), /consent, /appointment on the public shell; customer-only forms, coach forms untouched (UX-14); appointment times in Libreville; legacy wrapper removed | — | Done | 57e5613 |
| UX-14 | 14a–14e | Legacy admin tabs: Rendez-vous, Suivis, Préparation, Santé et consentements + Suivis page. 14a (diff 1): Rendez-vous tab (Libreville times, schedule sheet with duration suggestion + auto response link, action dialogs), Suivis tab (open actions, history, « rythme » card, record sheet), Suivis page (table, filters, opens the form via `nouveau=suivi`) 14b: Préparation (banner + progress, checklist, waiver dialog, reservation) and Santé et consentements (consents, links, coach capture, questionnaire links + coach entry); last legacy admin panels removed. 14c: `GET …/questionnaire/revisions/:submissionId` (fresh sensitive-action OTP, `questionnaire.answers_viewed` audit with ids only, refused once « Données de santé » is withdrawn) + « Voir les réponses » with e-mail code step-up | — | Done | 56f8454, b751757, 63279f3, f989bec |
| UX-15 | 15a–15d | Screens added in S5.5/S6 without a board. 15a: Finance + Devis tabs merged into « Paiements » (summary, proof banner, échéancier « n sur N », payments with receipt column + ⋯, quote card + side sheet, proofs history) + proof review dialog (preview, size, scan, 5 decisions). 15b: Documents tab (versioned list, Partager → link + separate code for sensitive docs, ⋯ add version / download / versions and links / archive / revoke with confirmation, private photos card) | — | Done | 27042a1, f86cdcb |
| UX-16 | 12, 12b, 12c | S7.2 notification centre (bell panel, mobile sheet, Réglages) — board only, implemented inside S7.2 | — | Boards validated 2026-10-23 → S7.2 implementer (`sprint-7.md` § S7.2 UI) | — |
| UX-13 | — | Cleanup: `legacy.css` (20 KB) and the `legacy` wrapper removed, dead `AdminProgressPanel` removed, h1 added to the request page; recette on the real API at 1440 / 390 px (reduced motion already global in `index.css`) | — | Done | 14106e7 |

### Locked decisions (2026-10-22)

- Business time zone **Africa/Libreville (UTC+1)** for today, week (Monday start), appointment display and datetime inputs — `@kfit/shared` `time/business-time.ts`, client `lib/format.ts`.
- Client status derived in one place: `@kfit/shared` `customers/client-status.ts`.
- Capacity limit below occupied places → warn, don't block. Occupancy = S4 capacity-claim rule.
- Analytics rules (attendance, cadence, pace, responsiveness) validated in UX-4c.
- Aujourd'hui « À traiter » order: follow-ups overdue → due → new requests → request follow-ups → preparation expired → ready → waiting → completion due. KPIs show current values only until Sprint 7.
- Slug frozen after publication (UI). CSV export out of V1 (V1.1, compliance).

### Open decisions (Fred)

- [x] UX-10 scope: client-only, device OTP deferred (Fred 2026-10-22, 8 rules validated).
- [x] Currency display: FCFA on customer pages, XAF in admin (Fred 2026-10-23).
- [x] UX-11 rules (Fred 2026-10-23): WhatsApp free entry (no auto +241); start « Dès que possible » / date; links from env, legal links hidden; text-only brand + « ta coach »; 4 FAQ answers approved.
- [x] UX-15 rules (Fred 2026-10-23): Finance + Devis merged into « Paiements »; proof review with inline preview, size and scan result; instalments « n sur N », payments linked to « échéance N ». Old `onglet=finance|devis` links open « Paiements » (client alias, server deep links unchanged).
- [x] UX-14 rules (Fred 2026-10-23): add « Voir les réponses » (needs a read-only API, UX-14c); the coach types start and end, with a duration suggestion (1 h by default); the appointment response link is created at scheduling and expires at the start; « Enregistrer le suivi » opens the form directly; wording « rythme » / « Revenir au rythme du service ».
- [x] UX-14c rules (Fred 2026-10-23): viewing questionnaire answers is written to the audit log, requires a fresh OTP, and is refused once the client has withdrawn « Données de santé ».
- [x] UX-15a: the proof confirm form stays pre-filled with the client's declaration; the full amount stays locked to it (Fred 2026-10-24).
- [ ] Multi-subscription progress: exclude measurements taken without health consent?
- [ ] Client test framework (Vitest + Testing Library)?
- [x] Funnel counting rules: cumulative reach (Fred, S7.1).
- [x] Aujourd'hui shows only the alerts « À traiter » does not list (unpaid installments, payment proofs, quotes), as « Paiements et devis à suivre »; the S7.2 notification centre keeps the full set (Fred 2026-10-23, UX-9e).
- [ ] Customer wording: public pages say « ta coach » — waits for the coach onboarding (real name, logo, photo), to be implemented later (Fred 2026-10-24).

### Risks / pre-prod items

- **Auth contract gap (compliance):** Sprint 1 contract requires OTP on unknown devices before a session is issued; `/auth/login` always issues one. Pre-prod blocker until the device-OTP server slice ships.
- **Recovery and sensitive-action OTP need SMTP:** `/auth/recovery/*` and `POST /auth/otp/sensitive-action` answer 501 unless `SMTP_HOST`/`SMTP_FROM` are set; staging/prod env must define them (UI then shows « Récupération indisponible » / « Envoi du code indisponible »). A failed send answers 503 (`AUTH_OTP_DELIVERY_FAILED`) and supersedes any earlier sensitive-action code. Sensitive-action OTP now sent through the same SMTP delivery (f989bec).
- **Prod reverse proxy:** if it lists API paths, add `/admin/today` and `/admin/appointments` (Vite dev proxy done).
- **Brand assets:** coach name, logo and photo will come from a coach onboarding (Fred 2026-10-23, Notion backlog). Until then the public pages say « ta coach » and use the text mark; UX-11 is not production-ready without it.
- **Public commitments to confirm with the coach:** « Réponse sous 24 h » (board 10 hero) and the FAQ health answer (check against the privacy notice during legal validation).
- **Public contact links:** `VITE_PUBLIC_WHATSAPP` / `VITE_PUBLIC_INSTAGRAM` must be set at build time for staging/prod, else the WhatsApp/Instagram buttons are hidden.
- Server `npm test` glob runs only 4 tests → run `node --test $(find dist -name "*.test.js")` (Fred to fix the script).

### Sprint 7 needs for mockup fidelity (board 02 — Aujourd'hui) — delivered by S7.1 except the first name

> Notion: UX-9c, [API·UX] Séries temporelles, Endpoint agrégé des KPI, Statistiques de l'entonnoir, Prénom dans la session.

- [x] **Weekly requests chart** — requests received per business week (Mon–Sun, Africa/Libreville); periods 4 sem. / 8 sem. / 12 mois (monthly buckets for 12 mois); current week highlighted; tooltip `N demandes · 6–12 oct.`. Replaces the « Historique disponible au Sprint 7 » card.
- [x] **Conversion rate** in that chart's header (`47 sur 8 semaines · taux de conversion 38 %`) — depends on funnel counting rules.
- [x] **KPI sparklines** — 8 weekly points for: clientes actives (end-of-week value), suivis en retard (end-of-week value), nouvelles demandes, séances réalisées. `KpiTile` already takes `trend` + `trendLabel`.
- [x] **KPI delta vs previous period** (`+12 % vs période précédente`) — define the reference period and the favourable direction per KPI (fewer overdue follow-ups = good). `KpiTile` already takes `delta`.
- [ ] **Greeting with first name** (`Bonjour Konny`) — `/auth/session` returns id + role only; needs a display name on the user (small migration).
- [x] Section order matches the mockup (UX-9b).

### Other deferred items from the redesign (Notion backlog)

- Analyse tab still splits days/weeks in UTC → Libreville (V1.1).
- Manual request endpoint (`POST /admin/requests`), readable sequential references (SUB-0042), questionnaire draft update/retire, service family field, duplicate-request signal, admin subscriptions list, server-side pagination.
- Device-OTP login + trusted device (server slice + board 09 OTP screen).

## S7.1 Gate 1 — approved 2026-10-23

Fred approved all 18 S7.1 dashboard/alert decisions.

Locked rules:
1. Keep `GET /admin/today` as the validated current operational snapshot; do not rewrite existing current-day rules.
2. Add a separate read-only analytics endpoint: `GET /admin/dashboard/analytics?periode=4w|8w|12m`.
3. All periods use Africa/Libreville business time; weeks are Monday–Sunday; 12m uses calendar-month buckets.
4. KPI sparklines use 8 weekly points:
   - active clients = end-of-week stock;
   - overdue follow-ups = end-of-week stock;
   - new requests = weekly flow;
   - completed sessions = weekly flow.
5. KPI delta compares current business week vs immediately previous business week. Favourable direction is metric-specific; previous zero uses absolute change, never fake infinite percentage.
6. Requests chart supports exactly 4w / 8w / 12m, with weekly buckets for 4w/8w and monthly buckets for 12m.
7. Requests funnel is cohort-based on requests submitted inside the selected period:
   received -> contacted -> qualified -> converted.
8. Conversion attribution remains with the original submitted-period cohort even when conversion occurs later; analytics is evaluated as-of-now.
9. Finance exposes separate authoritative values:
   collectedXaf, dueXaf, futureXaf, overdueXaf, outstandingXaf.
   For current authoritative schedules, outstanding = overdue + due + future.
10. Finance analytics use S6.1 ledger only. Quotes/proofs/receipts may contribute operational alerts but never financial truth.
11. S7.1 alerts are derived dashboard read models, not persisted notifications. S7.2 owns notification records/email reminders.
12. Each alert deep-links to the authoritative owner workspace/action.
13. Dashboard must reuse owner-module policies/derived rules and must not duplicate business-state logic.
14. Historical KPI computation is read-only; no snapshot table/migration unless implementation proves reconstruction impossible or unsafe.
15. UX-9c is completed in S7.1 except coach first name. Keep `Bonjour`; displayName/session migration remains V1.1.
16. No notification/email engine in S7.1.
17. No mutation endpoints in S7.1. Proposed read surface:
   - GET /admin/today
   - GET /admin/appointments
   - GET /admin/dashboard/analytics?periode=4w|8w|12m
   - GET /admin/dashboard/alerts
18. Validation must prove time boundaries, historical stock/flow correctness, request cohort conversion, finance correction/due semantics, read-only behavior and privacy.

Implementation is authorized for S7.1 only. S7.2 remains closed until Fred locally validates S7.1.


## S7.1 feasibility blocker — historical cadence

Independent Reviewer confirmed S7.1 cannot safely reconstruct historical overdue-follow-up stock from current data.

Root cause:
- cadence resolution may fall back to mutable service/variant `followUpFrequencyDays`;
- catalogue policy updates/seeding can overwrite those fallback values;
- subscription override audit/history cannot reconstruct a fallback value that was overwritten;
- therefore an old weekly endpoint may be impossible to classify deterministically as healthy/due/overdue.

Example:
- 10 active days since meaningful activity;
- historical cadence 7 days => overdue;
- current cadence 14 days => healthy.

Using today's policy for historical weeks is prohibited because it would fabricate history.

Current state:
- S7.1 BLOCKED at historical-feasibility gate;
- no implementation files changed;
- no migration/tests run for S7.1;
- S7.2 remains closed.

Planner recommendation:
- capture effective cadence history prospectively;
- legacy historical KPI buckets return unavailable when cadence provenance cannot be proven;
- never backfill unknown historical cadence from today's configuration.


## S7.1 Gate 1 amendment — cadence history approved 2026-10-23

Fred approved the cadence-history amendment after the historical-feasibility blocker.

Locked amendment:
- add prospective append-only history of the resolved effective follow-up cadence;
- store the resolved value itself, not only a pointer to mutable catalogue policy;
- capture source: override | variant | service | none;
- no invented legacy backfill from today's service/variant values;
- initialize current effective cadence from migration time onward;
- historical overdue-follow-up buckets are `complete` only when cadence provenance is provable for all contributing subscriptions;
- otherwise the bucket value is null with `availability = unavailable`;
- unavailable is never represented as zero;
- KPI delta is unavailable when either compared point is unavailable;
- current `GET /admin/today` overdue-follow-up KPI remains unchanged;
- one additive migration is explicitly authorized for cadence history;
- all other S7.1 Gate 1 decisions remain unchanged.

S7.1 is unblocked and APPROVED_FOR_IMPLEMENTATION.
S7.2 remains closed until Fred locally validates S7.1.


## S7.1 closure — 2026-10-23

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:
- `ed1c7d0` — `feat(dashboard): add historical analytics and operational alerts`.
- `bb3ba76` — `fix(finance): stabilize payment allocation read order`.

Validation:
- typecheck green;
- build green;
- db:check green;
- server 523/523;
- shared 56/56;
- PostgreSQL 542/542 after deterministic allocation-read ordering fix;
- all 35 new S7.1 PostgreSQL cases green;
- Fred confirmed browser/mobile/keyboard and DBeaver Gate 2 all green.

Validated S7.1 scope:
- historical KPI series and deltas;
- 4w/8w/12m request chart;
- cohort funnel;
- authoritative five-part finance summary;
- operational alerts/deep links;
- prospective cadence history with truthful legacy-unavailable points;
- current /admin/today semantics unchanged.

Known coverage note:
- actual catalogue-seed concurrency with simultaneous override/activation remains not directly runtime-tested; helper atomicity and DB overlap constraints are covered.

S7.1 is closed. S7.2 is now the active planning slice; no S7.2 implementation before Gate 1.


## S7.2 Gate 1 — approved 2026-10-23

Fred approved all 32 S7.2 notification/reminder decisions.

Locked rules:
1. Business condition remains owned by source modules/S7.1 derivation; notification never invents business state.
2. Durable in-app notification is primary; email is optional secondary delivery.
3. Persist notifications with recipient/kind/severity/resource/deep-link/dedupe/read/resolved timestamps.
4. One logical open notification per active condition through stable dedupe_key.
5. Read/unread is separate from resolved/unresolved; read never resolves business work.
6. Source-condition disappearance resolves notification while preserving history.
7. No arbitrary dismiss-forever in V1 Core.
8. Initial closed kinds mirror proven S7.1 alerts: follow_up_overdue, request_to_contact, installment_overdue, payment_proof_pending, preparation_blocked, completion_due. quote_action_required only if authoritative condition is precise.
9. S7.2 recipients are internal active admin/coach users only; no customer-facing reminder system is introduced.
10. Email uses a durable outbox with frozen recipient/content.
11. Outbox states: pending, sending, sent, failed, dead_letter.
12. SMTP retries are bounded and configured, not scattered literals.
13. Reminder/digest behavior uses Typed Settings with closed keys/validation/audit.
14. V1 Core uses global operational notification settings rather than per-user preference complexity.
15. Reminder discovery runs as Scheduled Business Jobs with advisory locking + scheduled_job_runs idempotency.
16. Jobs: notifications.reconcile and notifications.email-delivery.
17. Proposed cadence: reconcile every 15 minutes; delivery worker every 5 minutes.
18. Reminder email cadence is separate from source-state mutation; repeated emails reuse one in-app notification.
19. Email is enabled for proven alert categories subject to settings.
20. Prefer one daily digest for normal operational alerts instead of one email per alert.
21. Default digest time: 08:00 Africa/Libreville, configurable.
22. Internal email recipients come from users.email only.
23. Email content is privacy-minimal; exclude health/private-doc/payment-reference/notes/bearers.
24. Deep links reuse authoritative owner workspaces.
25. Admin UI adds notification center/bell + settings; no notification-specific business actions.
26. Resolved notifications remain in paginated history; unresolved/recent first.
27. Outbox has simple admin troubleshooting/history; manual retry allowed only where scope remains small.
28. Generic audit is structural only; job/outbox results stay primarily in their durable records.
29. Additive schema is expected for notifications/outbox/settings if no generic settings store exists.
30. Email failure never removes notification; notification persistence failure prevents silent email-only delivery.
31. Reading/emailing never executes business commands.
32. Validation must cover dedupe/resolution/read semantics, SMTP failure/retry/exact-once behavior, scheduler locking, Africa/Libreville digest time, settings validation, recipient/privacy rules, no source mutation, stable error codes and Mailpit acceptance.

Implementation is authorized for S7.2 only. S7.3 remains closed until Fred locally validates S7.2.
