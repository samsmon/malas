#!/bin/sh
# malas-dev: previewer perubahan kode di yado-hosts. Data = database utama.
#   dev.sh up | ro      mode HANYA-BACA (default): role malas_dev, storage produksi read-only
#   dev.sh rw --yes     mode TULIS: role malas_app + storage produksi rw (mengubah data ASLI)
#   dev.sh build        build frontend sekali (~25 dtk) setelah mengubah file di resources/js
#   dev.sh watch        build ulang otomatis tiap file berubah (boros memori; matikan: dev.sh unwatch)
#   dev.sh login [id]   terbitkan link login darurat sekali-pakai untuk dev (default super_admin)
#   dev.sh status | logs [service] | down
set -e
cd "$(dirname "$0")/.."
BASE="docker compose --project-directory . -p malas-dev -f deploy/docker-compose.dev.yml"
RW="$BASE -f deploy/docker-compose.dev-rw.yml"

seed_build() {
  # Isi volume build dengan hasil build image supaya halaman langsung jalan sebelum vite selesai.
  docker run --rm -v malas-dev_dev_build:/b malas:latest sh -c '[ -f /b/manifest.json ] || [ -f /b/.vite/manifest.json ] || cp -r /opt/public-build-src/. /b/' >/dev/null 2>&1 || true
}

case "${1:-status}" in
  up|ro)
    [ -f .env.dev ] || { echo "ERROR: .env.dev tidak ada"; exit 1; }
    $BASE up -d --remove-orphans
    seed_build
    echo "malas-dev: mode HANYA-BACA aktif -> http://127.0.0.1:8092" ;;
  rw)
    [ "$2" = "--yes" ] || { echo "Mode TULIS mengubah data ASLI. Jalankan: dev.sh rw --yes"; exit 1; }
    [ -f .env.dev.rw ] || { echo "ERROR: .env.dev.rw tidak ada"; exit 1; }
    $RW up -d --remove-orphans
    echo "PERINGATAN: malas-dev mode TULIS aktif. Semua simpan/hapus mengubah data ASLI. Kembali: dev.sh ro" ;;
  build)
    $BASE --profile build run --rm dev-build ;;
  watch)
    $BASE --profile watch up -d dev-vite
    echo "dev-vite aktif (boros memori). Matikan: dev.sh unwatch" ;;
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
      malas_dev) echo "MODE: HANYA-BACA (DB role malas_dev)" ;;
      "")        echo "MODE: tidak berjalan" ;;
      *)         echo "MODE: TULIS (DB role $U) -> data ASLI bisa berubah" ;;
    esac ;;
  *) echo "pakai: dev.sh up|ro|rw --yes|build|watch|unwatch|login [id]|status|logs [svc]|down"; exit 1 ;;
esac
