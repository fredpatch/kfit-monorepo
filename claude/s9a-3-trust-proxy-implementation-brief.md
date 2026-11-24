# S9A.3 - Trusted reverse-proxy source correction

Status: implementation brief. Do not mark S9A.3 validated from static inspection or CI alone.

## Context

S9A.3 uses host-level nginx on the Hostinger VPS:

- public nginx owns ports 80/443;
- Compose publishes API only on `127.0.0.1:13000`;
- Compose publishes client only on `127.0.0.1:18080`;
- PostgreSQL and ClamAV remain unexposed;
- nginx forwards `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`.

The current production runtime trusts only Express `"loopback"`.

That assumption is not sufficient for Docker-published loopback ports on Linux: host traffic reaching a container through Docker port publishing may arrive from the Docker bridge gateway rather than from `127.0.0.1`. If Express does not trust that hop, `req.ip` collapses to the gateway address for all visitors, which breaks per-IP rate limiting and audit IP attribution.

The nginx route collision for `/admin/supervision` and the runbook formatting failures were already fixed in commit `d41cc813`. Do not redo them.

## Reusable mechanism

Reuse the existing security principle:

> Trust only the reverse-proxy hop that is structurally able to reach the API.

Do not use broad values such as:

- `true`;
- hop-count trust;
- whole RFC1918 ranges;
- the entire Docker subnet unless technically unavoidable;
- arbitrary `X-Forwarded-For` trust.

Keep the public API port bound to host loopback only.

## Gate 0 - measure on the real VPS before implementation

Fred must run on the Hostinger VPS:

```bash
docker run --rm -d --name ipcheck -p 127.0.0.1:13999:80 nginx:alpine
curl -s 127.0.0.1:13999 >/dev/null
docker logs ipcheck | tail -1
docker rm -f ipcheck

docker network ls
docker network inspect bridge
```

Record the source IP seen by the container.

If the nginx container log shows `127.0.0.1`, stop: the blocker hypothesis is false on this VPS and no trust expansion is allowed.

If it shows a Docker gateway address such as `172.x.x.1`, continue with the fixed-network design below.

Do not guess the gateway.

## Required design if Gate 0 confirms Docker gateway source

### 1. Fixed edge network

Give `kfit_edge` an explicit non-conflicting subnet and gateway in `docker-compose.prod.yml`.

Before choosing it, inspect existing Docker networks on the VPS and avoid overlap.

Example shape only:

```yaml
kfit_edge:
  driver: bridge
  ipam:
    config:
      - subnet: 172.30.0.0/24
        gateway: 172.30.0.1
```

Do not blindly use the example subnet if it overlaps the VPS.

### 2. Synchronize runtime trust with topology

The runtime must trust exactly:

- loopback;
- the one configured `kfit_edge` gateway address used by host-to-container Docker port forwarding.

Prefer one explicit configuration source that keeps Compose and runtime synchronized.

Acceptable approaches:

A. A dedicated production env value injected by Compose, for example `KFIT_TRUSTED_PROXY_IP`, with strict IP validation in runtime; or
B. another equally explicit single-source mechanism.

Do not duplicate a gateway literal independently in several files if avoidable.

The value is topology configuration, not a secret.

### 3. Express trust function

Production must use a narrow trust function/list that accepts:

- loopback;
- exactly the configured gateway IP.

Development/test behavior must remain unchanged.

Invalid or missing production proxy configuration must fail safely rather than broadening trust.

### 4. Preserve public exposure contract

Keep:

- API host publish: `127.0.0.1:13000:3000`;
- client host publish: `127.0.0.1:18080:80`;
- PostgreSQL: no host port;
- ClamAV: no host port.

Do not move nginx into Docker as part of this correction.

## Tests

Add focused tests for production proxy semantics.

At minimum prove:

1. loopback remains trusted;
2. configured Docker gateway is trusted;
3. an arbitrary private address is not trusted;
4. an arbitrary public address is not trusted;
5. malformed configured gateway is rejected/fails startup safely;
6. when a trusted proxy supplies `X-Forwarded-For: <client>, <untrusted-spoof>`, Express resolves the intended client according to the actual one-proxy topology and does not blindly trust user-controlled extra hops.

Where practical, add an Express-level regression test that sends a request through the configured trust chain and asserts `req.ip` / audit context.

Do not weaken existing auth, rate-limit, or production guard tests.

## Documentation

Update:

- `docs/runbooks/demarrage-production.md`;
- `exploration-cache/project/decisions.md` if the topology/security decision is durable;
- `exploration-cache/technical/gotchas.md` with the Docker loopback-port source-IP behavior.

Document:

- why host nginx still uses loopback-bound published ports;
- why Docker gateway trust is required;
- exact trust boundary;
- how to inspect the configured edge gateway on the VPS;
- that widening the trusted range is forbidden without a new security review.

Do not update `changelog.md` until Fred validates on the VPS.

## Static validation

Run from the IDE/local project environment:

```bash
npm run format:check
npm run lint:dashes
npm run docs:check
npm run typecheck
git diff --check
```

Run the focused server tests covering trust-proxy behavior.

Do not claim Docker/VPS validation from local checks.

## VPS validation after implementation

Fred will:

1. pull the committed change;
2. validate Compose config;
3. recreate only what is necessary;
4. inspect the real `kfit_edge` subnet/gateway;
5. send an HTTP request through host nginx from an external client;
6. confirm the API/audit layer sees the external client IP rather than the Docker gateway;
7. confirm two different external clients are distinguishable where practical;
8. confirm API/client remain loopback-only and DB/ClamAV remain unexposed.

S9A.3 trust-proxy work is validated only after Fred confirms those checks.

## Out of scope

Do not:

- implement SMTP;
- run migrations;
- bootstrap the production account;
- add HSTS before HTTPS is validated;
- change the beta-only Puppeteer `SYS_ADMIN` decision;
- widen trusted proxy ranges for convenience;
- change business rate-limit thresholds.

## Expected implementation report

Return:

- Gate 0 evidence supplied/used;
- chosen subnet and why it does not overlap;
- exact trust mechanism;
- files changed;
- focused tests added and results;
- static checks results;
- commit SHA;
- docs impact;
- exact VPS commands Fred should run next;
- anything still unvalidated.
