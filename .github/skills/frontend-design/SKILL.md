---
name: frontend-design
description: Design, implement, review, or validate polished production frontend interfaces while preserving the target project's existing design system, component patterns, accessibility, responsiveness, language rules, and approved scope. Use for pages, forms, dashboards, admin interfaces, landing pages, dialogs, responsive layouts, or significant UI styling.
---

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

---

# 1. Core Principle

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

---

# 2. Design Authority

Use this priority:

1. approved product/design requirements
2. existing design system
3. existing application visual language
4. reusable components
5. established layout conventions
6. this skill's design guidance

Never use this skill to override an approved UI direction.

---

# 3. Inspect Before Designing

Before changing UI, inspect:

- target user
- user task
- existing page/component
- global styles
- design tokens
- typography
- spacing system
- component library
- existing form patterns
- navigation patterns
- loading/error states
- mobile behavior
- related screens

Do not begin by generating JSX/CSS blindly.

---

# 4. Understand the User Task

Before visual styling, answer:

```text
Who uses this?

What are they trying to accomplish?

What information is primary?

What action is primary?

What can go wrong?

What should happen next?
```

Design hierarchy around the task.

Do not design around decorative components.

---

# 5. Preserve Existing Design Systems

If the project already uses:

- Tailwind
- Shadcn
- Material UI
- Chakra
- custom tokens
- CSS variables
- component primitives
- shared layout components

reuse them.

Prefer:

```text
existing component
→ extend if needed
→ new component only when justified
```

Do not create parallel component systems.

---

# 6. Dependency Policy

Do not install a new UI, animation, icon, chart, or styling dependency without explicit approval.

Before proposing one:

1. inspect existing dependencies
2. determine whether existing tools can solve the problem
3. explain why the dependency is needed
4. identify bundle/maintenance impact

Never install dependencies merely to achieve visual polish.

---

# 7. Visual Direction

For greenfield or explicitly redesigned UI, choose an intentional visual direction based on:

- product purpose
- target audience
- brand
- environment of use
- content density
- expected trust level

Examples may include:

```text
minimal / professional
editorial
technical / utilitarian
premium
warm / approachable
sport / energetic
institutional
data-dense operational
```

Do not choose a style because it is fashionable.

---

# 8. Existing Business Applications

For admin/business software, prioritize:

```text
clarity
scanability
predictability
data density
fast task completion
```

over decorative experimentation.

Avoid turning operational software into a marketing landing page.

---

# 9. Visual Hierarchy

Every screen should make clear:

```text
where am I?
what is important?
what can I do?
what needs attention?
```

Use hierarchy through:

- spacing
- type scale
- alignment
- grouping
- contrast
- placement
- weight

Do not rely on excessive borders, cards, badges, or colors.

---

# 10. Avoid Generic AI UI

Avoid repetitive patterns such as:

- card inside card inside card
- unnecessary pill-shaped containers
- excessive gradients
- gratuitous glassmorphism
- giant hero headings in business apps
- decorative blobs
- random icon boxes
- excessive rounded corners
- meaningless metrics
- filler copy
- excessive animations
- unnecessary dashboard grids

Every visual treatment should support:

```text
hierarchy
affordance
feedback
branding
or comprehension
```

---

# 11. Layout

Prefer clear structural regions.

Examples:

```text
page header
primary action
content area
secondary actions
status/context
```

Use alignment consistently.

Avoid arbitrary offsets.

Use whitespace intentionally.

---

# 12. Spacing

Follow existing spacing tokens where available.

Maintain consistent relationships between:

```text
label ↔ field
field ↔ field
section ↔ section
heading ↔ content
card ↔ card
```

Do not use random pixel values when tokens exist.

---

# 13. Typography

Use existing project typography first.

Typography should communicate hierarchy through:

- size
- weight
- line height
- spacing
- contrast

Avoid using too many font sizes or weights.

Do not introduce a new font without approval.

---

# 14. Color

Use existing project colors/tokens.

Color should primarily communicate:

