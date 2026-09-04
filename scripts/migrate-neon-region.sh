#!/bin/bash
#
# Move the database from Neon us-east-1 (Virginia) to a Neon project in
# ap-southeast-1 (Singapore).
#
# Why: the app server is in Mumbai and the database is in Virginia, so every
# query pays a ~236ms round trip. Measured: TCP connect ~240ms, warm SELECT 1
# 236ms, cold connect 1978ms. Singapore should land around 50-70ms.
#
# Neon cannot change a project's region in place, so this is a dump into a new
# project and a DATABASE_URL swap.
#
# Postgres client 18 is required -- the server runs 18.6 and pg_dump refuses to
# dump a server newer than itself. Ubuntu 24.04 only ships client 16, so this
# runs the official postgres:18 image through Docker instead of installing
# anything permanently.
#
# Usage:
#   ./migrate-neon-region.sh rehearse   # dump only, verify, change nothing
#   ./migrate-neon-region.sh cutover    # dump, restore into TARGET, swap .env
#
# Requires TARGET_DATABASE_URL in the environment (the new Singapore project).

set -euo pipefail

MODE="${1:-rehearse}"
APP_DIR=/home/kriscelwaapi/htdocs/api.kriscelwa.online/apps/api
ENV_FILE="$APP_DIR/.env"
WORK=/tmp/neon-migration
IMAGE=postgres:18
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP="$WORK/kriscelwa-$STAMP.dump"

mkdir -p "$WORK"

# Read the source URL from .env without echoing it anywhere.
SOURCE_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')
if [ -z "$SOURCE_DATABASE_URL" ]; then
  echo "FATAL: could not read DATABASE_URL from $ENV_FILE" >&2
  exit 1
fi

# Helper: run a postgres client tool in a disposable container. --rm means
# nothing persists; the work directory is bind-mounted so dumps land on disk.
pg() {
  docker run --rm -i \
    -v "$WORK:$WORK" \
    -e PGCONNECT_TIMEOUT=30 \
    "$IMAGE" "$@"
}

echo "=== 0. tooling ==="
docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "pulling $IMAGE (~150MB, one time)"
  docker pull "$IMAGE"
}
pg pg_dump --version

# In cutover mode the API must stop BEFORE the snapshot and dump. Dumping a
# live database and stopping it afterwards would silently lose every write that
# landed during the dump -- a message sent in those seconds would vanish. The
# rehearsal dumps live on purpose: it only measures, and never restores.
if [ "$MODE" = "cutover" ]; then
  if [ -z "${TARGET_DATABASE_URL:-}" ]; then
    echo "FATAL: set TARGET_DATABASE_URL to the Singapore project's connection string" >&2
    exit 1
  fi
  echo ""
  echo "=== stopping the API (downtime begins) ==="
  su -s /bin/bash kriscelwaapi -c 'pm2 stop kriscelwa-api'
fi

