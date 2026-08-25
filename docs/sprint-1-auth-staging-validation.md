# Sprint 1 — Staging-style auth validation

This validation proves the cookie-based auth transport behavior through a local Nginx edge path before Sprint 1 closes.

## Scope

Validated through `docker-compose.staging.yml` and `ops/nginx/staging-auth.conf`:

- `/health` proxies through Nginx.
- `/auth/*` proxies through Nginx.
- Access and refresh cookies keep `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`.
- CSRF cookie stays readable by the client and keeps `Secure`, `SameSite=Lax` and `Path=/`.
- Mutating auth routes reject missing `x-csrf-token`.
- Mutating auth routes accept the double-submit CSRF token.
- Session restore works through the proxied path.

## Local validation commands

Run from the repo root in Git Bash.

Terminal 1:

```bash
npm run build --workspace @kfit/shared
npm run build --workspace @kfit/server
npm run dev:auth-staging-smoke --workspace @kfit/server
```

Terminal 2:

```bash
docker compose -f docker-compose.staging.yml up -d auth_proxy
npm run preflight:auth-staging
docker compose -f docker-compose.staging.yml down auth_proxy
```

Optional browser check with the client:

Terminal 3:

```bash
npm run dev --workspace @kfit/client -- --host 127.0.0.1 --port 5173
```

Then open:

```text
http://127.0.0.1:8080
```

## Notes

- The smoke server uses validated Express auth wiring but fake in-memory auth services; this slice validates transport and proxy behavior, not real database persistence.
- Real staging/prod deployment will later replace the smoke server with the real application container.
