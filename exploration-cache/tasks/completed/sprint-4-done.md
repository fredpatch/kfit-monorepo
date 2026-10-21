# Sprint 4 — Completed

Validated locally by Fred on 2026-10-21.

## Objective

Deliver the customer/conversion/onboarding foundation with consent and health-questionnaire workflows while preserving server-authoritative transitions, append-only evidence and transactional audit guarantees.

## Completed slices

1. S4.1 — Customer identity/search/manual-create foundation.
2. S4.2 — Atomic qualified-request conversion to customer + onboarding subscription.
3. S4.3 — Onboarding checklist, readiness, capacity reservation and stalled-state safeguards.
4. S4.4 — Versioned consent records, secure terms/privacy acceptance links and coach-assisted capture.
5. S4.5 — Versioned assessment/health questionnaires, health-data consent gate, risk flags and medical-clearance blocker integration.

## Validation highlights

- All five slices passed Reviewer/QA and Fred Gate 2.
- S4.5 included a blocking corrective fix discovered during human validation: published questionnaire templates originally lacked a usable service/variant assignment path.
- The correction added audited service/variant questionnaire assignment, published-template validation, variant override + service fallback and the required Vite proxy route.
- Fred reran the final validation suite after the correction and reported all checks green.
- Browser and DBeaver acceptance covered assignment, public/coach-assisted submission, health-consent refusal, risk-triggered medical clearance, immutable revision history, replay protection, hashed secure tokens and safe audit metadata.

## Known non-blocking notes

- An unchanged Sprint 3 concurrency integration test remains intermittently flaky and must still be treated cautiously.
- S4.4 local runtime initially failed because migration 0004 had not yet been applied locally; applying the migration resolved it.
- S4.5 local runtime initially used a stale API process after new route wiring; restarting the API resolved it.
- Production legal review for Gabon and a real encrypted off-server backup destination remain production blockers.

## Exact next task

Sprint 5 / S5.1 — **Subscription lifecycle with pause, completion_due, renewal and cancellation resolution**.

This task comes first because it depends only on the validated onboarding ready-to-start gate. Appointments and follow-ups require an active subscription; goals depend on the follow-up/subscription model.
