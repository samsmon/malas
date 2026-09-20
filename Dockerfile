# =============================================================================
# MALAS — Dockerfile (multi-stage: build frontend -> build vendor -> runtime)
# Build dari root project: docker build -f deploy/Dockerfile -t malas:latest .
# =============================================================================

# --- Stage 1: build frontend assets (Vite/React) ---
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: install PHP dependencies ---
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --ignore-platform-reqs
COPY . .
RUN composer dump-autoload --optimize --no-dev

# --- Stage 3: runtime (PHP-FPM + extensions) ---
FROM php:8.3-fpm-alpine AS runtime

RUN apk add --no-cache \
        postgresql-dev \
        libzip-dev \
        icu-dev \
        oniguruma-dev \
        libpng-dev \
        freetype-dev \
        libjpeg-turbo-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_pgsql \
        pgsql \
        zip \
        intl \
        bcmath \
        mbstring \
        gd \
        opcache

# Upload backup .sql (docs/DOCKER.md) bisa sampai ~100MB (lihat validasi
# `DatabaseBackupController::import()`), default php.ini cuma 2MB — dinaikkan di sini.
RUN { \
        echo 'upload_max_filesize=128M'; \
        echo 'post_max_size=128M'; \
        echo 'memory_limit=256M'; \
        echo 'opcache.enable=1'; \
        echo 'opcache.validate_timestamps=0'; \
    } > /usr/local/etc/php/conf.d/malas.ini

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY --from=frontend /app/public/build ./public/build
COPY . .
COPY --from=vendor /app/vendor ./vendor

# Baked at a path a volume mount never shadows -- entrypoint copies this into the
# shared public_build volume on every boot, so nginx (which only mounts that volume,
# not the whole image) always serves assets matching this exact build's hashes.
COPY --from=frontend /app/public/build /opt/public-build-src

RUN addgroup -g 1000 malas && adduser -G malas -u 1000 -D malas \
    && chown -R malas:malas /var/www/html/storage /var/www/html/bootstrap/cache /var/www/html/public

USER malas

EXPOSE 9000
COPY --chown=malas:malas deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]
