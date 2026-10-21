#!/bin/bash
set -e

# =============================================
#  WhatsApp SaaS — Zero-Downtime Deployment
# =============================================
#
# Deploys web and API independently so one stays
# up while the other rebuilds & restarts.
#
# Usage:
#   ./deploy-zero-downtime.sh          # deploy both
#   ./deploy-zero-downtime.sh web      # deploy only frontend
#   ./deploy-zero-downtime.sh api      # deploy only API
# =============================================

TARGET="${1:-all}"  # all | web | api

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
fail() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# Detect compose command
if command -v docker compose &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    fail "Docker Compose not found"
fi

# Ensure .env.production exists
[ -f .env.production ] || fail ".env.production not found — copy .env.production.example and fill in your values"

# ---- helpers ----

wait_healthy() {
    local container=$1
    local max_wait=${2:-60}
    local elapsed=0
    log "Waiting for ${container} to be healthy (max ${max_wait}s)..."
    while [ $elapsed -lt $max_wait ]; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
        if [ "$status" = "healthy" ]; then
            log "${container} is healthy"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    warn "${container} did not become healthy within ${max_wait}s (status: ${status})"
    return 1
}

wait_running() {
    local container=$1
    local max_wait=${2:-30}
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
        if [ "$state" = "running" ]; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

# =============================================
#  Step 1 — Make sure postgres & redis are up
# =============================================

log "Ensuring database & redis are running..."
$COMPOSE up -d postgres redis
wait_healthy whatsapp-saas-postgres 30
wait_healthy whatsapp-saas-redis 15

# =============================================
#  Step 2 — Build new images (old containers keep running)
# =============================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "web" ]; then
    log "Building web image (frontend stays live during build)..."
    $COMPOSE build web
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "api" ]; then
    log "Building API image (API stays live during build)..."
    $COMPOSE build api
fi

# =============================================
#  Step 3 — Deploy web (static files — near-instant swap)
# =============================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "web" ]; then
    log "Deploying web (nginx + static files)..."
    $COMPOSE up -d --no-deps web
    wait_running whatsapp-saas-web 15
    log "Web deployed — frontend is live"
fi

# =============================================
#  Step 4 — Deploy API (runs migrations, then starts)
# =============================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "api" ]; then
    log "Deploying API (will run migrations and restart)..."
    $COMPOSE up -d --no-deps api
    wait_running whatsapp-saas-api 30

    # Give the API time to run prisma migrate + boot
    log "Waiting for API to finish startup (migrations + boot)..."
    sleep 5

    # Check if it's actually responding
    RETRIES=0
    MAX_RETRIES=20
    while [ $RETRIES -lt $MAX_RETRIES ]; do
        if curl -sf http://127.0.0.1:3001/api/v1/health > /dev/null 2>&1; then
            log "API is responding to health checks"
            break
        fi
        RETRIES=$((RETRIES + 1))
        sleep 3
    done

    if [ $RETRIES -eq $MAX_RETRIES ]; then
        warn "API health check did not pass — check logs with: $COMPOSE logs -f api"
    else
        log "API deployed successfully"
    fi
fi

# =============================================
#  Step 5 — Final status
# =============================================

echo ""
log "========================================="
log " Deployment complete!"
log "========================================="
echo ""
$COMPOSE ps
echo ""
log "Useful commands:"
log "  $COMPOSE logs -f api     # API logs"
log "  $COMPOSE logs -f web     # Web logs"
log "  $COMPOSE ps              # Container status"
echo ""
