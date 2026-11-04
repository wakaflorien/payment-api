#!/bin/sh
# Development entrypoint inside the container (see docker-compose.dev.yml).
#
#   tsc --watch   recompiles src/ into .docker/dist whenever you save a file
#   node --watch  restarts the app whenever that output changes (and really stops the
#                 old process first, which the Nest CLI's watch mode doesn't do in Docker)
set -e

# A no-op unless package.json / the lockfile changed since the image was built.
pnpm install --frozen-lockfile --prefer-offline

# Start from a clean, complete build, and stop here if it doesn't compile.
rm -rf .docker/dist
pnpm exec tsc -p tsconfig.docker.json

pnpm exec tsc -w -p tsconfig.docker.json --preserveWatchOutput &

# exec: node becomes PID 1's direct child, so `docker stop` (SIGTERM) shuts it down gracefully.
exec node --watch --watch-preserve-output --inspect=0.0.0.0:9229 .docker/dist/main.js
