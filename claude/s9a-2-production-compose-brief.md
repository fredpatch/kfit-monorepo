# S9A.2 - Production-like Docker Compose packaging

Role: bounded deployment packaging implementer.

Base: current `main` after validated FE-ARCH-04 and S9A.1 host baseline.

## Context

Sprint 9A targets Konny's Hostinger KVM 2 VPS as the first hosted beta/staging environment.

Validated host state:

- Ubuntu 26.04.1 LTS;
- 2 vCPU / 7.7 GiB RAM / ~95 GiB free;
- 2 GiB persistent swap;
- UFW permits only 22/80/443 inbound;
- SSH key-only via `kfitadmin`, root/password SSH disabled;
- Docker Engine 29.10.0 + Compose 5.8.0 operational;
- persistent host directories under `/srv/kfit`.

Existing production code already provides:

- `npm run start:prod`;
- production startup guards;
- PostgreSQL/SMTP/ClamAV startup checks;
- production cookie/trust-proxy mode;
- privacy + notification jobs;
- backup/restore tooling.

Current deployment gap:

- `docker-compose.prod.yml` contains PostgreSQL only;
- no server Dockerfile;
- no client Dockerfile;
- no production-like API/client/ClamAV packaging.

S9A.3 will add the external nginx/TLS edge. Do not implement TLS or public nginx in this slice.

## Goal

Create a production-like Docker stack that packages:

```text
client (static SPA, internal only)
api (Node production runtime, internal only)
postgres (internal only)
clamav (internal only)
```

with persistent storage, health checks, restart policies and no development services.

No VPS deployment in S9A.2.

## Locked decisions

### Runtime versions

- API Node base must be exactly `node:22.23.4-bookworm-slim`, matching `.nvmrc`.
- Do not use floating Node major/minor tags.
- ClamAV must use an exact stable version tag, not `stable` or `latest`.
- Current approved ClamAV target for this slice: `clamav/clamav:1.5.5`.
- Static client runtime may use a pinned nginx version already compatible with the project; prefer `nginx:1.27-alpine` unless repository constraints require a newer already-approved exact tag.

### API bind

Inside Docker the API must bind:

```text
KFIT_API_HOST=0.0.0.0
KFIT_API_PORT=3000
```

The API port is exposed to Docker networks only. Never publish 3000 on the host.

### Networks

Create two networks:

```text
kfit_backend  (internal: true)
kfit_edge     (normal bridge)
```

Membership:

- postgres: backend only;
- clamav: backend only;
- api: backend + edge;
- client: edge only.

This lets API reach PostgreSQL/ClamAV internally and retain outbound SMTP access through the non-internal edge network, while DB/ClamAV remain isolated.

No host `ports:` entries in S9A.2.

S9A.3 will attach the public reverse proxy to `kfit_edge`.

### Persistence

Use:

- named volume for PostgreSQL data;
- named volume for ClamAV definitions;
- bind mounts for K'FIT private data:
  - host `/srv/kfit/private` → container `/srv/kfit/private`;
  - host `/srv/kfit/privacy-journal` → container `/srv/kfit/privacy-journal`.

Production env must therefore use those absolute container paths.

Do not bind backup directories into the API service in this slice. Backup tooling is handled separately in S9A.7.

### Secrets/environment

Never commit real secrets.

Compose must support an environment file supplied by deployment, with a local default that preserves repo usability. Prefer:

```text
KFIT_ENV_FILE=.env.prod
```

as the default and allow the VPS command to override with:

```text
KFIT_ENV_FILE=/srv/kfit/config/.env.prod
```

or use `docker compose --env-file` for interpolation if that is cleaner.

The API receives production runtime variables via `env_file`.

Do not expose secrets through build args.

### Client build

The browser uses same-origin API routing in hosted beta.

- `VITE_API_BASE_URL` must be empty in the production client build.
- `VITE_PUBLIC_WHATSAPP` may be a non-secret build arg if required by the existing landing page.
- Do not embed server secrets in the client image.

### Puppeteer / Chromium invariant

Production API runtime generates PDFs through Puppeteer.

The API image must preserve a working Chromium/Chrome runtime and required Linux libraries.

Requirements:

- `npm run preflight:pdf` must be runnable successfully inside the built API image;
- do not silently set `PUPPETEER_SKIP_DOWNLOAD` in the production image;
- if Puppeteer's browser cache is installed during build, copy/preserve it into the runtime stage with permissions usable by the non-root runtime user;
- include required Debian libraries/fonts;
- run the API as a non-root user;
- use Compose `init: true` for proper Chromium child-process reaping;
- do not add privileged mode;
- do not add `--no-sandbox` to application code in this slice.

If the chosen container implementation cannot run existing `puppeteer.launch({ headless: true })` safely as non-root, stop and report rather than weakening sandboxing.

### Production dependencies and migrations

Use a multi-stage server Dockerfile.

Preferred stages:

1. dependencies/build stage with full workspace dependencies;
2. runtime stage with only production dependencies + compiled artifacts + required scripts/assets/browser runtime;
3. optional `ops`/migration target or compose profile that retains tooling required by `npm run db:migrate`.

Do not require `drizzle-kit` in the normal API runtime if it can be kept in an ops-only target.

A migration/ops service must never run automatically on every API restart.

