# K'FIT — Recette fonctionnelle V1 Core

> Living end-to-end acceptance plan.
>
> Purpose: give Fred one reproducible final review of the complete V1 Core business workflow before UAT/sign-off.
>
> Maintenance rule: extend this file whenever a slice is locally validated. Do not mark a scenario validated only from static/agent inspection.

## 1. Test conventions

Statuses:
- [ ] Not run in current full recette
- [x] Previously validated during slice Gate 2
- [!] Failed / regression to investigate

Evidence to retain when useful:
- browser screenshot or note;
- API/business error shown;
- DBeaver row/state evidence;
- audit evidence;
- exact command output for automated suite.

General invariants:
- server is authoritative;
- no generic arbitrary lifecycle-status mutation;
- important business history remains append-only;
- free-text/sensitive health/PII data is excluded from generic audit metadata;
- public bearer tokens are stored hashed and scoped/expiring;
- finance remains independent from subscription activation/lifecycle;
- V1 has no customer account.

## 2. Environment / preflight

- [ ] Pull the target branch/release.
- [ ] Apply all pending migrations.
- [ ] Start dev/staging-style stack according to project instructions.
- [ ] Verify API/client health.
- [ ] Verify admin login/session restore/logout.
- [ ] Verify CSRF-protected admin mutations.
- [ ] Verify database connection in DBeaver.
- [ ] Record exact commit under test.

## 3. Authentication and session foundation — Sprint 1

### AUTH-01 Login/session
- [x] Valid admin login succeeds.
- [x] Session restores after client reload.
- [x] HttpOnly/session cookies preserve required attributes through staging-style proxy.

### AUTH-02 CSRF/logout/refresh
- [x] Missing/invalid CSRF is rejected for protected mutations.
- [x] Valid double-submit CSRF is accepted.
- [x] Logout invalidates the session.
- [x] Refresh/session handling respects inactivity/absolute-expiry rules.

### AUTH-03 Password recovery / OTP safeguards
- [x] Password-recovery flow is functional.
- [x] OTP/fresh-OTP safeguards behave as designed.
- [x] Security/audit events contain safe structural evidence only.

## 4. Catalogue and public offer — Sprint 2

### CAT-01 Public catalogue
- [x] Only published/public services are shown publicly.
- [x] Service variants belong to their service.
- [x] Availability status is respected.

### CAT-02 Admin catalogue
- [x] Admin can manage draft/published service catalogue data.
- [x] Components/quantities/policies are visible and persisted.
- [x] Existing subscription snapshots are not retroactively rewritten by later catalogue edits.

## 5. Public request → qualification → waitlist — Sprint 3

### REQ-01 Public request intake
- [x] Visitor can submit a request without an account.
- [x] Archived/non-public service is rejected.
- [x] Variant must belong to selected service.
- [x] Rate limit/honeypot/minimum-time protections are enforced.
- [x] Duplicate replay does not create duplicate business state.

### REQ-02 Admin request/contact flow
- [x] Admin sees request queue/detail.
- [x] Contact attempts/history are recorded.
- [x] Named state transitions reject invalid current states.

### REQ-03 Qualification
- [x] Coach can qualify / qualify-with-conditions / reject / abandon according to state rules.
- [x] Final service/variant/agreed price decision is persisted.
- [x] Free-text qualification content is not copied into generic audit metadata.

### REQ-04 Waitlist
- [x] Eligible request can be manually waitlisted.
- [x] FIFO ordering is preserved.
- [x] Duplicate active waitlist entry is prevented.
- [x] Withdrawal updates request/waitlist history atomically.
- [x] No automatic promotion occurs in V1.

## 6. Customer and atomic conversion — Sprint 4.1–4.2

### CUST-01 Customer identity
- [x] Search uses normalized WhatsApp.
- [x] Duplicate active/non-anonymized customer creation is rejected.
- [x] Manual customer creation does not phone-only auto-link a prospect.
- [x] Archived/anonymized customers are excluded from normal active lookup.

