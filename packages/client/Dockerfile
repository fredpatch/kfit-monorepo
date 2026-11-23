# syntax=docker/dockerfile:1
#
# S9A.2: K'FIT static client (SPA) image. Build context = repository root:
#   docker compose -f docker-compose.prod.yml build client
#
# Internal only: served on port 80 to the Docker edge network. The public reverse proxy and API routing belong to S9A.3.

# ---------- build ----------
FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app

# Builder-only setting: this stage compiles static files and never runs Chrome, so the workspace install
# (which includes the server's Puppeteer) does not download it. The API image keeps its own browser.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
RUN npm ci && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/client packages/client

# Hosted beta: same-origin API, so the base URL stays empty. Only non-secret public contact links may be passed in.
ARG VITE_PUBLIC_WHATSAPP=""
ARG VITE_PUBLIC_INSTAGRAM=""
ENV VITE_API_BASE_URL=""
RUN npm run build --workspace @kfit/shared && npm run build --workspace @kfit/client

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime
COPY ops/nginx/client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