- hierarchy
- action
- state
- feedback
- brand

Avoid using color as the only indicator of meaning.

Do not introduce decorative colors without purpose.

---

# 15. Status Colors

Status colors should remain consistent.

Examples:

```text
success
warning
danger
info
neutral
```

Do not create slightly different shades for the same semantic state across pages.

---

# 16. Forms

Forms should optimize completion and comprehension.

Check:

- clear labels
- logical grouping
- appropriate field width
- field help only when useful
- obvious required fields
- visible validation
- sensible defaults
- keyboard flow
- pending state
- success state
- error state

Do not use placeholders as the only label.

---

# 17. Form Layout

Prefer one-column forms for complex input unless multiple columns genuinely improve comprehension.

Use side-by-side fields when they are strongly related and space permits.

On narrow viewports:

```text
multi-column
→ collapse to single column
```

---

# 18. Validation UX

Validation messages should explain:

```text
what is wrong
+
how to fix it
```

Do not expose raw server/internal errors.

Preserve typed business errors where they provide useful user guidance.

---

# 19. Primary Actions

Every task-focused view should have an obvious primary action.

Avoid multiple equally dominant buttons.

Use hierarchy such as:

```text
primary
secondary
tertiary
destructive
```

consistently.

---

# 20. Destructive Actions

Destructive actions must:

- look distinct
- avoid accidental activation
- require confirmation when impact is meaningful
- explain consequence
- preserve project conventions

Do not use aggressive confirmation dialogs for trivial reversible actions.

---

# 21. Loading States

Design loading behavior intentionally.

Use:

- skeletons for content-heavy views
- spinners for contained actions
- pending button states for mutations

Prevent conflicting actions during critical mutations.

Avoid full-page blocking loaders when only one region is loading.

---

# 22. Empty States

Empty state should explain:

```text
what is empty
why that matters
what the user can do next
```

when an action exists.

Do not fill empty views with unnecessary illustrations unless the product style supports them.

---

# 23. Error States

Error UI should:

- identify that something failed
- provide understandable feedback
- offer recovery when possible
- avoid internal details

Differentiate:

```text
empty
loading
permission denied
network failure
validation failure
server failure
```

where useful.

---

# 24. Tables and Data-heavy Screens

For tables:

- prioritize important columns
- align numeric data consistently
- keep actions predictable
- avoid excessive column count
- provide empty/loading states
- support responsive fallback
- preserve readable density

Use badges only for meaningful categorical/status information.

---

# 25. Mobile Responsiveness

Do not treat mobile as desktop compressed.

Consider:

- navigation
- action placement
- field stacking
- table alternatives
- touch targets
- modal sizing
- readable text width

Avoid horizontal scrolling unless inherently required by data.

---

# 26. Breakpoints

Use project breakpoints.

Do not invent new breakpoint values unnecessarily.

Design behavior intentionally across:

```text
mobile
tablet when relevant
desktop
```

---

# 27. Touch Targets

Interactive targets should be comfortably usable on touch devices.

Avoid tiny:

- icons
- checkboxes
- action buttons
- menu triggers

especially when actions are operationally important.

---

# 28. Accessibility

Use semantic HTML first.

Verify where applicable:

- form labels
- buttons vs links
- heading hierarchy
- keyboard access
- visible focus
- dialog semantics
- error association
- accessible names
- contrast
- reduced-motion compatibility

ARIA should supplement semantics, not replace correct HTML.

---

# 29. Keyboard Interaction

Interactive UI should support expected keyboard behavior.

Verify:

```text
Tab
Shift+Tab
Enter
Space
Escape
```

where relevant.

Dialogs and menus need predictable focus behavior.

---

# 30. Focus

Never remove visible focus indicators without replacing them with an accessible alternative.

After closing dialogs/modals, restore focus appropriately.

---

# 31. Motion

Use animation only when it improves:

- orientation
- feedback
- continuity
- state understanding

Avoid decorative motion in operational apps.

Respect reduced-motion preferences when substantial animation exists.

---

# 32. Icons

Use the project's existing icon system.

