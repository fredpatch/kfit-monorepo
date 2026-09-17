---
name: frontend-design
description: Design, implement, review, or validate polished production frontend interfaces while preserving the target project's existing design system, component patterns, accessibility, responsiveness, language rules, and approved scope. Use for pages, forms, dashboards, admin interfaces, landing pages, dialogs, responsive layouts, or significant UI styling.
---

# Frontend Design

Use this skill when work involves:

- new pages
- forms
- dashboards
- landing pages
- admin interfaces
- dialogs/modals
- navigation
- major component styling
- responsive layout
- visual hierarchy
- accessibility-sensitive interaction
- UI redesign or polish

This skill supplements:

- `AGENTS.md`
- `WORKFLOW.md`
- `TASKS.md`
- approved product requirements
- existing project design system

Those sources always take precedence.

> Detailed guidance: [references/guide.md](references/guide.md). Read only the sections relevant to the task.

## Core Principle

Create interfaces that are:

```text
clear
+
intentional
+
cohesive
+
responsive
+
accessible
+
appropriate to the product
```

Avoid generic AI-generated visual patterns.

But also avoid unnecessary redesign.

For an existing application:

```text
existing product language
>
new aesthetic experimentation
```

unless redesign is explicitly approved.

## Planner Usage

When Planner uses this skill, report:

```text
User/task

Existing design language

Existing reusable components

Required UI states

Responsive implications

Accessibility implications

Client/API dependencies

Expected components/pages

Design risks

Out of scope
```

Do not redesign without approval.

## Implementer Usage

When Implementer uses this skill:

1. inspect existing UI first
2. reuse the design system
3. follow approved layout/interaction intent
4. implement required states
5. preserve responsive behavior
6. preserve accessibility
7. avoid unnecessary dependencies
8. run relevant frontend validation

Do not expand an approved frontend task into a redesign.

## Reviewer Usage

Reviewer should verify:

```text
approved UI intent
existing visual language
component reuse
state completeness
responsive behavior
accessibility basics
permission behavior
scope discipline
```

Reviewer should report issues, not redesign the page.

## QA Usage

QA should use `webapp-testing` together with this skill when validating UI.

Verify observable:

- layout
- interaction
- states
- responsiveness
- keyboard behavior
- important accessibility behavior

Do not judge visual quality solely from source code.

## Visual Review Checklist

```text
[ ] user task is clear
[ ] primary action is obvious
[ ] hierarchy is intentional
[ ] existing design system reused
[ ] no unnecessary new component system
[ ] typography is consistent
[ ] spacing is consistent
[ ] colors have semantic purpose
[ ] form states are complete
[ ] loading state exists where needed
[ ] error state exists where needed
[ ] empty state exists where needed
[ ] success feedback exists where needed
[ ] mobile behavior is usable
[ ] no unintended horizontal overflow
[ ] keyboard interaction works where relevant
[ ] focus visibility preserved
[ ] UI language follows project rules
[ ] permissions are reflected without replacing server enforcement
[ ] no unnecessary dependency introduced
[ ] no unrelated redesign occurred
```

## Required Report

For significant frontend work include:

```text
Frontend impact

User/task

Pages/components changed

Existing components reused

New components

Design-system usage

States implemented

Responsive behavior

Accessibility considerations

UI language

API/client impact

Validation

Not validated

Deviations from approved design

Risks / notes
```

## Core Rules

Prefer:

```text
user task > decoration

existing design system > invented system

clear hierarchy > excessive containers

responsive behavior > desktop-only polish

semantic HTML > ARIA workaround

existing component > near-duplicate component

functional states > static happy-path UI

accessible interaction > visual shortcut

intentional design > generic AI aesthetic

scope discipline > opportunistic redesign
```

## Reference sections

- 2. Design Authority
- 3. Inspect Before Designing
- 4. Understand the User Task
- 5. Preserve Existing Design Systems
- 6. Dependency Policy
- 7. Visual Direction
- 8. Existing Business Applications
- 9. Visual Hierarchy
- 10. Avoid Generic AI UI
- 11. Layout
- 12. Spacing
- 13. Typography
- 14. Color
- 15. Status Colors
- 16. Forms
- 17. Form Layout
- 18. Validation UX
- 19. Primary Actions
- 20. Destructive Actions
- 21. Loading States
- 22. Empty States
- 23. Error States
- 24. Tables and Data-heavy Screens
- 25. Mobile Responsiveness
- 26. Breakpoints
- 27. Touch Targets
- 28. Accessibility
- 29. Keyboard Interaction
- 30. Focus
- 31. Motion
- 32. Icons
- 33. UI Language and Localization
- 34. Copywriting
- 35. Existing Components Before New Components
- 36. Abstraction Threshold
- 37. Component Responsibility
- 38. API Integration
- 39. State Management
- 40. Server State
- 41. Optimistic UI
- 42. Permission-sensitive UI
- 43. Feedback
- 44. Dialogs
- 45. Navigation
- 46. Performance
- 52. Stop Conditions
