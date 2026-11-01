#!/usr/bin/env bash
# =============================================================================
# MALAS — Deploy Script (Docker, generic for Proxmox LXC/VM or any Linux)
# Run from the project root directory: bash deploy/deploy-docker.sh
#
# Assumption: Docker Engine + the Docker Compose plugin are ALREADY installed on the host/LXC/VM.
# This script does NOT touch the Proxmox API at all — it only needs `docker` and
# `docker compose` on the PATH, so it is portable to any Linux (not just Proxmox).
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }

# Project root = one level above the deploy/ folder
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${PROJECT_ROOT}/deploy"
cd "$DEPLOY_DIR"

[[ -f "${PROJECT_ROOT}/artisan" ]] || error "This script must be run from the MALAS project (deploy/deploy-docker.sh)."

# =============================================================================
step "Check prerequisites"
# =============================================================================
command -v docker &>/dev/null || error "Docker is not installed. Install Docker Engine on this LXC/VM first, then run this script again."
docker compose version &>/dev/null || error "Docker Compose plugin is missing ('docker compose' failed). Install docker-compose-plugin first."
success "Docker & Docker Compose detected."

# =============================================================================
step "Set up .env file"
# =============================================================================
if [[ ! -f ".env" ]]; then
    cp .env.docker.example .env
    info "Created deploy/.env from .env.docker.example."

    read -rp "Domain / IP:port used to access the app (e.g. malas.example.com or 123.45.67.89:8080): " APP_DOMAIN
    read -rp "Nginx port on the host [8080]: " APP_PORT
    APP_PORT="${APP_PORT:-8080}"

    while true; do
        read -rsp "Password database Postgres: " DB_PASSWORD
        echo ""
        read -rsp "Konfirmasi password: " DB_PASSWORD2
        echo ""
        [[ "$DB_PASSWORD" == "$DB_PASSWORD2" ]] && break
        warn "Passwords do not match, try again."
    done

    warn "SSO credentials are required for login to work (you may leave them empty for now if you only want to use Login via Email)."
    read -rp "SSO_CLIENT_ID (optional): " SSO_CLIENT_ID
    read -rsp "SSO_CLIENT_SECRET (opsional): " SSO_CLIENT_SECRET
    echo ""

    read -rp "Use HTTPS for APP_URL? (Y/n): " USE_HTTPS
    PROTO="https"
    if [[ "${USE_HTTPS,,}" == "n" ]]; then
        PROTO="http"
    fi

    sed -i "s|APP_URL=.*|APP_URL=${PROTO}://${APP_DOMAIN}|"                 .env
    sed -i "s|APP_PORT=.*|APP_PORT=${APP_PORT}|"                        .env
    sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|"                .env
    sed -i "s|SSO_CLIENT_ID=.*|SSO_CLIENT_ID=${SSO_CLIENT_ID}|"          .env
    sed -i "s|SSO_CLIENT_SECRET=.*|SSO_CLIENT_SECRET=${SSO_CLIENT_SECRET}|" .env
    sed -i "s|SSO_REDIRECT_URI=.*|SSO_REDIRECT_URI=${PROTO}://${APP_DOMAIN}/auth/callback|" .env
    sed -i "s|SSO_BASE_URL=.*|SSO_BASE_URL=https://sso.yado.my.id|"     .env

    success "deploy/.env configured."
else
    info "deploy/.env already exists — using it as-is (delete this file to set up again from scratch)."
fi

# =============================================================================
step "Build image"
# =============================================================================
docker compose build
success "Image built."

# Generate APP_KEY if missing (via a one-off container, before the full stack is running)
if ! grep -q "^APP_KEY=base64:" .env; then
    info "Generate APP_KEY..."
    KEY=$(docker compose run --rm --no-deps app php artisan key:generate --show)
    sed -i "s|APP_KEY=.*|APP_KEY=${KEY}|" .env
    success "APP_KEY generated."
fi

# =============================================================================
step "Start containers"
# =============================================================================
docker compose up -d
success "Containers app, queue, nginx, db are running."

# =============================================================================
step "Wait for Postgres to be ready"
# =============================================================================
info "Waiting for the database healthcheck..."
for _ in $(seq 1 30); do
    STATUS=$(docker compose ps -q db | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    [[ "$STATUS" == "healthy" ]] && break
    sleep 2
done
[[ "$STATUS" == "healthy" ]] || error "Postgres database is not healthy after 60 seconds — check 'docker compose logs db'."
success "Database ready."

# =============================================================================
step "Migration & seeding"
# =============================================================================
docker compose exec -T app php artisan migrate --force
docker compose exec -T app php artisan db:seed --class=RoleSeeder --force
docker compose exec -T app php artisan db:seed --class=MenuSeeder --force
docker compose exec -T app php artisan storage:link || true
success "Migration and seeding finished."

# =============================================================================
step "Migrate old data (optional)"
# =============================================================================
echo ""
read -rp "Is there old data (SQLite/MySQL) to copy into this Postgres? (y/N): " DO_MIGRATE
if [[ "${DO_MIGRATE,,}" == "y" ]]; then
    warn "Make sure the source connection ('sqlite' or 'mysql') is still valid in the app container's .env BEFORE continuing,"
    warn "or run manually: docker compose exec app php artisan malas:migrate-data --from=sqlite --to=pgsql"
    read -rp "Source connection name [sqlite]: " FROM_CONN
    FROM_CONN="${FROM_CONN:-sqlite}"
    docker compose exec -T app php artisan malas:migrate-data --from="${FROM_CONN}" --to=pgsql --truncate --no-interaction
    success "Data migration finished — check the row counts of each important table before considering the cutover done."
else
    info "Skipping data migration (fresh install)."
fi

# =============================================================================
step "Production cache"
# =============================================================================
docker compose exec -T app php artisan config:cache
docker compose exec -T app php artisan route:cache
docker compose exec -T app php artisan view:cache
docker compose exec -T app php artisan optimize
success "Cache ready."

# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   MALAS (Docker) deployed successfully!  ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
PORT=$(grep '^APP_PORT=' .env | cut -d= -f2)
echo -e "  URL         : http://localhost:${PORT:-8080}  (via the nginx container)"
echo -e "  Compose dir : ${DEPLOY_DIR}"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo -e "  Logs, all services : docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"
echo -e "  Stop stack          : docker compose -f ${DEPLOY_DIR}/docker-compose.yml down"
echo -e "  Restart worker      : docker compose -f ${DEPLOY_DIR}/docker-compose.yml restart queue"
echo ""
echo -e "For HTTPS/a public domain, see the Cloudflare Tunnel / reverse proxy options in docs/DOCKER.md."
echo -e "To update the code in the future, run: ${BOLD}bash deploy/update-docker.sh${NC}"
echo ""
