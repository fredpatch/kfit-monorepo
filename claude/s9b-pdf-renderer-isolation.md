# S9B — Isolate PDF rendering from the API and remove API SYS_ADMIN

Status: implementation brief. Do not mark validated or update changelog until Fred validates the deployed runtime.

## Context

S9A.9 hosted acceptance remains open in parallel and must not be closed by this task. S9A.4 real SMTP also remains blocked pending Konny Gmail.

This task is the CRITICAL real-customer-data gate recorded in Notion and in `exploration-cache/project/decisions.md` (2026-11-23 temporary SYS_ADMIN decision).

Current production state:

- API renders PDFs in-process with Puppeteer.
- `docker-compose.prod.yml` grants `SYS_ADMIN` to the API only so Chromium can keep its sandbox.
- `--no-sandbox`, privileged mode and `seccomp=unconfined` are forbidden.
- Current PDF call sites:
  - receipts: `PuppeteerReceiptRenderer`
  - quotes: `PuppeteerQuoteRenderer`
  - progress summaries: `PuppeteerProgressSummaryRenderer`
- API owns DB/business authorization and persistence to private storage.
- Renderer must not receive DB access or the global private-storage/privacy-journal mounts.

Consult and preserve the validated **Business Document PDF Generation** pattern:
authoritative data → print model/template → deterministic renderer → PDF → persistence/audit.
Rendering must not mutate business state or recalculate authoritative totals.

## Goal

Move Chromium/Puppeteer execution into a dedicated internal renderer container/service, then remove `SYS_ADMIN` and Chromium runtime dependencies from the API container.

The API must preserve all current receipt, quote and progress-summary behavior and persistence semantics.

## Architecture target

```text
Internet
  -> nginx
     -> API
        -> PostgreSQL / ClamAV / private storage
        -> internal PDF renderer
             -> Chromium/Puppeteer only
             -> no DB
             -> no private-storage mount
             -> no privacy-journal mount
             -> no host/public port
```

Use an internal HTTP renderer service on `kfit_backend`.

Do not expose Chrome DevTools or a generic remote-browser control API.

### Authority boundary

API remains authoritative for:

- authentication/authorization;
- loading receipt/quote/progress data;
- snapshot/view-model construction;
- current HTML/template builders;
- document persistence/private storage;
- audit/business state.

Renderer owns only:

- hardened HTML -> PDF conversion;
- Puppeteer/Chromium lifecycle;
- render-time validation/limits.

The renderer may receive customer-visible/sensitive content already prepared for printing, but it must have no way to query K'FIT data independently.

## Required implementation

### 1. Generic renderer contract

Create a small internal renderer HTTP contract, e.g.:

- `GET /health` -> 200
- `POST /render` -> PDF bytes

Request should carry only what rendering needs:

- HTML
- fixed supported PDF options or a small controlled profile
- optional deterministic render metadata if required

Do not accept:

- URLs to fetch;
- filesystem paths;
- arbitrary Chromium command-line flags;
- executable JavaScript;
- DB/storage identifiers that cause renderer-side lookup.

Apply a bounded JSON/body size and a render timeout.

Renderer must:

- disable page JavaScript;
- block/abort all external/network resource requests;
- render with fixed A4/print-background/preferCSSPageSize behavior unless an existing document requires an explicitly reviewed variation;
- close browser/page resources on success/failure;
- return stable non-sensitive errors;
- have a health endpoint that does not require DB/SMTP/etc.

Prefer the simplest safe implementation. One browser per request is acceptable for this task if it preserves isolation and avoids cross-request state. Do not add a browser pool unless static/runtime evidence shows it is needed.

### 2. Preserve existing domain renderer contracts

Do not rewrite receipt/quote/document business flows.

Refactor the current domain renderers so production delegates HTML -> PDF to an injected/internal renderer client.

Preserve:

- receipt snapshot semantics;
- quote snapshot semantics;
- progress-summary template version;
- receipt/quote deterministic PDF timestamp normalization;
- existing storage/persist/read/remove behavior;
- existing audit/business rules.

If useful, extract the progress-summary HTML builder into a pure function so the API still owns the template/model mapping while Chromium is remote.

Tests that currently inject/mock renderer interfaces should remain simple.

### 3. Production configuration

Add explicit production configuration, with fail-closed validation:

- `PDF_RENDERER_URL` or equivalent internal base URL;
- production must not silently fall back to local Puppeteer;
- development/tests may retain a deliberate local adapter only if that is clearly separated and does not weaken production.

Production API startup should fail with a stable config/readiness error if the renderer configuration is missing/invalid or renderer readiness is required and unavailable.

Avoid adding renderer DB/storage credentials.

### 4. Docker images

Split the Docker runtime so:

**API image**

- no Chromium/Puppeteer browser payload under `/opt/puppeteer`;
- no Chrome shared-library/font installation solely required for rendering;
- runs as non-root `node`;
- no `SYS_ADMIN`;
- no `--no-sandbox`.

**Renderer image**

