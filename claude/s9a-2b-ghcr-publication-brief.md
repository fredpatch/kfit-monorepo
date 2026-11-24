# S9A.2b — Publication d’images Docker vers GHCR

Status: implementation brief. Do not mark validated until Fred confirms the GitHub workflow and a pulled image run successfully.

## Goal

Move production-image builds away from the Hostinger VPS. GitHub Actions must validate, build, verify and publish immutable K'FIT images to GHCR. Deployment remains an explicit VPS action; GitHub must not SSH into or auto-deploy the server in this slice.

Reference pattern reviewed: `ai-invoice-manager/deploy/homelab` and `.github/workflows/publish-images.yml`. Reuse mechanisms, not app-specific names or assumptions.

## Locked decisions

1. Publish only K'FIT-owned images:

   - `api` from `packages/server/Dockerfile`, target `runtime`;
   - `client` from `packages/client/Dockerfile`, target `runtime`;
   - `ops` from `packages/server/Dockerfile`, target `ops`.
2. Do not publish PostgreSQL or ClamAV; keep the trusted upstream images already referenced by Compose.
3. Registry: GitHub Container Registry (GHCR).
4. Image namespace:
   - `ghcr.io/${github.repository}/api`
   - `ghcr.io/${github.repository}/client`
   - `ghcr.io/${github.repository}/ops`
5. Release tags are immutable commit tags only: `sha-${GITHUB_SHA}`.
6. Deployment must ultimately consume registry digest references (`@sha256:...`), not `latest`.
7. Publishing happens only after the full K'FIT CI workflow succeeds.
8. Main push is the approval boundary. Pull requests never publish.
9. `workflow_dispatch` may republish/verify a main commit, but must still run CI first.
10. GitHub publishes images only. No SSH, no VPS credentials, no automatic `docker compose up`.
11. Build platform for the Hostinger KVM is `linux/amd64`.
12. Preserve all S9A.2 runtime rules: Node 22.23.5 in production images, API non-root, Chromium sandbox enabled, no `--no-sandbox`, no privileged mode, temporary runtime `SYS_ADMIN` remains a Compose concern only.
13. Client build-time public values are optional GitHub repository variables, never secrets:

    - `vars.KFIT_PUBLIC_WHATSAPP`
    - `vars.KFIT_PUBLIC_INSTAGRAM`

    Missing values build as empty strings, matching current behavior.

## CI trigger adaptation

Modify `.github/workflows/ci.yml` so it can be called by the publication workflow.

Required behavior:

- add `workflow_call`;
- keep pull-request validation;
- keep manual `workflow_dispatch`;
- preserve push CI on `sprint-*` branches;
- main must be validated through `publish-images.yml` calling the reusable CI, avoiding duplicate full CI runs on the same main push.

Do not weaken or remove any existing validation step.

## Publication workflow

Create `.github/workflows/publish-images.yml`.

Behavior:

- triggers on push to `main` and `workflow_dispatch`;
- minimal default permissions: `contents: read`;
- first job calls local reusable CI;
- publication job needs CI;
- publish only when repository is exactly `fredpatch/kfit-monorepo` and ref is `refs/heads/main`;
- matrix: api, client, ops;
- use Docker Buildx;
- use GHA build cache scoped per image;
- build once with `load: true`, `push: false`;
- attach OCI revision label `org.opencontainers.image.revision=${github.sha}`;
- verify the exact loaded image before registry login/push;
- login to `ghcr.io` with `GITHUB_TOKEN` and job-scoped `packages: write`;
- push exactly `:sha-${GITHUB_SHA}`;
- record the registry digest after push;
- upload one small manifest part per image;
- final manifest job merges the three records into one `release-manifest.json`;
- retain the release manifest long enough for deployment/rollback evidence (target 400 days if supported).

Pin third-party GitHub Actions by full commit SHA, following the reviewed invoice-manager supply-chain pattern.

## Exact image build mapping

### api

- Dockerfile: `packages/server/Dockerfile`
- target: `runtime`
- no build secrets.

### ops

- Dockerfile: `packages/server/Dockerfile`
- target: `ops`
- no build secrets.

### client

- Dockerfile: `packages/client/Dockerfile`
- target: `runtime`
- optional build args:

  - `VITE_PUBLIC_WHATSAPP=${{ vars.KFIT_PUBLIC_WHATSAPP || '' }}`
  - `VITE_PUBLIC_INSTAGRAM=${{ vars.KFIT_PUBLIC_INSTAGRAM || '' }}`
- do not pass secrets into Docker build args.

## Image verification before push

Add `ops/ci/verify-image.sh` or equivalent.

It must run against the exact locally loaded image with network disabled where practical and fail closed.

### Common