### CONV-01 Qualified request conversion
- [x] Qualified request converts exactly once.
- [x] Customer is safely resolved/created.
- [x] Subscription is created in onboarding.
- [x] Agreed price/currency/duration/component entitlements are snapshotted.
- [x] Initial subscription history and reciprocal request/subscription links are written atomically.
- [x] Concurrent/repeated conversion cannot create a second subscription.

## 7. Onboarding / capacity / consent — Sprint 4.3–4.4

### ONB-01 Checklist/readiness
- [x] Required onboarding items derive from effective service/variant policy.
- [x] System-owned items cannot be manually forged complete.
- [x] Blocking items prevent ready_to_start.
- [x] Ready state is server-authoritative.

### ONB-02 Capacity
- [x] Capacity reservation works for limited-capacity offers.
- [x] Concurrent last-slot claims are protected.
- [x] Reservation expiry/stalled state does not silently mutate subscription lifecycle.

### CONS-01 Versioned consent
- [x] service_terms, privacy_notice, health_data, progress_photo_storage, marketing and publication are separate consent types.
- [x] Published consent definitions are immutable/versioned.
- [x] Decisions are append-only.
- [x] Public consent link stores only token hash.
- [x] Successful submission consumes the link; replay is rejected.
- [x] Coach-assisted capture preserves provenance.
- [x] Required service terms/privacy integrate with onboarding readiness.

## 8. Questionnaires / health / medical blocker — Sprint 4.5

### QST-01 Template/versioning
- [x] Draft/published/retired lifecycle works.
- [x] Published revisions are immutable.
- [x] Supported V1 question types validate correctly.
- [x] Service assignment + variant override/service fallback resolve consistently.

### QST-02 Assessment vs health
- [x] Normal assessment does not require health_data consent.
- [x] Health questionnaire requires current health_data grant before answers persist.
- [x] Refusal stores consent evidence and zero health-answer submission.

### QST-03 Corrections/risk
- [x] Corrected submission creates a new revision rather than overwriting history.
- [x] Risk rules are declarative/non-diagnostic.
- [x] Risk can create medical-clearance blocker.
- [x] Later safe response does not automatically clear an existing medical requirement.

## 9. Subscription lifecycle — Sprint 5.1

### SUB-01 Activation
- [x] ready_to_start -> active through explicit command.
- [x] Activation rechecks authoritative blockers.
- [x] actualStartDate/plannedEndDate derive from immutable duration snapshot.

### SUB-02 Pause/resume
- [x] active -> paused requires reason.
- [x] Only one open pause.
- [x] Resume requires explicit revised end date for duration subscriptions.
- [x] System does not auto-add pause duration.

### SUB-03 Completion review
- [x] active -> completion_due is explicit.
- [x] Planned end does not auto-complete subscription.
- [x] Outstanding coach-owed component blocks normal completion.
- [x] Explicit override/reason can complete while preserving component balances.

### SUB-04 Cancellation
- [x] Cancellation requires reason and preserves history.
- [x] Cancellation does not silently mutate finance/refunds.

### SUB-05 Renewal
- [x] Renewal creates one linked new onboarding subscription.
- [x] Source subscription remains unchanged.
- [x] Commercial/component snapshots are cloned.
- [x] consumed/owed counters reset to zero.
- [x] onboarding/consents/questionnaires/appointments/follow-ups/goals/payments are not cloned.

## 10. Appointments and component delivery — Sprint 5.2

### APT-01 Scheduling
- [x] New appointment requires active subscription.
- [x] Linked component must belong to same subscription and have entitlement remaining.
- [x] Policy snapshot is frozen at appointment creation.

### APT-02 Customer response link
- [x] Public link works without account.
- [x] GET is non-consuming.
- [x] Confirm/decline/request-reschedule are supported.
- [x] Successful response consumes token.
- [x] Replay cannot apply a second business effect.

### APT-03 Cancellation consumption
- [x] Coach cancellation never consumes entitlement.
- [x] On-time customer cancellation never consumes entitlement.
- [x] Late customer cancellation consumes only when snapshot policy says so.
- [x] null notice-hours means no late penalty.
- [x] Exactly at deadline is on time.

