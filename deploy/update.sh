#!/usr/bin/env bash
# =============================================================================
# MALAS — Update Script
# Run from the project root directory: bash update.sh
# Pull the latest code from GitHub without overwriting the database.
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

[[ -f "artisan" ]] || error "This script must be run from the MALAS project (deploy/update.sh)."

echo -e "${BOLD}MALAS — Update${NC}"
echo "Fetching the latest code from GitHub..."
echo ""

# =============================================================================
step "Enable maintenance mode"
# =============================================================================
php artisan down --render="errors.503" || true
info "Maintenance mode enabled."

# =============================================================================
step "Pull latest code"
# =============================================================================
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Branch: ${CURRENT_BRANCH}"

git fetch origin
git pull origin "$CURRENT_BRANCH"
success "Latest code pulled successfully."

# =============================================================================
step "Update PHP dependencies"
# =============================================================================
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "composer.lock"; then
    info "composer.lock changed — updating dependencies..."
    composer install --no-dev --optimize-autoloader --no-interaction
    success "Composer update finished."
else
    info "No composer.lock changes — skipping."
fi

# =============================================================================
step "Rebuild frontend"
# =============================================================================
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -qE "^resources/|package-lock.json|package.json|vite.config"; then
    info "Frontend changes detected — rebuilding..."
    npm ci
    npm run build
    success "Frontend build finished."
else
    info "No frontend changes — skipping."
fi

# =============================================================================
step "Run new migrations (if any)"
# =============================================================================
PENDING=$(php artisan migrate:status --no-ansi 2>/dev/null | grep "Pending" | wc -l || echo "0")
if [[ "$PENDING" -gt 0 ]]; then
    info "${PENDING} new migration(s) found — running..."
    php artisan migrate --force
    success "Migration finished."
else
    info "No new migrations."
fi

# =============================================================================
step "Clear & rebuild cache"
# =============================================================================
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan optimize
success "Cache updated."

# =============================================================================
step "Restart queue worker"
# =============================================================================
php artisan queue:restart
success "Queue worker will reload with the latest code once the running job finishes."

# =============================================================================
step "Disable maintenance mode"
# =============================================================================
php artisan up
success "Application is back online."

# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}Update complete!${NC}"
COMMIT=$(git log -1 --pretty=format:"%h %s")
echo -e "  Latest commit: ${COMMIT}"
echo ""
