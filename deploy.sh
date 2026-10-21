#!/bin/bash
set -e

echo "========================================="
echo " WhatsApp SaaS - VPS Deployment"
echo "========================================="

# --- 1. Check prerequisites ---
echo ""
echo "[1/6] Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Please log out and back in, then re-run this script."
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose not found. Installing plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# Use whichever compose command is available
if command -v docker compose &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

echo "  Docker: $(docker --version)"
echo "  Compose: $($COMPOSE version)"

# --- 2. Check .env.production ---
echo ""
echo "[2/6] Checking environment file..."

if [ ! -f .env.production ]; then
    echo "ERROR: .env.production not found!"
    echo "Copy .env.production.example and fill in your values:"
    echo "  cp .env.production.example .env.production"
    echo "  nano .env.production"
    exit 1
fi

# Check for placeholder values
if grep -q "CHANGE_ME" .env.production; then
    echo "WARNING: .env.production still has CHANGE_ME placeholders!"
    echo "Edit it before deploying to production:"
    echo "  nano .env.production"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# --- 3. Build ---
echo ""
echo "[3/6] Building Docker images..."
$COMPOSE build --no-cache

# --- 4. Start services ---
echo ""
echo "[4/6] Starting services..."
$COMPOSE up -d

# --- 5. Wait for health checks ---
echo ""
echo "[5/6] Waiting for services to be healthy..."
sleep 5

# Check if containers are running
echo ""
echo "Container status:"
$COMPOSE ps

# --- 6. Run database seed (first deploy only) ---
echo ""
echo "[6/6] Checking database..."
echo "If this is your first deploy, seed the database:"
echo "  $COMPOSE exec api sh -c 'cd apps/api && npx prisma db seed'"
echo ""

# --- Done ---
echo "========================================="
echo " Deployment complete!"
echo "========================================="
echo ""
echo " Web app:  http://$(hostname -I | awk '{print $1}')"
echo " API:      http://$(hostname -I | awk '{print $1}')/api/v1"
echo ""
echo " Useful commands:"
echo "   $COMPOSE logs -f          # View all logs"
echo "   $COMPOSE logs -f api      # View API logs"
echo "   $COMPOSE logs -f web      # View Web logs"
echo "   $COMPOSE restart          # Restart all services"
echo "   $COMPOSE down             # Stop all services"
echo "   $COMPOSE exec api sh      # Shell into API container"
echo ""
echo " To set up SSL with Let's Encrypt, see:"
echo "   https://certbot.eff.org/instructions"
echo "========================================="