echo ""
echo "=== 1. source snapshot ==="
SRC_TABLES=$(pg psql "$SOURCE_DATABASE_URL" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
SRC_CONTACTS=$(pg psql "$SOURCE_DATABASE_URL" -tAc "SELECT count(*) FROM contacts;")
SRC_MESSAGES=$(pg psql "$SOURCE_DATABASE_URL" -tAc "SELECT count(*) FROM messages;")
SRC_TENANTS=$(pg psql "$SOURCE_DATABASE_URL" -tAc "SELECT count(*) FROM tenants;")
echo "  tables=$SRC_TABLES contacts=$SRC_CONTACTS messages=$SRC_MESSAGES tenants=$SRC_TENANTS"

echo ""
echo "=== 2. dump ==="
START=$(date +%s)
pg pg_dump "$SOURCE_DATABASE_URL" -Fc --no-owner --no-acl -f "$DUMP"
echo "  dumped in $(( $(date +%s) - START ))s -> $(du -h "$DUMP" | cut -f1)"

# A dump that restores nothing is the failure mode that looks like success.
OBJECTS=$(pg pg_restore -l "$DUMP" | grep -vc '^;')
echo "  objects in dump: $OBJECTS"
if [ "$OBJECTS" -lt 50 ]; then
  echo "FATAL: dump looks too small to be complete" >&2
  exit 1
fi

if [ "$MODE" = "rehearse" ]; then
  echo ""
  echo "=== rehearsal complete -- nothing was changed ==="
  echo "  dump kept at: $DUMP"
  exit 0
fi

# ---------------- cutover ----------------

echo ""
echo "=== 4. restore into target ==="
# Restore over the DIRECT endpoint, not the pooler. Neon's pooler is pgbouncer
# in transaction mode, which does not carry the session state a restore needs
# (SET statements, and DDL that expects to hold a session). The app keeps using
# the pooled URL afterwards -- this bypass is only for the restore itself.
TARGET_DIRECT_URL="${TARGET_DATABASE_URL/-pooler/}"
if [ "$TARGET_DIRECT_URL" = "$TARGET_DATABASE_URL" ]; then
  echo "  note: target URL has no -pooler segment, using as-is"
else
  echo "  using direct (non-pooled) endpoint for restore"
fi

# pgcrypto must exist before objects that depend on it.
pg psql "$TARGET_DIRECT_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
START=$(date +%s)
pg pg_restore --no-owner --no-acl --clean --if-exists \
  -d "$TARGET_DIRECT_URL" "$DUMP"
echo "  restored in $(( $(date +%s) - START ))s"

echo ""
echo "=== 5. verify row counts match ==="
DST_TABLES=$(pg psql "$TARGET_DIRECT_URL" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
DST_CONTACTS=$(pg psql "$TARGET_DIRECT_URL" -tAc "SELECT count(*) FROM contacts;")
DST_MESSAGES=$(pg psql "$TARGET_DIRECT_URL" -tAc "SELECT count(*) FROM messages;")
DST_TENANTS=$(pg psql "$TARGET_DIRECT_URL" -tAc "SELECT count(*) FROM tenants;")
echo "  source: tables=$SRC_TABLES contacts=$SRC_CONTACTS messages=$SRC_MESSAGES tenants=$SRC_TENANTS"
echo "  target: tables=$DST_TABLES contacts=$DST_CONTACTS messages=$DST_MESSAGES tenants=$DST_TENANTS"

if [ "$SRC_TABLES" != "$DST_TABLES" ] || [ "$SRC_CONTACTS" != "$DST_CONTACTS" ] \
   || [ "$SRC_MESSAGES" != "$DST_MESSAGES" ] || [ "$SRC_TENANTS" != "$DST_TENANTS" ]; then
  echo "FATAL: counts differ -- NOT swapping .env. Restarting API on the old database." >&2
  su -s /bin/bash kriscelwaapi -c 'pm2 start kriscelwa-api'
  exit 1
fi

echo ""
echo "=== 6. swap DATABASE_URL ==="
cp "$ENV_FILE" "$ENV_FILE.pre-migration-$STAMP"
chmod 600 "$ENV_FILE.pre-migration-$STAMP"
# Rewrite only the DATABASE_URL line; python avoids sed's delimiter problems
# with URLs full of slashes and special characters.
python3 - "$ENV_FILE" "$TARGET_DATABASE_URL" <<'PY'
import sys
path, new = sys.argv[1], sys.argv[2]
out = []
for line in open(path):
    out.append(f"DATABASE_URL={new}\n" if line.startswith("DATABASE_URL=") else line)
open(path, "w").writelines(out)
PY
echo "  .env updated (backup: $ENV_FILE.pre-migration-$STAMP)"

echo ""
echo "=== 7. restart and verify ==="
su -s /bin/bash kriscelwaapi -c 'pm2 start kriscelwa-api'
sleep 8
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3012/health)
echo "  health=$CODE"
if [ "$CODE" != "200" ]; then
  echo "API unhealthy -- roll back with:" >&2
  echo "  cp $ENV_FILE.pre-migration-$STAMP $ENV_FILE && su -s /bin/bash kriscelwaapi -c 'pm2 restart kriscelwa-api'" >&2
  exit 1
fi

echo ""
echo "=== done ==="
echo "  Old database untouched -- keep it until the new one has proven itself."
echo "  Roll back any time with:"
echo "    cp $ENV_FILE.pre-migration-$STAMP $ENV_FILE && su -s /bin/bash kriscelwaapi -c 'pm2 restart kriscelwa-api'"