S9A.6 will execute migrations explicitly.

## Files expected

Likely additions/changes:

```text
packages/server/Dockerfile
packages/client/Dockerfile
ops/nginx/client.conf
.dockerignore
docker-compose.prod.yml
.env.prod.example
docs/runbooks/demarrage-production.md
docs/maintenance/manuel-maintenance.md
```

Small additional deployment-only files are allowed when necessary.

Do not modify business code unless a packaging defect proves unavoidable. Report before broadening scope.

## Server image requirements

The API image must:

- use exact Node 22.23.4 base;
- build `@kfit/shared` and `@kfit/server`;
- run `npm run start:prod --workspace @kfit/server` or equivalent existing production entrypoint;
- set `NODE_ENV=production`;
- run as non-root;
- include Puppeteer browser/runtime requirements;
- have `init: true` in Compose;
- expose 3000 only as Docker metadata/network exposure;
- provide an API healthcheck against `http://127.0.0.1:3000/health` without adding a public host port.

Do not copy local `.env` files into the image.

## Client image requirements

Use a multi-stage build:

- Node 22.23.4 build stage;
- build `@kfit/shared` as required by client;
- Vite production build;
- pinned nginx static runtime;
- SPA fallback to `index.html`;
- static assets served internally on port 80;
- healthcheck if practical.

Do not implement API reverse proxy rules in the client nginx config. S9A.3 owns the edge proxy.

## Compose services

### postgres

Preserve current PostgreSQL 16 behavior:

- exact/pinned `postgres:16-alpine` line is acceptable if already project-approved;
- env from production env file;
- named persistent volume;
- healthcheck;
- backend network only;
- `expose: 5432`;
- no host port.

### clamav

- exact `clamav/clamav:1.5.5`;
- named definitions volume;
- backend only;
- expose 3310;
- healthcheck appropriate to the official image;
- restart policy.

### api

- build server runtime target;
- `NODE_ENV=production`;
- `KFIT_API_HOST=0.0.0.0`;
- depends on healthy PostgreSQL and ClamAV where Compose semantics allow;
- backend + edge;
- private/journal bind mounts;
- no host port;
- healthcheck;
- `init: true`;
- restart policy.

### client

- build static client;
- edge only;
- no host port;
- expose 80;
- healthcheck;
- restart policy.

### migration/ops

If implemented:

- profile `ops`;
- build from a tooling target;
- backend network;
- explicit command only;
- no restart loop;
- not part of normal `docker compose up -d`.

## Do not add

- Mailpit;
- dev-tools;
- test cleanup routes;
- PostgreSQL host publishing;
- API host publishing;
- public nginx/TLS;
- Certbot;
- backup timer;
- real secrets;
- automatic migrations on API startup;
- Portainer/Dokploy/Kubernetes.

## Production env example

Update `.env.prod.example` only where packaging requires it.

It should document:

```text
KFIT_API_HOST=0.0.0.0
KFIT_API_PORT=3000
PRIVATE_STORAGE_ROOT=/srv/kfit/private
KFIT_PRIVACY_JOURNAL_DIR=/srv/kfit/privacy-journal
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
```

Keep all placeholders non-secret and compatible with production guard placeholder detection.

Do not put beta secrets into the example.

## Documentation

Update the production/maintenance docs to remove the statement that API Compose packaging is unavailable after S9A.2.

Clearly state that:

- stack packaging exists;
- public edge/TLS remains S9A.3;
- deployment has not yet been validated on Hostinger until Fred completes the later gate.

Do not mark Sprint 9A complete.

## Required static proof

Verify:

1. server Dockerfile uses exact Node 22.23.4;
2. client builder uses exact Node 22.23.4;
3. no Dockerfile copies an env/secrets file;
4. API runs non-root;
5. API normal runtime does not require dev tooling when avoidable;
6. Puppeteer browser/runtime is preserved;
7. no privileged mode;
8. no app-code `--no-sandbox` change;
9. PostgreSQL has no host port;
10. ClamAV has no host port;
11. API has no host port;
12. client has no host port;
13. backend network is internal;
14. API is on backend + edge;
15. client edge only;
16. no Mailpit/dev-tools;
17. private/journal paths are bind-mounted and absolute;
18. normal startup does not auto-run migrations.

## Local validation by Fred

Do not run project/Docker commands in remote agent runtime.

Fred will run locally:

```bash
git pull
npm ci
npm run security:check
npm run typecheck
npm run build
npm run db:check
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build api client
git diff --check
```

Then, using a safe local production-like env with non-real secrets and a disposable DB target, Fred may run the packaging smoke separately.

The implementation report must distinguish static/build validation from runtime deployment validation.

## Hostinger validation is later

Do not give VPS deployment commands from the implementation agent.

After this slice is committed and locally validated, Chat will proceed to S9A.3/S9A.4 and eventually deploy on Hostinger.

## Expected report

Return:

1. base commit;
2. files created;
3. files changed;
4. server image design;
5. client image design;
6. compose topology;
7. persistence;
8. env/secrets handling;
9. Puppeteer handling;
10. migration/ops handling;
11. health checks;
12. static proof;
13. local command results;
14. deviations/risks;
15. exact Fred validation commands.

Stop at IMPLEMENTED / awaiting Fred validation.