### APT-04 Completion/missed/restoration
- [x] Completed linked appointment consumes exactly one entitlement.
- [x] Missed consumes according to snapshot policy.
- [x] Duplicate command cannot double-consume.
- [x] Explicit restoration appends history and restores one unit without rewriting original event.

### APT-05 Reschedule history
- [x] Original schedule is never overwritten.
- [x] Source becomes rescheduled and one linked replacement appointment is created.
- [x] Replacement copies component/policy snapshot.
- [x] Old response tokens are revoked.

## 11. Structured follow-ups and cadence — Sprint 5.3

### FUP-01 Cadence resolution
- [x] Subscription override wins.
- [x] Clearing override restores variant/service fallback.
- [x] null cadence disables monitoring.

### FUP-02 Meaningful activity
- [x] Activation establishes baseline.
- [x] Completed appointment resets cadence.
- [x] Structured follow-up recording/completion resets cadence.
- [x] Confirmation/cancel/missed/reschedule traffic does not reset cadence.

### FUP-03 Pause-aware time
- [x] Paused subscriptions are excluded from global cadence queue.
- [x] Pause time freezes cadence clock.
- [x] Resume preserves remaining active-time interval.
- [x] Multiple pause intervals calculate correctly.

### FUP-04 Follow-up task lifecycle
- [x] Follow-up can be recorded with/without next action.
- [x] Open action can be completed or cancelled.
- [x] Individual overdue is derived at read time.
- [x] Exactly at nextActionAt is due; strictly later is overdue.
- [x] Generic audit excludes note/nextAction/reason.

### FUP-05 Global queue
- [x] /admin/follow-up-queue shows eligible active subscriptions.
- [x] healthy/due/overdue is derived, never persisted.
- [ ] Future scalability review: batch/history loading when data volume becomes large.

## 12. Progress measurements and goals — Sprint 5.4

### PRG-01 Measurement history
- [x] Active/paused subscription can record measurement with current health_data grant.
- [x] Measurements are append-only.
- [x] Backdated valid measurement is ordered chronologically.
- [x] Exact duplicate payload is rejected.
- [x] Latest/previous values and simple deltas are correct.
- [x] No medical diagnosis/BMI/risk interpretation is produced.

### PRG-02 Consent revocation
- [x] Refused/revoked/absent health_data blocks new measurement.
- [x] Existing historical measurements remain visible/preserved.

### GOAL-01 Goal creation
- [x] Qualitative goal can be created without automatic suggestion.
- [x] Numeric increase/decrease goals validate metric/baseline/target/unit.
- [x] Invalid/partial numeric combinations are rejected.

### GOAL-02 Advisory suggestion
- [x] Latest matching measurement drives suggestion.
- [x] Reached target suggests achieved.
- [x] Before target date, unmet target remains no suggestion.
- [x] After target date, intended-direction improvement suggests partially_achieved.
- [x] No/opposite improvement suggests not_achieved.
- [x] Suggestion never changes authoritative goal status.

### GOAL-03 Coach decision
- [x] Coach can confirm matching suggestion.
- [x] Different outcome requires reason.
- [x] Null-suggestion manual outcome requires reason.
- [x] coach_confirmed_at is set only by explicit confirmation.
- [x] Confirmed outcome is terminal.

### GOAL-04 Pause/resume/cancel
- [x] Goal pause/resume is explicit.
- [x] Cancellation requires reason.
- [x] Subscription pause does not auto-pause goals.
- [x] Subscription completion does not auto-finalize goals.
- [x] goal_events remain append-only.

### GOAL-05 Privacy
- [x] Body measurements/feeling notes/reasons are absent from generic audit metadata.
- [x] UI visually separates authoritative status from system suggestion.
- [ ] Stronger API metric↔unit compatibility enforcement is deferred hardening.

## 13. Personalized documents — Sprint 5.5

Status: NOT IMPLEMENTED YET.

