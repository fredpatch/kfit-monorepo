# frontend-design — detailed guide

Loaded on demand from `../SKILL.md`.

## Design Authority

Use this priority:

1. approved product/design requirements
2. existing design system
3. existing application visual language
4. reusable components
5. established layout conventions
6. this skill's design guidance

Never use this skill to override an approved UI direction.


## Inspect Before Designing

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


## Understand the User Task

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


## Preserve Existing Design Systems

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


## Dependency Policy

Do not install a new UI, animation, icon, chart, or styling dependency without explicit approval.

Before proposing one:

1. inspect existing dependencies
2. determine whether existing tools can solve the problem
3. explain why the dependency is needed
4. identify bundle/maintenance impact

Never install dependencies merely to achieve visual polish.


## Visual Direction

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


## Existing Business Applications

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


## Visual Hierarchy

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


## Avoid Generic AI UI

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


## Layout

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


## Spacing

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


## Typography

Use existing project typography first.

Typography should communicate hierarchy through:

- size
- weight
- line height
- spacing
- contrast

Avoid using too many font sizes or weights.

Do not introduce a new font without approval.


## Color

Use existing project colors/tokens.

Color should primarily communicate:

- hierarchy
- action
- state
- feedback
- brand

Avoid using color as the only indicator of meaning.

Do not introduce decorative colors without purpose.


## Status Colors

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


## Forms

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


## Form Layout

Prefer one-column forms for complex input unless multiple columns genuinely improve comprehension.

Use side-by-side fields when they are strongly related and space permits.

On narrow viewports:

```text
multi-column
→ collapse to single column
```


## Validation UX

Validation messages should explain:

```text
what is wrong
+
how to fix it
```

Do not expose raw server/internal errors.

Preserve typed business errors where they provide useful user guidance.


## Primary Actions

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


## Destructive Actions

Destructive actions must:

- look distinct
- avoid accidental activation
- require confirmation when impact is meaningful
- explain consequence
- preserve project conventions

Do not use aggressive confirmation dialogs for trivial reversible actions.


## Loading States

Design loading behavior intentionally.

Use:

- skeletons for content-heavy views
- spinners for contained actions
- pending button states for mutations

Prevent conflicting actions during critical mutations.

Avoid full-page blocking loaders when only one region is loading.


## Empty States

Empty state should explain:

```text
what is empty
why that matters
what the user can do next
```

when an action exists.

Do not fill empty views with unnecessary illustrations unless the product style supports them.


## Error States

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


## Tables and Data-heavy Screens

For tables:

- prioritize important columns
- align numeric data consistently
- keep actions predictable
- avoid excessive column count
- provide empty/loading states
- support responsive fallback
- preserve readable density

Use badges only for meaningful categorical/status information.


## Mobile Responsiveness

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


## Breakpoints

Use project breakpoints.

Do not invent new breakpoint values unnecessarily.

Design behavior intentionally across:

```text
mobile
tablet when relevant
desktop
```


## Touch Targets

Interactive targets should be comfortably usable on touch devices.

Avoid tiny:

- icons
- checkboxes
- action buttons
- menu triggers

especially when actions are operationally important.


## Accessibility

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


## Keyboard Interaction

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


## Focus

Never remove visible focus indicators without replacing them with an accessible alternative.

After closing dialogs/modals, restore focus appropriately.


## Motion

Use animation only when it improves:

- orientation
- feedback
- continuity
- state understanding

Avoid decorative motion in operational apps.

Respect reduced-motion preferences when substantial animation exists.


## Icons

Use the project's existing icon system.

Icons should:

- clarify action/state
- remain consistent in style
- not replace labels where meaning is ambiguous

Do not introduce emojis as UI icons unless the product deliberately uses them.


## UI Language and Localization

Use the UI language defined in `PROJECT.md §Language`.

When the UI language is not English (for example French):

- use natural wording, not literal English translation
- preserve accents and special characters end to end (DB, API, exports, emails)
- keep terminology consistent and reuse established business vocabulary
- localize error messages; never show raw error codes to end users
- respect local date, number and currency formats

Code, identifiers and technical internals follow the language rule in `PROJECT.md`.


## Copywriting

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


## Existing Components Before New Components

Before creating a new component:

1. search for equivalent components
2. inspect variants/props
3. reuse or extend when sensible
4. create a new one only when behavior is genuinely distinct

Avoid near-duplicate component proliferation.


## Abstraction Threshold

Do not extract a reusable component just because two JSX blocks look similar.

Extract when there is shared:

- behavior
- semantic meaning
- styling contract
- repeated maintenance need

Avoid premature component architecture.


## Component Responsibility

Prefer components with clear responsibilities.

Avoid:

- enormous pages containing every concern
- overly fragmented micro-components
- components coupling API/domain behavior directly to presentation unnecessarily

Follow existing project architecture.


## API Integration

Use existing API/query/mutation layers.

Do not call endpoints ad hoc directly from components if the project uses an API abstraction.

Use `api-contract-design` when API behavior changes.


## State Management

Use existing application state patterns.

Prefer local state when state is local.

Do not introduce global state management for convenience.

Do not duplicate server state unnecessarily.


## Server State

For applications using query libraries such as TanStack Query:

follow existing patterns for:

- queries
- mutations
- invalidation
- optimistic behavior
- error handling

Do not create separate custom fetching conventions.


## Optimistic UI

Use optimistic updates only when:

- failure recovery is clear
- user benefit is meaningful
- business invariants allow it

Avoid optimistic state for sensitive/irreversible operations unless explicitly designed.


## Permission-sensitive UI

For role/permission-controlled actions:

```text
server enforcement
+
client visibility
```

must both exist.

The design skill may hide/disable actions appropriately but must never substitute UI behavior for authorization.


## Feedback

Actions should provide appropriate feedback.

Examples:

```text
pending
success
failure
```

Avoid success toasts for every trivial interaction.

Use persistent feedback when users need to reference the result.


## Dialogs

Use dialogs when interruption is justified.

Do not put entire application workflows into modal chains.

Dialogs should have:

- clear title
- clear purpose
- obvious primary action
- cancel path
- keyboard behavior
- responsive sizing


## Navigation

Navigation should reflect user mental models, not code module structure.

Maintain current project navigation conventions.

Do not add a new navigation level for every new feature.


## Performance

Avoid visual implementation that causes unnecessary:

- rerenders
- huge images
- heavy animation libraries
- excessive DOM
- large dependencies

Visual polish must not significantly degrade usability or load performance without justification.


## Stop Conditions

Stop and report when:

- approved design intent is missing for a major redesign
- existing design system conflicts with requested design
- implementation requires a new dependency
- scope expands materially
- component ownership is unclear
- business terminology is undefined
- accessibility would require architectural changes outside approved scope

Do not guess large visual/product decisions.
