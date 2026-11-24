# S9A.3 validation bridge - boot production API without advancing later tasks

Status: execution bridge for S9A.3 only.

## Why this bridge exists

S9A.3 acceptance still requires:

- `GET /health` through the public HTTPS reverse proxy;
- auth cookies retain Secure / HttpOnly / SameSite behavior through nginx;
- real client IP attribution through the trusted proxy boundary.

Those checks require a running production API.

The current Sprint 9A task order creates a dependency knot:

- S9A.3 needs a runnable API and an authenticated request;
- S9A.4 validates real SMTP/authentication flows;
- S9A.6 creates/migrates the production database and bootstraps the first admin account.

Therefore this bridge performs only the minimum prerequisites needed to finish S9A.3. It does NOT close S9A.4 or S9A.6.

## Scope

Allowed:

1. provision missing production secrets required by startup guards;
2. configure temporary/real SMTP only if strictly required for startup/auth validation;
3. run the documented production database migration path;
4. create the first admin account with a temporary bootstrap token;
5. remove the bootstrap token after use;
6. start the production API;
7. validate S9A.3 acceptance through public HTTPS;
8. stop and record any later-task acceptance checks that have not actually been performed.

Not allowed:

- claim S9A.4 complete;
- claim S9A.6 complete;
- configure all SMTP acceptance scenarios;
- publish production consent content beyond what is strictly needed to boot;
- begin S9A.5 storage/PDF acceptance;
- update changelog as though S9A.4/S9A.6 were validated.

## First inspect

Before giving Fred commands, inspect:

- `.env.prod.example`;
- `packages/server/src/runtime/production-guards.ts`;
- `packages/server/src/prod-app.ts`;
- `packages/server/scripts/prod/api-server.mjs`;
- database migration scripts/package.json commands;
- first-account/bootstrap runbook;
- auth cookie config and login/session routes;
- any production preflight related to auth/proxy;
- `docker-compose.prod.yml`;
- `docs/runbooks/demarrage-production.md`.

Determine the exact minimal env keys required for API startup and distinguish:

- startup-blocking variables;
- variables that can be omitted safely;
- variables whose external service may be unreachable but only warn.

Do not invent fake placeholder values that production guards reject.

## Secret provisioning

Fred already created:

`/srv/kfit/config/.env.prod`

with PostgreSQL/database URL, app base URL, private-storage paths and ClamAV values.

Design the smallest secure additions for:

- required auth peppers/secrets;
- SMTP keys only according to actual startup guard behavior;
- temporary `KFIT_BOOTSTRAP_TOKEN` only for first account creation;
- any other truly required production guard values.

Use strong generated values and commands that never echo them back unnecessarily.

Keep file mode 600.

Do not put `KFIT_TRUSTED_PROXY_IP` in the env file; Compose owns it from the same gateway anchor.

## Database

Use the existing production `ops` image and documented migration command. Do not install tooling on the VPS.

Use the exact immutable `8526498` ops digest already pulled unless a later code-only nginx commit changed no migration/runtime image requirement.

Do not expose PostgreSQL.

## Bootstrap

Use the project's existing bootstrap contract/runbook. Do not manually insert database rows.

Create only one admin account needed for S9A.3 auth validation.

After successful bootstrap:

- remove `KFIT_BOOTSTRAP_TOKEN` from the env file;
- restart/recreate API only as required;
- verify bootstrap endpoint is closed.

Do not create Konny/customer beta data yet unless required by the existing bootstrap contract.

## S9A.3 validation targets

Once API is healthy, Fred must validate:

### 1. Health through intended path

```bash
curl -i https://kfitpulse.io/health
```

Expected: 200 and JSON health response.

### 2. Auth cookies over HTTPS

Perform a real login/session flow through `https://kfitpulse.io`.

Capture response headers without exposing credential values.

Prove relevant cookies retain the expected:

- `Secure`;
- `HttpOnly` where applicable;
- `SameSite`;
- `Path`.

Also prove CSRF behavior still works for the mutating refresh/logout path if the existing auth preflight/runbook supports it.

### 3. Trusted client IP

Use a request that produces an audit event from an external device/network.

Confirm the resulting audit IP hash is NOT the hash of `10.247.13.1`.

Repeat from a second network where practical and confirm the hashes differ.

Do not expose raw sensitive audit data unnecessarily.

### 4. Exposure

Confirm:

- nginx public: 80/443;
- API: 127.0.0.1:13000 only;
- client: 127.0.0.1:18080 only;
- no host 5432/3310.

## State handling

After these checks:

- if S9A.3 acceptance passes, mark S9A.3 validated;
- keep S9A.4 and S9A.6 in their original statuses, noting only that prerequisite pieces were provisioned/exercised;
- next formal task remains S9A.4 according to sprint order.

Update project state only after Fred confirms runtime results.

## Expected report

Return:

- exact startup blockers found;
- minimal env additions required;
- exact migration command;
- exact bootstrap flow;
- any circular dependency found;
- commands Fred should run in order;
- which actions belong only to this bridge vs later S9A.4/S9A.6 acceptance;
- anything still unvalidated.

Do not implement unrelated code unless inspection reveals a genuine blocker that cannot be solved operationally.
