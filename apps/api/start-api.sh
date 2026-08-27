#!/bin/bash
# PM2 entrypoint for the production API (process name: kriscelwa-api).
#
# Production runs the TypeScript sources through tsx rather than dist/ — editing
# dist/ on the server has no effect on the running service.
#
# tsx's CLI is resolved by glob instead of a pinned
# node_modules/.pnpm/tsx@<version> path: pnpm rewrites that directory on every
# dependency change, and a hardcoded version silently broke startup the next
# time the service restarted. (.bin/tsx is a shell wrapper, not a JS module, so
# node cannot execute it directly.)
set -e
ROOT=/home/kriscelwaapi/htdocs/api.kriscelwa.online
cd "$ROOT/apps/api"

TSX_CLI=$(ls -d "$ROOT"/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs 2>/dev/null | sort -V | tail -1)
if [ -z "$TSX_CLI" ]; then
  echo "start-api: could not locate tsx cli under $ROOT/node_modules/.pnpm" >&2
  exit 1
fi

exec node --env-file=.env "$TSX_CLI" src/index.ts
