#!/usr/bin/env bash
# =============================================================================
# MALAS — Update Script (Docker)
# Run from the project root directory: bash deploy/update-docker.sh
# Pull the latest code, rebuild the image, run new migrations, without overwriting data.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${PROJECT_ROOT}/deploy"
cd "$PROJECT_ROOT"

[[ -f "artisan" ]] || error "This script must be run from the MALAS project."
[[ -f "${DEPLOY_DIR}/.env" ]] || error "deploy/.env does not exist yet — run deploy/deploy-docker.sh first."

# =============================================================================
step "Pull latest code"
# =============================================================================
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Branch: ${CURRENT_BRANCH}"
git fetch origin
git pull origin "$CURRENT_BRANCH"
success "Latest code pulled successfully."

# =============================================================================
step "Rebuild image & restart containers"
# =============================================================================
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "${DEPLOY_DIR}/.env" build
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "${DEPLOY_DIR}/.env" up -d
success "Containers restarted with the latest image."

# =============================================================================
step "Run new migrations (if any)"
# =============================================================================
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" exec -T app php artisan migrate --force
success "Migration finished (Laravel skips automatically when nothing is pending)."

# =============================================================================
step "Clear & rebuild cache"
# =============================================================================
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" exec -T app php artisan config:cache
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" exec -T app php artisan route:cache
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" exec -T app php artisan view:cache
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" exec -T app php artisan optimize
success "Cache updated."

# =============================================================================
step "Restart queue worker"
# =============================================================================
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" restart queue
success "Queue worker is running the latest code."

# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}Update complete!${NC}"
COMMIT=$(git log -1 --pretty=format:"%h %s")
echo -e "  Latest commit: ${COMMIT}"
echo ""