Scenarios will be added after S5.5 planning/validation.

Required future coverage at minimum:
- [ ] immutable/versioned personalized document records;
- [ ] private storage;
- [ ] secure temporary delivery token;
- [ ] expiry/revocation/replay behavior;
- [ ] public link exposes only intended document;
- [ ] audit/access evidence;
- [ ] progress-photo private-storage boundary if implemented here.

## 14. Future V1 Core areas

These sections must be appended as they are validated:

- [ ] Sprint 6 — payment plans, payment proof/reconciliation, financial documents.
- [ ] Sprint 7 — dashboard, notifications/jobs, retention/anonymization operational controls.
- [ ] Sprint 8 — formal V1 Core UAT/regression.
- [ ] Sprint 9 — staging/production deployment and operating/training acceptance.

## 15. Cross-cutting final regression

Run after all V1 Core implementation is complete.

### REG-01 Full happy path
- [ ] Public visitor browses catalogue.
- [ ] Submits request.
- [ ] Coach contacts/qualifies.
- [ ] Converts request to customer + onboarding subscription.
- [ ] Completes required consent/questionnaire/medical conditions.
- [ ] Activates subscription.
- [ ] Schedules and completes appointment(s).
- [ ] Component counters reconcile.
- [ ] Records structured follow-up.
- [ ] Cadence queue reacts correctly.
- [ ] Records progress measurement.
- [ ] Goal suggestion appears but remains advisory.
- [ ] Coach confirms goal outcome.
- [ ] Personalized document flow works.
- [ ] Financial flow works.
- [ ] Subscription moves to completion_due then completed or renewed.

### REG-02 History / immutability
- [ ] Catalogue edits do not rewrite old subscription commercial facts.
- [ ] Consent/questionnaire revisions preserve prior versions.
- [ ] Appointment reschedule preserves original appointment.
- [ ] Component restoration preserves original consumption event.
- [ ] Measurements remain append-only.
- [ ] Goal transition history remains append-only.
- [ ] Financial corrections preserve ledger/document history.

### REG-03 Security/privacy
- [ ] Admin-only routes require auth + CSRF.
- [ ] Public routes expose minimum data only.
- [ ] Public tokens are hash-only, scoped, expiring/revocable.
- [ ] Replays do not duplicate business effects.
- [ ] Health/measurement/free-text/PII do not leak into generic audit.
- [ ] Consent boundaries are enforced for health data and photos.
- [ ] No public progress-photo exposure without separate authorization.

### REG-04 Concurrency/idempotency
- [ ] Duplicate request submission does not duplicate business records.
- [ ] Conversion exactly once.
- [ ] Capacity last-slot protected.
- [ ] Appointment consumption exactly once.
- [ ] Restoration exactly once.
- [ ] Follow-up terminal command exactly once.
- [ ] Goal terminal confirmation exactly once.
- [ ] Finance commands exactly once when Sprint 6 is added.

## 16. Final automated suite

Record exact counts from the final release candidate:

```text
npm run typecheck          [ ]
npm test                   [ ]
npm run build              [ ]
npm run db:check           [ ]
npm run test:integration   [ ]
```

Do not accept a zero-test pass.

Known historical note:
- an unchanged Sprint 3 concurrency test has flaked on isolated first runs and passed approved retry; if it recurs during final recette, record exact output and determine whether it remains the same known flake before accepting any retry.

## 17. Final sign-off record

Release/commit:
Date:
Tester:
Environment:

Functional recette:
- [ ] PASS
- [ ] FAIL

Database/history inspection:
- [ ] PASS
- [ ] FAIL

Security/privacy spot checks:
- [ ] PASS
- [ ] FAIL

Responsive/keyboard browser review:
- [ ] PASS
- [ ] FAIL

Open accepted limitations:
- queue history loading may need batching at larger volume;
- stronger metric↔unit API compatibility enforcement is currently deferred;
- production still requires applicable Gabon legal/privacy review;
- production still requires a true encrypted off-server backup destination.

Final notes:
