# Sprint 9A - Hostinger Beta Environment

Status: IN PROGRESS. S9A.1, S9A.2, S9A.2b, S9A.3, S9A.5 and S9A.6 validated by Fred; S9A.4 is blocked pending Konny Gmail credentials; S9A.7 is active.

## Execution status

- ✅ S9A.1 - VPS baseline and host hardening: validated by Fred on 2026-11-23.
- ✅ S9A.2 - Deployment packaging: validated by Fred on 2026-11-23; implementation commit `12ffc21`.
- ✅ S9A.2b - GHCR image publication: validated by Fred on 2026-11-24; GitHub run 45338259559 green for release commit `bfa7dae63139e1e7a91bfb266ad5acc5aeaf55d6`; VPS pulled API by digest, confirmed Node 22.23.5 + revision label, passed PDF preflight, and Compose resolved api/client/ops digest refs.
- ✅ S9A.3 - Reverse proxy and TLS: validated by Fred on 2026-11-25; HTTPS/redirects, SPA reloads, production cookie attributes, CSRF refresh/logout behavior, trusted real client-IP attribution and public exposure checks passed on the Hostinger VPS.
- ⏸️ S9A.4 - Real SMTP and authentication: blocked pending Konny Gmail credentials; temporary Mailpit bridge remains in use.
- ✅ S9A.5 - Persistent storage, ClamAV and PDFs: validated by Fred on 2026-11-25; production bind mounts writable and persistent across API recreation, ClamAV clean/EICAR checks green, PDF/Puppeteer preflight green on the immutable GHCR API digest.
- ✅ S9A.6 - Database migration and bootstrap: validated by Fred on 2026-11-25; 21 migrations applied, bootstrap closed, bootstrap token absent, Fred superadmin and Konny admin active, required production consent definitions published.
- ⏳ S9A.7 - Backup baseline: active task.
- 🔜 S9A.8-S9A.9 remain after the current validation work; S9A.4 must still be completed before beta SMTP acceptance.
- Real customer data remains forbidden during 9A until the production-readiness gates are satisfied.
- Temporary security exception: the API currently receives `SYS_ADMIN` only so in-process Puppeteer can keep Chromium sandboxing enabled during the controlled synthetic-data beta. Before any real customer data, PDF rendering must be isolated and this capability removed from the API.

## Objective

Deploy K'FIT to Konny's Hostinger KVM 2 VPS as the first real remote beta/staging environment, using a production-like topology and operational controls.

This is not final production approval.

## Entry gate

Required before implementation starts:

- Sprint 8 UAT CLOSED.
- FE-ARCH-02 validated.
- FE-ARCH-03 validated.
- FE-ARCH-04 validated.
- Broad FE-ARCH migrations paused at the deployment checkpoint.
- Hostinger VPS administrative access available to Fred.
- Public hostname/domain strategy selected.

## Beta data policy

Phase 1:

- Konny account;
- synthetic/demo customers only;
- no real customer health or personal data.

Real customer beta data may start only after:

- applicable legal/privacy hosting review is minimally completed;
- Hostinger and SMTP provider are documented as processors/providers as applicable;
- encrypted off-server backup destination is configured and restore-tested.

## Target topology

```text
Internet
  ↓ HTTPS
nginx / TLS
  ├─ React client
  └─ K'FIT API
        ├─ PostgreSQL 16 (internal only)
        ├─ ClamAV (internal only)
        ├─ private storage volume
        ├─ privacy journal volume
        └─ SMTP relay (external)
```

Host PostgreSQL must not be publicly exposed.

## Ordered tasks

### S9A.1 - VPS baseline and host hardening

- supported Ubuntu LTS;
- non-root operational user with sudo;
- SSH key authentication;
- disable password/root SSH where appropriate after access is verified;
- firewall: expose only SSH + HTTP/HTTPS;
- time synchronization;
- Docker Engine + Compose plugin;
- persistent application directories;
- basic resource monitoring.

Acceptance:

- Fred can reconnect with SSH key after hardening;
- only intended public ports are reachable;
- Docker/Compose operational.

### S9A.2 - Deployment packaging

Create/finish production-like deployment artifacts:

- `docker-compose.prod.yml` or dedicated beta compose derived from production contract;
- API service using exact patched Node runtime/security floor;
- client build/serving;
- PostgreSQL internal service + persistent volume;
- ClamAV internal service + persistent definitions;
- private-storage bind/volume;
- privacy-journal bind/volume;
- health checks and restart policies;
- no dev tools, Mailpit or test-cleanup routes.

Acceptance:

- complete stack can start from documented environment + Compose;
- PostgreSQL is not published to host/Internet;
- API production guards pass.

### S9A.2b - GHCR image publication

Move application image builds off the VPS:

