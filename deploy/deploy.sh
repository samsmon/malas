#!/usr/bin/env bash
# =============================================================================
# MALAS — Deploy Script (Ubuntu Server 24)
# Run from the project root directory: bash deploy.sh
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

[[ -f "artisan" ]] || error "This script must be run from the MALAS project (deploy/deploy.sh)."

# =============================================================================
step "Check permissions"
# =============================================================================
if [[ $EUID -ne 0 ]]; then
    SUDO="sudo"
    info "Not root — will use sudo for system installation."
else
    SUDO=""
fi

# =============================================================================
step "Install system dependencies"
# =============================================================================
info "Update package list..."
$SUDO apt-get update -qq

info "Install Nginx, PHP 8.2, MySQL 8, Node 20, Composer, Supervisor..."
$SUDO apt-get install -y -qq \
    nginx \
    mysql-server \
    php8.2 php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml \
    php8.2-bcmath php8.2-curl php8.2-zip php8.2-intl php8.2-sqlite3 \
    supervisor \
    unzip curl git

# Node 20 via NodeSource
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
    info "Install Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - -s -- -y
    $SUDO apt-get install -y -qq nodejs
fi

# Composer
if ! command -v composer &>/dev/null; then
    info "Install Composer..."
    curl -sS https://getcomposer.org/installer | php
    $SUDO mv composer.phar /usr/local/bin/composer
fi

success "System dependencies installed."

# =============================================================================
step "Configure MySQL"
# =============================================================================
echo ""
read -rp "Database name [malas_prod]: " DB_DATABASE
DB_DATABASE="${DB_DATABASE:-malas_prod}"

read -rp "Database username [malas]: " DB_USERNAME
DB_USERNAME="${DB_USERNAME:-malas}"

while true; do
    read -rsp "Password database: " DB_PASSWORD
    echo ""
    read -rsp "Konfirmasi password: " DB_PASSWORD2
    echo ""
    [[ "$DB_PASSWORD" == "$DB_PASSWORD2" ]] && break
    warn "Passwords do not match, try again."
done

info "Creating MySQL database and user..."
$SUDO mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$SUDO mysql -e "CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
$SUDO mysql -e "GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'localhost';"
$SUDO mysql -e "FLUSH PRIVILEGES;"
success "Database '${DB_DATABASE}' ready."

# =============================================================================
step "Set up .env file"
# =============================================================================
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    info "Created .env file from .env.example."
fi

read -rp "Server domain / IP (e.g. malas.example.com or 123.45.67.89): " APP_DOMAIN

# Update .env
sed -i "s|APP_ENV=.*|APP_ENV=production|"             .env
sed -i "s|APP_DEBUG=.*|APP_DEBUG=false|"              .env
sed -i "s|APP_URL=.*|APP_URL=https://${APP_DOMAIN}|"  .env
sed -i "s|LOG_LEVEL=.*|LOG_LEVEL=error|"              .env
sed -i "s|DB_CONNECTION=.*|DB_CONNECTION=mysql|"      .env

# Add / update DB config
grep -q "^DB_HOST="     .env && sed -i "s|DB_HOST=.*|DB_HOST=127.0.0.1|"          .env || echo "DB_HOST=127.0.0.1"     >> .env
grep -q "^DB_PORT="     .env && sed -i "s|DB_PORT=.*|DB_PORT=3306|"               .env || echo "DB_PORT=3306"           >> .env
grep -q "^DB_DATABASE=" .env && sed -i "s|DB_DATABASE=.*|DB_DATABASE=${DB_DATABASE}|" .env || echo "DB_DATABASE=${DB_DATABASE}" >> .env
grep -q "^DB_USERNAME=" .env && sed -i "s|DB_USERNAME=.*|DB_USERNAME=${DB_USERNAME}|" .env || echo "DB_USERNAME=${DB_USERNAME}" >> .env
grep -q "^DB_PASSWORD=" .env && sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" .env || echo "DB_PASSWORD=${DB_PASSWORD}" >> .env

echo ""
warn "SSO credentials are required for login to work."
read -rp "SSO_CLIENT_ID: " SSO_CLIENT_ID
read -rsp "SSO_CLIENT_SECRET: " SSO_CLIENT_SECRET
echo ""
read -rp "SSO_REDIRECT_URI [https://${APP_DOMAIN}/auth/callback]: " SSO_REDIRECT
SSO_REDIRECT="${SSO_REDIRECT:-https://${APP_DOMAIN}/auth/callback}"

