# S9A.3 temporary Mailpit bridge

Status: temporary operational bridge for S9A.3 only.

## Goal

Allow the production API to start and complete the remaining S9A.3 auth/cookie/CSRF/client-IP validation while real SMTP credentials are not yet available.

This is NOT S9A.4 SMTP validation.

Mailpit is temporary and must be removable without changing application code.

## Constraints

- Keep Mailpit internal to the VPS / Docker topology.
- Do not expose Mailpit SMTP publicly.
- Do not expose Mailpit UI publicly.
- If UI access is needed, bind it to 127.0.0.1 only and access it through SSH tunneling.
- No nginx public route for Mailpit.
- No real customer data.
- No changelog completion entry yet.
- Do not mark S9A.4 complete.
- Do not modify application SMTP code.

## Inspect first

Inspect:

- docker-compose.prod.yml
- .env.prod.example
- docs/runbooks/demarrage-production.md
- packages/server SMTP config/loading
- existing dev Mailpit usage, if any
- current kfit_backend / kfit_edge network topology
- production healthchecks and dependency ordering

Reuse any existing Mailpit pattern already present in the repo.

## Desired topology

Production API should reach Mailpit by Docker DNS on the internal backend network.

Preferred runtime contract:

SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=<non-empty bridge value if production guard requires it>
SMTP_PASS=<non-empty bridge value if production guard requires it>
SMTP_FROM=no-reply@kfitpulse.io

Important: production guards currently require SMTP_USER and SMTP_PASS to be non-empty. If Mailpit itself does not require auth, use explicit non-secret bridge sentinel values that DO NOT match production placeholder patterns and document that they are temporary Mailpit-only compatibility values.

Do not weaken production guards just for Mailpit.

## Compose design

Add Mailpit only through an explicit temporary profile such as:

profiles: ["mailpit-bridge"]

or another equally explicit mechanism.

Requirements:

- image pinned to a specific version, not latest;
- attached only to the network required for API -> Mailpit SMTP;
- SMTP port 1025 not published to the host;
- UI port, if published at all, must bind only to 127.0.0.1:8025;
- restart policy appropriate for temporary beta bridge;
- no privileged mode;
- no extra capabilities;
- Mailpit storage can be ephemeral unless there is already a project convention requiring persistence;
- the API should not gain any new published ports.

Do not make Mailpit part of the default production stack after S9A.4 is complete.

## Environment

Fred's production env file is:

/srv/kfit/config/.env.prod

Do not commit actual runtime secrets/values.

Document the exact temporary SMTP values Fred should add.

Because production guards reject values containing:

- change-me
- changeme
- change_me
- example
- dev-
- xxx
- todo

choose bridge sentinel values that cannot be mistaken for production credentials and still pass the current guard.

Example concept only; inspect actual SMTP loader first:

SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=kfit-mailpit-bridge
SMTP_PASS=kfit-mailpit-bridge-pass
SMTP_FROM=no-reply@kfitpulse.io

If the SMTP transport passes auth credentials through to Mailpit and that causes auth failure, configure Mailpit SMTP auth explicitly OR choose the supported Mailpit no-auth approach while still satisfying K'FIT's production guard without weakening it. Inspect Mailpit support and existing repo conventions before deciding.

## VPS operational flow

Return exact commands for Fred to:

1. pull the commit;
2. export the existing immutable API/client/ops image refs;
3. add/verify temporary SMTP values in /srv/kfit/config/.env.prod;
4. start Mailpit bridge only;
5. verify Mailpit is reachable from the Docker backend network;
6. verify UI is only 127.0.0.1 if enabled;
7. access Mailpit UI via SSH tunnel from Fred's Windows/Git Bash machine;
8. run DB-migrated API startup;
9. add KFIT_BOOTSTRAP_TOKEN;
10. bootstrap first super-admin through https://kfitpulse.io;
11. read the OTP from Mailpit;
12. remove KFIT_BOOTSTRAP_TOKEN immediately after bootstrap;
13. recreate API;
14. finish S9A.3 /health, cookies, CSRF, client-IP and exposure validation.

## Validation

Static:

- compose config
- format/docs/lint checks relevant to changed files
- any existing deployment tests

Runtime validation by Fred:

- mailpit container healthy/running;
- host has no public 1025;
- host has 127.0.0.1:8025 only if UI enabled;
- API can deliver new-device OTP into Mailpit;
- /health 200 through https;
- login cookies preserve expected attributes;
- CSRF refresh/logout behavior works;
- audit IP attribution matches external client IP and not Docker gateway;
- no DB/ClamAV ports published.

## Removal plan

Document the exact S9A.4 cleanup:

- replace SMTP\_\* with real provider credentials;
- stop/remove Mailpit bridge profile/container;
- remove any Mailpit-specific Compose additions if intended as temporary-only artifact, or keep profile disabled and documented if there is value for future staging;
- confirm no dependency on Mailpit remains;
- then run the real SMTP acceptance suite.

## State handling

If implementation is only Compose/docs/test support, commit and push it.

Do NOT update changelog.md.

Return:

- chosen Mailpit image/version;
- exact Compose/network design;
- env values/constraints;
- whether SMTP auth had to be enabled in Mailpit;
- exact VPS commands;
- SSH tunnel command for Fred;
- static validation results;
- commit SHA;
- what remains unvalidated.
