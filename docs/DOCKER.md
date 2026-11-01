# Malas — Deployment via Docker (Postgres)

> The third method besides [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) (native/bare-metal, MySQL). This path uses **PostgreSQL** as the database (to stay consistent with the other microservices), packaged via Docker Compose, and is **generic**: it only needs Docker Engine + the Compose plugin, so it runs on a Proxmox LXC/VM, any VPS, or a laptop for local testing. The script does **not** touch the Proxmox API at all.

---

## When to use this method vs `deploy.sh` (native)?

| | Native (`deploy/deploy.sh`) | Docker (`deploy/deploy-docker.sh`) |
|---|---|---|
| Database | MySQL 8+ | **PostgreSQL 16** |
| Installs to | Directly on the host (systemd, Nginx, PHP-FPM) | Containers (app, nginx, db, queue) |
| Suited for | Ordinary VPS/EC2/Azure | Homelab/Proxmox, or when you want consistency with other microservices already on Postgres/Docker |
| Isolation | No, everything shares the host OS | Yes, each service has its own container |

If you have deployed natively before (MySQL/SQLite) and want to move here, see [Migrating Data from an Old Installation](#migrating-data-from-an-old-installation). **Do not** run `deploy-docker.sh` straight on top of old data; that creates a new, empty Postgres installation.

---

## Prerequisites

- Docker Engine + Docker Compose plugin (`docker compose version` must work)
- A Proxmox LXC/VM (or any Linux host) with internet access to pull base images
- The Malas repo cloned
- Yado SSO credentials (can be left empty for now if you only want to use Login via Email)

If the Proxmox LXC does not have Docker yet:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $(whoami)
# log out/in again so the docker group takes effect
```

> **Proxmox LXC note**: if you use an LXC (not a VM), make sure an **unprivileged** container is still granted nested container permission (`Options → Features → Nesting` = enabled) in the Proxmox config, or the Docker daemon inside it may fail to start. A regular VM does not need this step.

---

## Fresh Install

```bash
git clone https://github.com/USERNAME/malas.git /opt/malas
cd /opt/malas
bash deploy/deploy-docker.sh
```

The script will:
1. Check that `docker` and `docker compose` are available
2. Set up `deploy/.env` from `deploy/.env.docker.example` (asks for domain, port, Postgres password, SSO credentials)
3. Generate `APP_KEY`
4. Build the image (`deploy/Dockerfile`, multi-stage: Node build → Composer → PHP-FPM)
5. Start the stack: `app` (PHP-FPM), `queue` (worker), `nginx`, `db` (Postgres 16)
6. Wait for Postgres to be healthy, then migrate + seed menus
7. Ask whether you want to migrate data from an old installation (see the section below)
8. Production caching (`config:cache`, `route:cache`, etc.)

When finished, the app can be reached at `http://<host>:<APP_PORT>` (default port `8080`).

### File structure (`deploy/`)

```
deploy/
  Dockerfile                   — multi-stage build (frontend, vendor, runtime)
  docker-compose.yml           — production stack (app, queue, nginx, db)
  docker-compose.override.yml  — override for local dev (bind mount + Vite HMR), auto-loaded
  nginx.conf                   — PHP-FPM reverse proxy
  .env.docker.example          — env template for compose (DB_CONNECTION=pgsql)
  deploy-docker.sh             — Docker deploy from scratch
  update-docker.sh             — update code in an already running Docker deploy
  deploy.sh / update.sh        — native deploy/update (see DEPLOYMENT.md)
```

---

## Local Testing / Development

`docker-compose.override.yml` is loaded automatically together with `docker-compose.yml` (default Docker Compose behavior) when run from inside the `deploy/` folder:

```bash
cd deploy
cp .env.docker.example .env   # fill in manually, or just run deploy-docker.sh
docker compose up -d
```

This override bind-mounts the source code (not the build output) and adds a `vite` service for HMR (`http://localhost:5173`). Good for local experimenting without installing PHP/Node on the host at all.

For a pure production stack (without the override), run it explicitly with `-f`:

```bash
docker compose -f docker-compose.yml up -d
```

---

## Migrating Data from an Old Installation

The `.sql` backup format from the Admin Settings page (`DatabaseBackupController`) is already driver-aware (SQLite/MySQL/Postgres: different identifier quoting and different ways to toggle FK checks), but the most robust way to move between **three** different engines at once is the new `malas:migrate-data` command. It copies data row by row through the Laravel query builder (not via SQL text), so it does not care at all about SQL dialect differences between SQLite/MySQL/Postgres.

**When to use:** you already have an old installation (native, SQLite dev or MySQL prod) and want to move to the Postgres in this Docker setup without losing data.

### Option 1 — via `deploy-docker.sh` (easiest)

The fresh-install script above automatically asks "Any old data to copy?" in the last step before caching. Answer `y`, enter the source connection name (`sqlite` or `mysql`), and make sure that source connection's config exists in the `app` container's `.env` (if the source is a separate MySQL server, add the `DB_HOST`/`DB_USERNAME`/etc. env vars for the `mysql` connection before continuing; Laravel already has a `mysql` connection in `config/database.php`, it just needs to be filled in).

### Option 2 — manual, any time after the stack is running

```bash
cd deploy
docker compose exec app php artisan malas:migrate-data --from=sqlite --to=pgsql --truncate
```

Options:
- `--from`: the source connection name (`sqlite`, `mysql`, or another connection registered in `config/database.php`)
- `--to`: the destination connection name, default `pgsql`
- `--truncate`: empty the destination tables before copying (safe to use repeatedly/re-run if the migration fails midway)
- `--chunk=500`: number of rows per insert batch, raise it if the data is large

This command copies **all** tables (including `users`, unlike the regular `.sql` backup which deliberately skips `users` because they are managed by SSO), which suits a full cutover to the new database. Run `php artisan migrate` on the destination side first (already done automatically by `deploy-docker.sh`) so all tables exist before copying.

**After the data migration finishes**, manually check the row counts of key tables (`series`, `collections`, `users`) on both sides before considering the cutover complete and shutting down the old installation.

---

## Updating the Code

```bash
cd /opt/malas
bash deploy/update-docker.sh
```

Does a `git pull`, rebuilds the image, restarts the containers, runs new migrations (if any), rebuilds caches, and restarts the queue worker, the same pattern as the native `deploy/update.sh`.

---

## HTTPS / Public Domain Access

Same as the native method (see [`docs/DEPLOYMENT.md`](DEPLOYMENT.md#after-deploy-access-via-domain)): the nginx container only listens on the HTTP port (`APP_PORT`, default `8080`). For HTTPS:

- **Cloudflare Tunnel (recommended, no public IP)**: install `cloudflared` on the host (LXC/VM), not inside a container, and point the tunnel at `http://localhost:${APP_PORT}`.
- **Certbot/another reverse proxy on the host**: if you have a public IP, put another Nginx/Caddy/Traefik on the host that reverse-proxies to `http://localhost:${APP_PORT}`, and handle SSL there.

> **IMPORTANT (Reverse Proxy / Cloudflare Tunnel & Mixed Content)**:
> When the app is accessed over HTTPS through a tunnel/reverse proxy while the Nginx container listens over HTTP, the `deploy/nginx.conf` config **must** forward the FastCGI HTTPS parameters:
> ```nginx
> fastcgi_param HTTPS on;
> fastcgi_param HTTP_X_FORWARDED_PROTO https;
> ```
> Without these parameters, Laravel and the Ziggy library on the frontend will assume `http://`-based URLs, so the browser blocks navigation requests (sidebar / Quick Search `⌘K`) because of the *Mixed Content* policy.

---

## Troubleshooting

### `docker compose` fails, "Cannot connect to the Docker daemon"

The Docker service is not running or the user is not in the `docker` group:
```bash
sudo systemctl start docker
sudo usermod -aG docker $(whoami)   # then log out/in again
```

### The `db` database never becomes "healthy"

```bash
docker compose logs db
```
The password in `deploy/.env` (`DB_PASSWORD`) must be filled in before `db` starts for the first time. If the `db` container was ever created with a different password, the `db-data` volume keeps the old password. Delete the volume if you really want a total reset (**data is lost**):
```bash
docker compose down -v
```

### Error 500, check the log

```bash
docker compose exec app tail -n 50 storage/logs/laravel.log
```

### Backup upload fails (large file)

`upload_max_filesize`/`post_max_size` are already raised to 128M in the image (`deploy/Dockerfile`). If it still fails, also check the limit on any reverse proxy in front of the nginx container.

### Storage/cover images don't show up

```bash
docker compose exec app php artisan storage:link
```
The symlink needs write permission on `public/`. This is already handled in the `Dockerfile` (`chown` to the non-root `malas` user), but if you have ever overridden this image, make sure `public/` is owned by the user running PHP-FPM.

### Sidebar Menu & Quick Search (`⌘K`) Can't Be Clicked (Mixed Content)

- **Symptom**: Sidebar menus do not respond to clicks, the Quick Search (`⌘K`) dialog cannot navigate to other pages, and the browser console shows:
  `Mixed Content: The page at https://... was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint http://.... This request has been blocked.`
- **Cause**: Ziggy on the frontend renders routes with the `http://` protocol because the local Nginx does not forward the HTTPS status to PHP-FPM.
- **Fix**:
  1. Make sure `deploy/nginx.conf` contains:
     ```nginx
     fastcgi_param HTTPS on;
     fastcgi_param HTTP_X_FORWARDED_PROTO https;
     ```
  2. Make sure the `.env` file uses the HTTPS protocol:
     ```dotenv
     APP_URL=https://<domain>
     SSO_REDIRECT_URI=https://<domain>/auth/callback
     ```
  3. Reload Nginx and clear the caches:
     ```bash
     docker compose exec nginx nginx -s reload
     docker compose exec app php artisan config:clear
     docker compose exec app php artisan route:clear
     docker compose exec app php artisan view:clear
     ```

### Admin Menu & Sidebar Completely Empty

- **Symptom**: After a fresh deploy / new database migration, the sidebar shows no menus or the admin menu is missing.
- **Cause**: Malas navigation is dynamic from the database (`menus` and `roles` tables). If a new database is migrated without seeding, those tables are still empty.
- **Fix**:
  Run the role and menu seeders:
  ```bash
  docker compose exec app php artisan db:seed --class=RoleSeeder --force
  docker compose exec app php artisan db:seed --class=MenuSeeder --force
  docker compose exec app php artisan cache:clear
  ```

### SSO Login Error 500 (`Invalid key supplied` / Passport)

- **Symptom**: When clicking SSO login, a 500 error or the message `LogicException: Invalid key supplied at CryptKey.php` appears.
- **Cause**: The SSO server instance does not yet have Passport encryption keys (`storage/oauth-private.key` and `oauth-public.key`).
- **Fix**:
  In the SSO server container (`sso-yado`), run:
  ```bash
  docker compose exec app php artisan passport:keys
  ```
