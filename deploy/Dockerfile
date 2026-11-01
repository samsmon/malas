# =============================================================================
# MALAS — Dockerfile (multi-stage: build frontend -> build vendor -> runtime)
# Build from the project root: docker build -f deploy/Dockerfile -t malas:latest .
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

# Uploading a .sql backup (docs/DOCKER.md) can reach ~100MB (see the validation in
# `DatabaseBackupController::import()`), the default php.ini only allows 2MB — raised here.
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

RUN addgroup -g 1000 malas && adduser -G malas -u 1000 -D malas \
    && chown -R malas:malas /var/www/html/storage /var/www/html/bootstrap/cache /var/www/html/public

USER malas

EXPOSE 9000
CMD ["php-fpm"]
