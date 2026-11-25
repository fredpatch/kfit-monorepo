# syntax=docker/dockerfile:1
#
# S9A.2 / S9B: K'FIT server-side production images. Build context = repository root:
#   docker compose -f docker-compose.prod.yml build api renderer
#
# Stages:
#   deps       full workspace install (dev tooling + Puppeteer's Chrome in /opt/puppeteer)
#   build      compiles @kfit/shared and @kfit/server
#   prod-deps  deps pruned to production dependencies
#   runtime    API image (default target): production deps, compiled output, scripts, non-root user, no browser
#   renderer   internal HTML -> PDF service (S9B): only dist/pdf-renderer, Puppeteer's Chrome and its libraries
#   ops        tooling image (drizzle-kit, sources, migrations) for explicit one-off commands only
#
# No env file, secret or build arg carrying a secret is used: the environment comes from compose at run time.

# ---------- deps ----------
FROM node:22.23.5-bookworm-slim AS deps
WORKDIR /app
# Puppeteer installs its Chrome here (postinstall) and reads the same variable at run time.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
RUN npm ci && npm cache clean --force

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build --workspace @kfit/shared && npm run build --workspace @kfit/server

# ---------- prod-deps ----------
FROM deps AS prod-deps
# Removes dev tooling (typescript, drizzle-kit, vite...). The workspace folders are created so the COPY below never misses.
RUN npm prune --omit=dev \
  && mkdir -p packages/shared/node_modules packages/server/node_modules \
  && npm cache clean --force

# ---------- runtime ----------
FROM node:22.23.5-bookworm-slim AS runtime

# S9B: no browser here. PDFs are rendered by the renderer image over kfit_backend (PDF_RENDERER_URL); the API keeps no
# Chrome, no Chrome libraries or fonts, and needs no extra capability.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# KFIT_OPS_PREBUILT: dist is compiled above and read-only here, so scripts/ops/run.mjs runs it without recompiling.
ENV NODE_ENV=production \
    KFIT_OPS_PREBUILT=true \
    KFIT_API_HOST=0.0.0.0 \
    KFIT_API_PORT=3000

WORKDIR /app

# Application files stay owned by root: the runtime user can read them, not modify them.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY packages/server/scripts ./packages/server/scripts

# S9B: the Chromium launcher and the renderer server belong to the renderer image only; without them the API cannot
# start a browser even by mistake (the development-only local adapter fails to load). Bind-mount targets for `node`.
RUN rm -f /app/packages/server/dist/pdf-renderer/html-to-pdf.* /app/packages/server/dist/pdf-renderer/server.* \
    /app/packages/server/scripts/prod/pdf-renderer-server.mjs /app/packages/server/scripts/preflight/pdf.mjs \
  && mkdir -p /srv/kfit/private /srv/kfit/privacy-journal \
  && chown node:node /srv/kfit/private /srv/kfit/privacy-journal

# Official node image user (uid/gid 1000).
USER node
WORKDIR /app/packages/server
EXPOSE 3000

# Same entrypoint as `npm run start:prod --workspace @kfit/server`, started without npm so signals reach Node directly.
CMD ["node", "scripts/prod/api-server.mjs"]

# ---------- renderer ----------
# S9B: internal PDF renderer. No database, storage, SMTP or API code: only the self-contained dist/pdf-renderer module,
# the production node_modules (for Puppeteer) and Puppeteer's Chrome. Chrome keeps its default sandbox: no --no-sandbox,
# no privileged mode; Compose grants this service alone SYS_ADMIN for that sandbox.
FROM node:22.23.5-bookworm-slim AS renderer

# Shared libraries and fonts required by Puppeteer's Chrome (headless PDF rendering) on Debian bookworm.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    KFIT_RENDERER_HOST=0.0.0.0 \
    KFIT_RENDERER_PORT=3100

WORKDIR /app

COPY packages/server/package.json packages/server/package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/server/dist/pdf-renderer ./packages/server/dist/pdf-renderer
COPY packages/server/scripts/prod/pdf-renderer-server.mjs ./packages/server/scripts/prod/pdf-renderer-server.mjs
COPY packages/server/scripts/preflight/pdf.mjs ./packages/server/scripts/preflight/pdf.mjs

# Puppeteer's Chrome, readable and executable by the non-root runtime user. Compiled tests are not shipped.
COPY --from=deps /opt/puppeteer /opt/puppeteer
RUN chmod -R a+rX /opt/puppeteer \
  && rm -f /app/packages/server/dist/pdf-renderer/*.test.*

USER node
WORKDIR /app/packages/server
EXPOSE 3100
CMD ["node", "scripts/prod/pdf-renderer-server.mjs"]

# ---------- ops ----------
# One-off tooling (e.g. `npm run db:migrate --workspace @kfit/server`). Never started by `docker compose up`.
FROM build AS ops
# S9A.7: native backup/restore (BACKUP_PG_MODE=native) runs pg_dump/pg_restore here, over kfit_backend. The client major
# must be >= the server's (postgres:16 in docker-compose.prod.yml, PG_CLIENT_TOO_OLD otherwise); bookworm only ships 15,
# so the client comes from the PostgreSQL (PGDG) repository, signed by the key shipped in Debian's postgresql-common.
# No Docker CLI: the ops container never controls the host's Docker.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates postgresql-common \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
# dist was compiled in the build stage and stays root-owned: ops commands (scripts/ops/run.mjs) use it as is.
ENV NODE_ENV=production \
    KFIT_OPS_PREBUILT=true \
    PATH=/usr/lib/postgresql/16/bin:$PATH
USER node
WORKDIR /app/packages/server
CMD ["node", "-e", "console.log(\"K'FIT ops image: run an explicit command, e.g. npm run db:migrate --workspace @kfit/server\")"]
