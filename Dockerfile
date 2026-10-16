# Prime Council — one-command start.
#
#   docker compose up --build        # then open http://localhost:3000
#
# With no provider keys the council runs in labelled demo mode (no model calls).
# Keys are never baked into the image: .dockerignore excludes every .env file,
# and docker-compose.yml reads .env.local at run time only if it exists.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build must not leave an embedded database behind in the image.
RUN npm run build && rm -rf .data

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PGLITE_DIR=/data/pglite
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
# The status route answers only requests addressed to a loopback host (src/proxy.ts),
# which a request from inside the container to localhost is.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# 0.0.0.0 inside the container only, so Docker's port mapping can reach the server.
# docker-compose.yml publishes it on 127.0.0.1 of the host, and src/proxy.ts still
# refuses any request not addressed to localhost unless SIMLIFE_ACCESS_TOKEN is set.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
