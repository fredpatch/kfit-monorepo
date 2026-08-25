# K'FIT V1 Core — State Machines

> Closed state vocabularies and allowed transition intent. Actual authorization/guard logic lives in domain services.

## 1. Service availability

States:
- `open`
- `temporarily_closed`
- `waitlist_only`
- `archived`

Rules:
- `archived` cannot accept new requests.
- `waitlist_only` accepts waitlist intake but no direct capacity conversion.
- reopening an archived service requires explicit restore action and audit.

## 2. Service request

States:
- `submitted`
- `contacting`
- `qualification_in_progress`
- `qualified`
- `qualified_with_conditions`
- `waitlisted`
- `rejected`
- `abandoned`
- `converted`
- `closed_duplicate`

Allowed intent:
- `submitted -> contacting | qualification_in_progress | waitlisted | closed_duplicate`
- `contacting -> qualification_in_progress | abandoned | waitlisted`
- `qualification_in_progress -> qualified | qualified_with_conditions | rejected | abandoned | waitlisted`
- `qualified -> qualification_in_progress | converted`
- `qualified_with_conditions -> qualification_in_progress | converted`
- `waitlisted -> qualification_in_progress | abandoned`
- `abandoned -> qualification_in_progress` only on explicit reopen
- `rejected -> qualification_in_progress` only on explicit reopen/review
- `converted` is terminal for the request conversion path

Guards:
- conversion requires final service/variant decision, agreed price, target start, capacity/onboarding decision and no prior conversion.
- converted request cannot be reverted; correction uses subscription cancellation + corrected linked subscription if needed.

## 3. Waitlist entry

States:
- `active`
- `contacted`
- `promoted`
- `withdrawn`
- `expired`

No automatic promotion in V1.

## 4. Subscription lifecycle

States:
- `onboarding`
- `awaiting_payment`
- `medical_clearance_required`
- `ready_to_start`
- `active`
- `paused`
- `completion_due`
- `completed`
- `cancelled`

Typical transitions:
- creation -> `onboarding` or `awaiting_payment`
- `onboarding -> medical_clearance_required | ready_to_start | awaiting_payment | cancelled`
- `awaiting_payment -> onboarding | ready_to_start | active | cancelled`
- `medical_clearance_required -> onboarding | ready_to_start | cancelled`
- `ready_to_start -> active | medical_clearance_required | cancelled`
- `active -> paused | completion_due | cancelled`
- `paused -> active | cancelled`
- `completion_due -> completed | active | cancelled`

Rules:
- payment state never directly determines subscription state.
- reaching planned end does not auto-complete; it suggests/sets `completion_due` through job/domain logic.
- completion with unresolved coach-owed mandatory components requires explicit override/reason.

## 5. Onboarding item

States:
- `pending`
- `completed`
- `waived`
- `blocked`
- `not_applicable`

Blocking pending/blocked items prevent `ready_to_start` when their service rule requires it.

## 6. Questionnaire template

States:
- `draft`
- `published`
- `retired`

Published versions are immutable; changes create a new version.

## 7. Questionnaire submission

States:
- `draft`
- `submitted`
- `superseded`

Submitted content is immutable. Correction creates a new revision and marks the previous revision superseded.

## 8. Medical clearance

States:
- `required`
- `awaiting_document`
- `under_review`
- `cleared`
- `waived`
- `closed_not_cleared`

The system may flag answers; it does not diagnose or automatically clear.

## 9. Consent decision

Decision values:
- `granted`
- `refused`
- `revoked`

Types include at minimum:
- contact/service processing
- health data
- progress-photo storage
- optional marketing/publication

Each decision is dated/versioned against the exact consent definition.

## 10. Appointment

States:
- `scheduled`
- `confirmed`
- `reschedule_requested`
- `rescheduled`
- `completed`
- `cancelled`
- `missed`

Customer response values may include:
- `pending`
- `confirmed`
- `declined`
- `reschedule_requested`

Rules:
- coach cancellation never consumes entitlement.
- late customer cancellation/missed consumption follows snapshotted service policy.
- reschedule creates history; original scheduling facts remain auditable.

## 11. Follow-up

States:
- `open`
- `done`
- `overdue`
- `cancelled`

Overdue is operational; subscription remains active unless another explicit lifecycle transition occurs.

## 12. Goal

States:
- `active`
- `achieved`
- `partially_achieved`
- `not_achieved`
- `paused`
- `cancelled`

System suggestions never finalize goal status without coach confirmation.

## 13. Document

Logical states:
- `draft`
- `available`
- `revoked`
- `archived`
- `pending_purge`
- `purged`

File scan states:
- `pending`
- `clean`
- `infected`
- `scan_failed`

A file cannot become externally available before accepted validation/malware-scan policy is satisfied.

## 14. Secure access token

Operational states are derived from timestamps/counters:
- active
- expired
- revoked
- exhausted
- consumed

Bearer secrets are never stored in plaintext.

## 15. Payment proof

States:
- `pending_review`
- `confirmed`
- `partially_confirmed`
- `correction_requested`
- `rejected`
- `duplicate`
- `superseded`

Proof status is evidence workflow only; it is not itself an authoritative payment event.

## 16. Payment plan/installment

Payment plan states:
- `draft`
- `active`
- `superseded`
- `settled`
- `cancelled`

Installment states:
- `upcoming`
- `due`
- `partially_paid`
- `paid`
- `overdue`
- `waived`
- `cancelled`

Derived financial statuses are updated from obligations and confirmed allocations.

## 17. Quote

States:
- `draft`
- `issued`
- `accepted`
- `declined`
- `changes_requested`
- `superseded`
- `expired`
- `cancelled`

Issued versions are immutable. Requested changes produce a new version requiring acceptance.

## 18. Receipt

States:
- `issued`
- `voided`

Voiding never deletes the receipt or its sequence number.

## 19. Scheduled job run

States:
- `running`
- `succeeded`
- `failed`
- `skipped`

A logical run key prevents duplicate side effects on retry.

## 20. Retention hold

States:
- `active`
- `released`

Active hold blocks purge/anonymization for its scope.