grep -q "^SSO_CLIENT_ID="     .env && sed -i "s|SSO_CLIENT_ID=.*|SSO_CLIENT_ID=${SSO_CLIENT_ID}|"         .env || echo "SSO_CLIENT_ID=${SSO_CLIENT_ID}"     >> .env
grep -q "^SSO_CLIENT_SECRET=" .env && sed -i "s|SSO_CLIENT_SECRET=.*|SSO_CLIENT_SECRET=${SSO_CLIENT_SECRET}|" .env || echo "SSO_CLIENT_SECRET=${SSO_CLIENT_SECRET}" >> .env
grep -q "^SSO_REDIRECT_URI="  .env && sed -i "s|SSO_REDIRECT_URI=.*|SSO_REDIRECT_URI=${SSO_REDIRECT}|"    .env || echo "SSO_REDIRECT_URI=${SSO_REDIRECT}"    >> .env

sed -i "s|SESSION_ENCRYPT=.*|SESSION_ENCRYPT=true|"  .env

success ".env configured."

# =============================================================================
step "Install PHP dependencies"
# =============================================================================
composer install --no-dev --optimize-autoloader --no-interaction
success "Composer install finished."

# =============================================================================
step "Generate application key"
# =============================================================================
grep -q "^APP_KEY=base64:" .env || php artisan key:generate
success "APP_KEY ready."

# =============================================================================
step "Build frontend assets"
# =============================================================================
npm ci
npm run build
success "Frontend build finished."

# =============================================================================
step "Database migration & seeding"
# =============================================================================
php artisan migrate --force
php artisan db:seed --class=MenuSeeder --force
success "Migration and seeding finished."

# =============================================================================
step "Set up storage symlink & cache"
# =============================================================================
php artisan storage:link || true
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan optimize
success "Cache dan storage ready."

# =============================================================================
step "Set file permissions"
# =============================================================================
$SUDO chown -R www-data:www-data storage bootstrap/cache
$SUDO chmod -R 775 storage bootstrap/cache
success "Permissions set to www-data."

# =============================================================================
step "Configure Nginx"
# =============================================================================
PROJECT_PATH="$SCRIPT_DIR"
NGINX_CONF="/etc/nginx/sites-available/malas"

$SUDO tee "$NGINX_CONF" > /dev/null <<NGINX
server {
    listen 80;
    server_name ${APP_DOMAIN};
    root ${PROJECT_PATH}/public;
    index index.php;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    charset utf-8;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
NGINX

$SUDO ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/malas
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t && $SUDO systemctl reload nginx
$SUDO systemctl enable nginx php8.2-fpm mysql
success "Nginx configured for ${APP_DOMAIN}."

# =============================================================================
step "Configure queue worker (Supervisor)"
# =============================================================================
SUPERVISOR_CONF="/etc/supervisor/conf.d/malas-worker.conf"

$SUDO tee "$SUPERVISOR_CONF" > /dev/null <<SUPERVISOR
[program:malas-worker]
process_name=%(program_name)s_%(process_num)02d
command=php ${PROJECT_PATH}/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
numprocs=1
user=www-data
redirect_stderr=true
stdout_logfile=${PROJECT_PATH}/storage/logs/worker.log
stopwaitsecs=3600
SUPERVISOR

$SUDO systemctl enable supervisor
$SUDO systemctl restart supervisor
$SUDO supervisorctl reread
$SUDO supervisorctl update
$SUDO supervisorctl start malas-worker:* || true
success "Queue worker is running (needed for storage migration, backups, and other queued jobs)."

# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   MALAS deployed successfully!           ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  URL         : http://${APP_DOMAIN}  (not HTTPS yet)"
echo -e "  Project dir : ${PROJECT_PATH}"
echo ""
echo -e "${BOLD}Next steps (pick one):${NC}"
echo ""
echo -e "  ${BOLD}A. Cloudflare Tunnel (recommended — no public IP needed):${NC}"
echo -e "     1. Install: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
echo -e "     2. Login : cloudflared tunnel login"
echo -e "     3. Create : cloudflared tunnel create malas"
echo -e "     4. Route : cloudflared tunnel route dns malas ${APP_DOMAIN}"
echo -e "     5. Run    : cloudflared tunnel run --url http://localhost:80 malas"
echo ""
echo -e "  ${BOLD}B. Direct SSL (needs a public IP):${NC}"
echo -e "     sudo apt install certbot python3-certbot-nginx"
echo -e "     sudo certbot --nginx -d ${APP_DOMAIN}"
echo ""
echo -e "To update the code in the future, run: ${BOLD}bash deploy/update.sh${NC}"
echo ""