- dedicated target/image;
- contains only the compiled runtime needed for renderer + Puppeteer/Chromium;
- runs as non-root `node`;
- keeps Chromium sandbox enabled;
- if `SYS_ADMIN` remains necessary, grant it only to this renderer service;
- `init: true` and adequate `shm_size`;
- no DB/private-storage/privacy-journal mounts;
- no public/host port.

Do not use privileged mode or `seccomp=unconfined`.

### 5. Compose topology

Add `renderer` to `docker-compose.prod.yml`:

- `kfit_backend` only;
- internal `expose` only;
- healthcheck;
- API depends on renderer health if appropriate;
- API gets renderer URL via topology-bound environment;
- remove API `cap_add: SYS_ADMIN`, renderer-specific `init`/shm comments and rendering exception from API;
- renderer gets no `env_file` carrying unrelated production secrets unless there is no safer option. Prefer explicit non-secret renderer env only.

Confirm renderer has:

- no DB env;
- no SMTP env;
- no `/srv/kfit/private` mount;
- no privacy journal mount;
- no backup mount.

### 6. CI / publication / immutable release manifest

Publish a fourth K'FIT application image:

- `renderer`

Extend current publication workflow and release manifest so `compose_env` contains exactly:

- `KFIT_API_IMAGE`
- `KFIT_CLIENT_IMAGE`
- `KFIT_OPS_IMAGE`
- `KFIT_RENDERER_IMAGE`

Update image verification:

- API: non-root; no renderer browser payload; no Docker CLI; no unsafe Chromium flags/runtime fallback.
- Renderer: non-root; Chromium/Puppeteer available; real PDF preflight through the renderer path; no Docker CLI.
- Existing API/client/ops verification stays green.

Do not weaken immutable digest publication.

### 7. S9A.7 backup scheduler compatibility

Critical: `ops/systemd/kfit-backup.sh` currently parses `/srv/kfit/config/release.env` and whitelists exactly API/client/ops keys.

Update it and its packaging tests to allow `KFIT_RENDERER_IMAGE` as a non-secret immutable release-manifest key while still:

- rejecting every unknown line/key;
- requiring `KFIT_OPS_IMAGE` to match exact GHCR `ops@sha256:<64 hex>`;
- using only the ops image for backup execution;
- keeping `--pull never`;
- never sourcing arbitrary shell content.

A release.env generated from the new four-image manifest must not break the backup timer.

### 8. Preflight / runtime verification

Adapt the PDF preflight so it proves the actual isolated production rendering path, not an in-process Puppeteer fallback.

Required automated/static evidence:

- receipt renderer path;
- quote renderer path;
- progress-summary renderer path;
- production API cannot instantiate/launch Puppeteer locally;
- API Compose service has no SYS_ADMIN;
- renderer has no host port/DB/private mounts;
- renderer request blocks external resource loading;
- release manifest includes renderer;
- backup launcher accepts four-key release.env but still fails closed on unknown keys.

Preserve existing deterministic receipt/quote tests.

## Deployment/runtime acceptance to prepare for Fred

Do not run VPS/project commands yourself. Return exact commands for Fred only after implementation + CI are green.

Fred's eventual Hostinger validation must prove:

1. pull renderer by immutable digest;
2. Compose resolves all four release images;
3. renderer healthy on internal network only;
4. API healthy with **no SYS_ADMIN**;
5. API container has no Chromium browser payload;
6. renderer has no DB/private/journal/backup mount and no host-published port;
7. real receipt PDF generation works;
8. real quote PDF generation works;
9. real progress-summary PDF generation works;
10. renderer rejects/blocks external resource fetch;
11. existing backup systemd service still succeeds using four-key `release.env`;
12. restore drill still succeeds;
13. no regression to nginx/auth/ClamAV/private storage.

Only after Fred confirms those may this real-data gate be called validated.

## Tests/checks expected before push

Run the repository's relevant existing checks, including at minimum:

- formatting/docs/dash lint;
- shared/server typecheck;
- server unit tests;
- new renderer/packaging/static tests;
- Docker Compose config validation;
- image verification tests that can run in CI.

Do not mark `changelog.md` as validated from static/CI evidence.

## Scope limits

Do not:

- change receipt/quote/progress business rules;
- change finance calculations;
- redesign PDF appearance except unavoidable renderer-equivalence fixes;
- expose renderer publicly;
- add direct DB/storage access to renderer;
- add `--no-sandbox`, privileged, or `seccomp=unconfined`;
- start unrelated Sprint 10/V1.1 work;
- close S9A.9 or S9A.4.

## Report back

Return:

1. architecture implemented;
2. exact files changed;
3. renderer/API trust boundary;
4. tests/checks and results;
5. release/publication changes;
6. backup-scheduler compatibility evidence;
7. any deviation from this brief;
8. commit SHA;
9. whether pushed or not;
10. remaining Fred runtime validation commands/gates.

Stop and report instead of inventing a workaround if removing API SYS_ADMIN would require weakening Chromium sandboxing or business/document invariants.