- reject env files, private keys and obvious test files baked into runtime images where applicable;
- verify OCI revision label separately in the workflow equals `GITHUB_SHA`.

### api
- image user is `node`;
- `node --version` is exactly `v22.23.5`;
- production entry script and compiled server/shared output exist;
- Chrome exists under `/opt/puppeteer`;
- no source migrations/dev-only dependency tree is required for runtime;
- execute the real PDF preflight before publish using `--init --shm-size=256m --cap-add=SYS_ADMIN`; this is build verification only and must not alter the image.

### client
- nginx configuration validates with `nginx -t`;
- `index.html` exists;
- at least one built JS asset exists;
- no server source or env file is baked into the image.

### ops
- image user is `node`;
- `node --version` is exactly `v22.23.5`;
- Drizzle/source/migrations required for explicit migration commands exist;
- API runtime is not started by default.

Do not introduce a new security policy into S9A.2b merely to make verification stricter; verify the S9A.2 contract as implemented.

## Release manifest

Add a small deterministic script such as `ops/ci/release-manifest.mjs`.

Input: per-image JSON parts produced by the publish matrix.

Output example:

```json
{
  "repository": "fredpatch/kfit-monorepo",
  "commit": "<40-char SHA>",
  "workflow_run": "<GitHub Actions run URL>",
  "created": "<ISO timestamp>",
  "images": {
    "api": {
      "ref": "ghcr.io/fredpatch/kfit-monorepo/api@sha256:...",
      "tag": "ghcr.io/fredpatch/kfit-monorepo/api:sha-..."
    },
    "client": {
      "ref": "ghcr.io/fredpatch/kfit-monorepo/client@sha256:...",
      "tag": "ghcr.io/fredpatch/kfit-monorepo/client:sha-..."
    },
    "ops": {
      "ref": "ghcr.io/fredpatch/kfit-monorepo/ops@sha256:...",
      "tag": "ghcr.io/fredpatch/kfit-monorepo/ops:sha-..."
    }
  },
  "compose_env": {
    "KFIT_API_IMAGE": "<api digest ref>",
    "KFIT_CLIENT_IMAGE": "<client digest ref>",
    "KFIT_OPS_IMAGE": "<ops digest ref>"
  }
}
```

The assembler must reject:

- missing/extra image kinds;
- refs outside this repository namespace;
- malformed digest;
- tag not matching the current commit.

## Compose adaptation

Update `docker-compose.prod.yml` so K'FIT can consume published images without losing local build capability.

For `api`, `client`, and `ops`:

- add an `image:` field driven by:
  - `KFIT_API_IMAGE`
  - `KFIT_CLIENT_IMAGE`
  - `KFIT_OPS_IMAGE`
- retain existing `build:` definitions for local explicit builds and review;
- default image names may remain local review tags when variables are absent;
- do not change PostgreSQL/ClamAV topology;
- do not add host ports;
- do not change runtime capabilities/networking in this task.

Deployment documentation must make the distinction explicit:

- local review: `docker compose build ...`;
- VPS release: set image variables to digest refs from the release manifest, run explicit `docker compose pull`, then `docker compose up -d`;
- never build application images on the VPS in the normal deployment path.

## Documentation/state

Update:

- `docs/runbooks/demarrage-production.md`;
- `exploration-cache/tasks/sprint-9a.md`;
- `TASKS.md` only as needed to show S9A.2b current while implementation is unvalidated.

Do not add S9A.2b to `changelog.md` until Fred validates it.

## Required non-Docker checks by implementation agent

Run:

- `npm run format:check`
- `npm run lint:dashes`
- `git diff --check`

Static review:

- no secrets in workflow/build args;
- no auto-deploy/VPS SSH;
- no mutable-only `latest` deployment contract;
- all three image kinds present exactly once.

Do not claim Docker/GHCR validation from an environment that did not actually run GitHub Actions.

## Fred validation gate

After implementation is pushed:

1. GitHub publication workflow must show reusable CI green.
2. api/client/ops publication jobs green.
3. release manifest artifact exists for the exact commit.
4. Manifest contains all three digest refs and exact commit.
5. Fred pulls at least the API image by immutable ref on a Docker host.
6. Verify:
   - API image Node = v22.23.5;
   - image revision label = release commit;
   - PDF preflight passes using the same beta-only SYS_ADMIN runtime capability.
7. Compose with manifest digest refs passes `docker compose config --quiet`.

Only then mark S9A.2b validated and return S9A.3 to active.

## Out of scope

- automatic server deployment;
- SSH keys/tokens in GitHub;
- nginx/TLS implementation (S9A.3);
- SMTP (S9A.4);
- migration execution (S9A.6);
- backup automation (S9A.7);
- full release discovery/rollback CLI like ai-invoice-manager;
- publishing PostgreSQL or ClamAV images.
