# K'FIT Development State

## Current Sprint

```text
Sprint 3
```

## Status

```text
S3.1 — CLOSED / LOCALLY VALIDATED
S3.2 — NEXT / NOT STARTED
```

Sprint 2 is closed and must not be reopened unless investigating a confirmed regression.

Execution branch: `sprint-3`.

S3.1 public request/prospect intake was locally validated by Fred on 2026-09-17, including migration `0002_rapid_boomerang.sql`, the real-PostgreSQL concurrent same-token idempotency test, shared/server automated validation, `db:check`, and client typecheck regression.

---

# ✅ Closed

```text
Sprint 0
Sprint 1 — Authentication Foundation
Password Recovery
Sprint 2 — Catalogue Foundation
Sprint 3.1 — Public request/prospect intake contract
```

Do not modify completed functionality unless:

- the active Sprint 3 slice explicitly depends on extending it;
- a regression is confirmed;
- the developer explicitly approves reopening the affected area.

---

# ⏳ Current

## S3.2 — Public request form

Goal: expose the validated S3.1 request intake through the public catalogue experience.

Dependency: S3.1 `POST /requests` contract is authoritative and must not be redefined client-side.

Expected client boundary:

- name + phone per service;
- optional approved variant context;
- client-generated submission token;
- honeypot and minimum-completion-time support;
- loading/disabled/success/error states;
- French-first responsive UI;
- typed server-error handling;
- public catalogue regression protection.

Before implementation, the Planner/Reviewer workflow must confirm the smallest coherent S3.2 plan. The Implementer must not open S3.3 concurrently.

---

# Remaining Sprint 3 order

```text
S3.2 — Public request form
S3.3 — Admin request queue + contact attempts
S3.4 — Qualification review recording
S3.5 — Manual waitlist entry management
```

---

# Validation Policy

Every Sprint 3 slice distinguishes:

```text
implementation complete
automated validation complete
developer functional validation complete
```

Only Fred's successful local execution closes the functional validation gate.

---

# Active production blockers

- Legal validation for applicable Gabon requirements.
- True encrypted off-server backup destination.

Non-blocking technical notes retained for later hardening: process-local IP rate limiting, production `trust proxy` configuration, prospect-reuse concurrency edge, rate-limiter memory growth, timing clock-skew hardening, audit symmetry, and origin-helper deduplication.
