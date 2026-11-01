#!/bin/sh
# malas-dev: preview of code changes on yado-hosts. Data = the main database.
#   dev.sh up | ro      READ-ONLY mode (default): role malas_dev, production storage read-only
#   dev.sh rw --yes     WRITE mode: role malas_app + production storage rw (changes REAL data)
#   dev.sh build        build the frontend once (~25 s) after changing files in resources/js
#   dev.sh watch        rebuild automatically on every file change (memory heavy; stop with: dev.sh unwatch)
#   dev.sh login [id]   issue a one-time emergency login link for dev (default super_admin)
#   dev.sh status | logs [service] | down
set -e
cd "$(dirname "$0")/.."
BASE="docker compose --project-directory . -p malas-dev -f deploy/docker-compose.dev.yml"
RW="$BASE -f deploy/docker-compose.dev-rw.yml"

seed_build() {
  # Fill the build volume with the image's build output so pages work right away, before vite finishes.
  docker run --rm -v malas-dev_dev_build:/b malas:latest sh -c '[ -f /b/manifest.json ] || [ -f /b/.vite/manifest.json ] || cp -r /opt/public-build-src/. /b/' >/dev/null 2>&1 || true
}

case "${1:-status}" in
  up|ro)
    [ -f .env.dev ] || { echo "ERROR: .env.dev not found"; exit 1; }
    $BASE up -d --remove-orphans
    seed_build
    echo "malas-dev: READ-ONLY mode active -> http://127.0.0.1:8092" ;;
  rw)
    [ "$2" = "--yes" ] || { echo "WRITE mode changes REAL data. Run: dev.sh rw --yes"; exit 1; }
    [ -f .env.dev.rw ] || { echo "ERROR: .env.dev.rw not found"; exit 1; }
    $RW up -d --remove-orphans
    echo "WARNING: malas-dev WRITE mode is active. Every save/delete changes REAL data. Go back: dev.sh ro" ;;
  build)
    $BASE --profile build run --rm -T dev-build < /dev/null ;;
  watch)
    $BASE --profile watch up -d dev-vite
    echo "dev-vite active (memory heavy). Stop with: dev.sh unwatch" ;;
  unwatch)
    $BASE --profile watch stop dev-vite; $BASE --profile watch rm -f dev-vite ;;
  login)
    $BASE exec -T dev-app php artisan sso:emergency-login "${2:-super_admin}" --no-interaction ;;
  logs)
    $BASE logs --tail 60 ${2:-} ;;
  down)
    $BASE down ;;
  status)
    $BASE ps
    U=$(docker exec malas-dev-dev-app-1 printenv DB_USERNAME 2>/dev/null || true)
    case "$U" in
      malas_dev) echo "MODE: READ-ONLY (DB role malas_dev)" ;;
      "")        echo "MODE: not running" ;;
      *)         echo "MODE: WRITE (DB role $U) -> REAL data can change" ;;
    esac ;;
  *) echo "usage: dev.sh up|ro|rw --yes|build|watch|unwatch|login [id]|status|logs [svc]|down"; exit 1 ;;
esac
