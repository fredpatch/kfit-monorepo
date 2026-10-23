# K'FIT — Sprint 7 execution spec

## Objective

Deliver the V1 Core operational layer: dashboard KPIs and alert workspaces, notification engine, retention/anonymization, backup/restore readiness and remaining hardening before Sprint 8 UAT.

## Ordered tasks

1. S7.1 — Core dashboard KPIs and operational alert workspaces — PLANNING / Gate 1 pending.
2. S7.2 — Dashboard and email notification engine with configurable reminders — CLOSED until S7.1 validation.
3. S7.3 — Retention, anonymization, soft-delete purge and privacy-action replay — CLOSED until S7.2 validation.
4. S7.4 — Backup/restore and production-hardening acceptance — CLOSED until S7.3 validation.

## Dependency notes

- Sprint 6 is closed and provides the authoritative finance data needed by dashboard/alerts.
- Existing UX-9/UX-9b already provides the current-day dashboard shell and current KPI reads.
- Sprint 7 must complete the deferred dashboard trend/alert behavior without duplicating already validated dashboard endpoints.
- Staging, production and coach training belong to Sprint 9, not Sprint 7.
- Sprint 8 remains the V1 Core UAT/correction gate.

## S7.1 — initial planning target

Backlog source: **Core dashboard KPIs and operational alert workspaces**.

Known required inputs:
- requests;
- subscriptions;
- follow-ups;
- appointments;
- financial ledger.

Known business note:
- collected, billed/future, overdue and outstanding financial amounts must remain distinct rather than collapsed into one money KPI.

Related deferred UX/API work to reconcile during Gate 1:
- weekly/monthly time series for board 02;
- KPI sparklines and period deltas;
- requests funnel period statistics;
- existing UX-9c dashboard fidelity work.

No S7.1 implementation before Fred approves Gate 1.
