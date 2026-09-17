# K'FIT Development State

## Current Branch

```text
sprint-2/catalogue-foundation
```

## Current Sprint

```text
Sprint 2 — Catalogue Foundation
```

## Current Objective

Finish:

```text
S2.5 — Capacity / Waitlist Controls
```

Do not start the next Sprint 2 slice until S2.5 receives local functional validation.

---

# ✅ Validated

The following work is already complete and developer-validated:

```text
Sprint 0
Sprint 1 — Authentication Foundation
Password Recovery
S2.1 — Public Catalogue API
S2.2 — Catalogue Seed
S2.3 — Admin Catalogue Editing
S2.4 — Public Landing Page Catalogue Consumption
```

Validated S2.4 head was already fast-forwarded to `main`:

```text
6b2fe6d...
```

Do not redo these items unless investigating a regression.

---

# ⏳ Current

## S2.5 — Capacity / Waitlist Controls

Status:

```text
IMPLEMENTATION IN PROGRESS
NOT FUNCTIONALLY ACCEPTED
```

### Goal

Add explicit administrative controls for service capacity and waitlist behavior.

---

## Already Implemented

### Shared contract

Added admin capacity route:

```text
adminServiceCapacity:
"/admin/catalogue/services/:serviceId/capacity"
```

Added:

```text
CatalogueServiceCapacityInput
```

Because this touches the shared package, all known consumers must be validated.

---

### Server

Added service logic:

```text
updateAdminServiceCapacity
```

Capacity and waitlist validation/business rules have been introduced.

Do not assume this slice is complete merely because these changes exist.

---

## Required Before S2.5 Can Close

Confirm remaining implementation state by inspecting the repository.

At minimum verify:

- [ ] shared contract usage is complete
- [ ] server route/controller wiring exists
- [ ] authorization is enforced server-side
- [ ] capacity validation rules are correct
- [ ] waitlist rules are correct
- [ ] client/admin UI is implemented if required by the approved slice
- [ ] loading/error/success states are handled
- [ ] invalid capacity values are rejected
- [ ] relevant automated tests exist or are updated
- [ ] `@kfit/shared` validates
- [ ] `@kfit/server` typechecks
- [ ] `@kfit/client` typechecks
- [ ] client production build succeeds
- [ ] Git diff reviewed
- [ ] Fred performs local functional validation

The final checkbox may only be completed by Fred.

---

# Business Rules

Do not invent capacity/waitlist behavior.

Before completing S2.5, inspect the existing implementation and active specification for rules covering areas such as:

```text
capacity bounds
capacity disabled/unlimited behavior
waitlist enabled/disabled behavior
existing booking implications
invalid transitions
admin authorization
```

If expected behavior is not defined, stop and report the missing rule.

---

# Validation

Before additional changes, establish the current baseline when practical.

Known relevant checks include:

```bash
npm run typecheck
npm run build
```

Inspect root and workspace `package.json` files for the exact test/lint scripts.

Because S2.5 modifies the shared contract, validate:

```text
packages/shared
apps/server
apps/client
```

Do not report any check as passed unless it actually executed successfully.

---

# Change Budget

Expected remaining work should stay narrowly scoped to S2.5.

Likely layers:

```text
shared contract
server API / service
admin client UI
tests
```

If completing S2.5 unexpectedly requires a broad architectural refactor or large unrelated change set, stop and report the reason before continuing.

---

# 🔜 Next

The next Sprint 2 item must be read from the current project roadmap/task documentation.

Do not infer or begin it until:

```text
S2.5 implementation complete
+
automated validation complete
+
Fred local validation complete
```

---

# Handoff State

When stopping mid-task, update or report:

```text
Branch
Current task
Files changed
Implemented
Validation completed
Not validated
Known issues
Pending developer validation
Next concrete step
```

Do not mark S2.5 complete during an interrupted session.
