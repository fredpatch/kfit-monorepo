# Auth module

Server-side authentication code is organized by responsibility.

## Structure

- `config/` — typed auth configuration and environment parsing.
- `controllers/` — HTTP/controller boundary, framework-independent until Express binding.
- `middleware/` — request guards, cookie and CSRF helpers.
- `repositories/` — Drizzle/PostgreSQL adapters.
- `routes/` — route manifest and future Express route binding.
- `services/` — auth business logic.
  - `crypto/` — auth-specific crypto helpers.
  - `policies/` — pure policy checks.
- `types/` — transport/module types shared inside the server auth module.
- `tests/` — auth module tests and explicit integration harnesses.

## Rules

- Keep business rules in services/policies, not controllers.
- Keep Drizzle queries in repositories.
- Keep HTTP concerns in controllers/middleware/routes.
- Do not add client or shared package contracts inside this module.
- Do not mark a slice validated until Fred confirms local command output.
