# syntax=docker/dockerfile:1
#
# S9A.2: K'FIT API production image. Build context = repository root:
#   docker compose -f docker-compose.prod.yml build api
#
# Stages:
#   deps       full workspace install (dev tooling + Puppeteer's Chrome in /opt/puppeteer)
#   build      compiles @kfit/shared and @kfit/server
#   prod-deps  deps pruned to production dependencies
#   runtime    API image (default target): production deps, compiled output, scripts, Chrome, non-root user
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

# Puppeteer's Chrome, readable and executable by the non-root runtime user.
COPY --from=deps /opt/puppeteer /opt/puppeteer
RUN chmod -R a+rX /opt/puppeteer \
  # Writable locations for the runtime user, nothing else under /app: PDF preflight scratch
  # (scripts/preflight/pdf.mjs writes to packages/tmp/preflight-pdf) and the bind-mount targets.
  && mkdir -p /app/packages/tmp /srv/kfit/private /srv/kfit/privacy-journal \
  && chown node:node /app/packages/tmp /srv/kfit/private /srv/kfit/privacy-journal

# Official node image user (uid/gid 1000). Chrome keeps its default sandbox: no --no-sandbox, no privileged mode.
USER node
WORKDIR /app/packages/server
EXPOSE 3000

# Same entrypoint as `npm run start:prod --workspace @kfit/server`, started without npm so signals reach Node directly.
CMD ["node", "scripts/prod/api-server.mjs"]

# ---------- ops ----------
# One-off tooling (e.g. `npm run db:migrate --workspace @kfit/server`). Never started by `docker compose up`.
FROM build AS ops
ENV NODE_ENV=production
USER node
WORKDIR /app/packages/server
CMD ["node", "-e", "console.log(\"K'FIT ops image: run an explicit command, e.g. npm run db:migrate --workspace @kfit/server\")"]
