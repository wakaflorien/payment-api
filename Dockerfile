# syntax=docker/dockerfile:1
#
# Targets: dev (docker-compose.dev.yml), build (intermediate), runtime (production, the last stage).

# ---- dev: used by docker-compose.dev.yml. Source is bind-mounted, so there is no COPY of src. ----
FROM node:22-bookworm-slim AS dev
ENV NODE_ENV=development \
    TZ=UTC
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
EXPOSE 3000 9229
CMD ["pnpm", "start:dev"]

# ---- build: install everything, compile TypeScript, then drop dev dependencies ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# ---- runtime: only compiled code and production dependencies, as a non-root user ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000

# Docker (and compose's depends_on: service_healthy) know when the API is really up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec form: node is PID 1's child-free process and receives SIGTERM for a graceful shutdown.
CMD ["node", "dist/main.js"]