Icons should:

- clarify action/state
- remain consistent in style
- not replace labels where meaning is ambiguous

Do not introduce emojis as UI icons unless the product deliberately uses them.

---

# 33. French UI

For projects whose user interface language is French:

- use natural French wording
- preserve accents
- avoid literal English translation
- keep terminology consistent
- reuse established business vocabulary

Code, identifiers, and technical internals remain English unless project rules state otherwise.

---

# 34. Copywriting

UI copy should be concise and task-oriented.

Prefer:

```text
Enregistrer
Créer la demande
Annuler
Réessayer
```

over vague wording such as:

```text
Continuer
Valider
OK
```

when the action can be named more precisely.

---

# 35. Existing Components Before New Components

Before creating a new component:

1. search for equivalent components
2. inspect variants/props
3. reuse or extend when sensible
4. create a new one only when behavior is genuinely distinct

Avoid near-duplicate component proliferation.

---

# 36. Abstraction Threshold

Do not extract a reusable component just because two JSX blocks look similar.

Extract when there is shared:

- behavior
- semantic meaning
- styling contract
- repeated maintenance need

Avoid premature component architecture.

---

# 37. Component Responsibility

Prefer components with clear responsibilities.

Avoid:

- enormous pages containing every concern
- overly fragmented micro-components
- components coupling API/domain behavior directly to presentation unnecessarily

Follow existing project architecture.

---

# 38. API Integration

Use existing API/query/mutation layers.

Do not call endpoints ad hoc directly from components if the project uses an API abstraction.

Use `api-contract-design` when API behavior changes.

---

# 39. State Management

Use existing application state patterns.

Prefer local state when state is local.

Do not introduce global state management for convenience.

Do not duplicate server state unnecessarily.

---

# 40. Server State

For applications using query libraries such as TanStack Query:

follow existing patterns for:

- queries
- mutations
- invalidation
- optimistic behavior
- error handling

Do not create separate custom fetching conventions.

---

# 41. Optimistic UI

Use optimistic updates only when:

- failure recovery is clear
- user benefit is meaningful
- business invariants allow it

Avoid optimistic state for sensitive/irreversible operations unless explicitly designed.

---

# 42. Permission-sensitive UI

For role/permission-controlled actions:

```text
server enforcement
+
client visibility
```

must both exist.

The design skill may hide/disable actions appropriately but must never substitute UI behavior for authorization.

---

# 43. Feedback

Actions should provide appropriate feedback.

Examples:

```text
pending
success
failure
```

Avoid success toasts for every trivial interaction.

Use persistent feedback when users need to reference the result.

---

# 44. Dialogs

Use dialogs when interruption is justified.

Do not put entire application workflows into modal chains.

Dialogs should have:

- clear title
- clear purpose
- obvious primary action
- cancel path
- keyboard behavior
- responsive sizing

---

# 45. Navigation

Navigation should reflect user mental models, not code module structure.

Maintain current project navigation conventions.

Do not add a new navigation level for every new feature.

---

# 46. Performance

Avoid visual implementation that causes unnecessary:

- rerenders
- huge images
- heavy animation libraries
- excessive DOM
- large dependencies

Visual polish must not significantly degrade usability or load performance without justification.

---

# 47. Planner Usage

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

---

# 48. Implementer Usage

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

---

# 49. Reviewer Usage

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

---

# 50. QA Usage

QA should use `webapp-testing` together with this skill when validating UI.

Verify observable:

- layout
- interaction
- states
- responsiveness
- keyboard behavior
- important accessibility behavior

Do not judge visual quality solely from source code.

---

# 51. Visual Review Checklist

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

---

# 52. Stop Conditions

Stop and report when:

- approved design intent is missing for a major redesign
- existing design system conflicts with requested design
- implementation requires a new dependency
- scope expands materially
- component ownership is unclear
- business terminology is undefined
- accessibility would require architectural changes outside approved scope

Do not guess large visual/product decisions.

---

# 53. Required Report

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

---

# 54. Core Rules

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