- make the existing CI reusable by the publication workflow;
- build `api`, `client` and `ops` on GitHub Actions for linux/amd64;
- verify the exact loaded images before registry login/push;
- run the real API PDF preflight before publication;
- publish only immutable `sha-<commit>` tags to GHCR;
- capture registry digests in one release manifest;
- let Compose consume `KFIT_API_IMAGE`, `KFIT_CLIENT_IMAGE` and `KFIT_OPS_IMAGE`;
- keep deployment explicit on the VPS: pull selected digest refs, then start; no SSH/auto-deploy from GitHub.

Acceptance:

- reusable CI is green inside the publication workflow;
- api/client/ops publish jobs are green;
- the release manifest contains exactly the three digest refs for the release commit;
- Fred pulls and inspects at least the API image by digest;
- API reports Node 22.23.5, revision label matches the release commit and PDF preflight passes;
- Compose config is green with the manifest digest refs.

### S9A.3 - Reverse proxy and TLS

- nginx reverse proxy;
- client SPA fallback;
- API/auth/public route proxying;
- secure cookies/proxy trust preserved;
- TLS certificate automation;
- HTTP -> HTTPS redirect;
- request/body limits compatible with K'FIT document/photo rules.

Acceptance:

- public HTTPS URL works;
- nested admin/public route reloads work;
- auth cookies retain Secure/HttpOnly/SameSite behavior;
- `/health` reachable through intended operational path.

### S9A.4 - Real SMTP and authentication

- configure real SMTP;
- validate startup SMTP check;
- unknown-device login OTP;
- password recovery OTP;
- sensitive-action OTP;
- notification email delivery.

Acceptance:

- real mailbox receives each required OTP/email type;
- failed SMTP behavior is observable;
- no Mailpit dependency in beta.

### S9A.5 - Persistent storage, ClamAV and PDFs

- configure `PRIVATE_STORAGE_ROOT`;
- configure `KFIT_PRIVACY_JOURNAL_DIR`;
- ClamAV reachable from API;
- Puppeteer/PDF runtime dependencies present;
- validate upload scan, secure storage and generated PDF.

Acceptance:

- clean upload accepted;
- malware test file rejected;
- private files survive stack restart;
- privacy journal survives restart;
- PDF generation works on VPS.

### S9A.6 - Database migration and bootstrap

- create empty `kfit_prod`/beta database;
- apply migrations through documented deployment path;
- bootstrap first account with temporary `KFIT_BOOTSTRAP_TOKEN`;
- remove bootstrap token after account creation;
- assign Konny role/account intentionally;
- publish non-demo consent definitions required for onboarding.

Acceptance:

- clean DB bootstraps without manual DB edits;
- Konny can authenticate from a new device;
- production guards no longer report demo consent/bootstrap issues.

### S9A.7 - Backup baseline

Before Konny beta:

- production backup key;
- encrypted primary backup;
- encrypted secondary copy separate from live app/private-storage paths;
- scheduled host timer;
- restore drill into isolated database.

For Phase 1 synthetic beta, secondary copy may still be on the VPS only as an interim control, explicitly marked non-production.

Acceptance:

- scheduled backup runs;
- backup artifact encrypted;
- restore drill succeeds;
- supervision/ops evidence available.

### S9A.8 - Deployment preflight

Run the deployment gate:

- security floor;
- typecheck/build from release commit;
- production startup guards;
- DB connectivity;
- SMTP;
- ClamAV;
- auth new-device flow;
- private files;
- PDF;
- scheduled jobs;
- backup/restore;
- privacy journal;
- nested SPA routes;
- request IDs/logging;
- no dev endpoints.

Acceptance:

- no P0/P1 deployment blocker.

### S9A.9 - Konny hosted beta acceptance

Konny performs hands-on acceptance from her own device:

- login + trusted device;
- catalogue management;
- request intake;
- qualification/customer conversion;
- onboarding/questionnaires/consents;
- subscription operations;
- appointments/follow-ups/progress;
- finance/documents;
- notifications/dashboard/supervision;
- completion/renewal;
- mobile usability where applicable.

Fred records findings one at a time; P0/P1 blocks beta progression.

Exit:

- Konny accepts hosted functional beta;
- known P2/P3 items triaged;
- deployment runbook reflects reality.

## Sprint 9B - production readiness (not part of 9A implementation)

Before real-customer production:

- encrypted off-server backup destination;
- restore drill from off-server copy;
- legal/privacy review for Gabon and selected hosting/SMTP providers;
- processor/provider register completed;
- final retention/log rotation decisions;
- operator training;
- production release decision.

## Explicit non-goals

Sprint 9A does not:

- resume broad FE-ARCH migrations;
- add unrelated V1.1 product features;
- redesign business flows;
- authorize real customer data before the listed privacy/backup gates.

## Current next action

S9A.6 is validated. S9A.4 remains blocked pending Konny Gmail credentials. Proceed with S9A.7: validate encrypted production backup creation, secondary-copy strategy and isolated restore drill before hosted beta acceptance.
