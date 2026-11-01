# Malas — Deployment Guide

> This document covers how to deploy Malas natively (without Docker) to various environments: **Local Server**, **AWS EC2**, and **Azure VM**, using either the automated script or manual steps. For deploying via Docker (Postgres, generic for Proxmox LXC/VM or any Linux), see [`docs/DOCKER.md`](DOCKER.md), a separate document.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Method 1: Automated with deploy/deploy.sh](#method-1-automated-with-deploydeploysh)
- [Method 2: Manual Step-by-Step](#method-2-manual-step-by-step)
- [Platform: AWS EC2](#platform-aws-ec2)
- [Platform: Azure VM](#platform-azure-vm)
- [Platform: Local Server (VPS / Bare Metal)](#platform-local-server-vps--bare-metal)
- [After Deploy: Access via Domain](#after-deploy-access-via-domain)
- [Updating the Code (deploy/update.sh)](#updating-the-code-deployupdatesh)
- [Troubleshooting](#troubleshooting)

> **Method 3 (Docker, Postgres-based)** is in a separate document: [`docs/DOCKER.md`](DOCKER.md).

---

## Prerequisites

All platforms require:

| Component | Minimum Version |
|-----------|-----------------|
| Ubuntu Server | 24.04 LTS |
| PHP | 8.2+ |
| MySQL | 8.0+ |
| Node.js | 20+ |
| Composer | 2.x |
| Nginx | latest |
| Supervisor | latest; required for the queue worker (storage migration, backup, etc.) |

Before you start, make sure you have:
- SSH access to the server
- The Malas repo cloned onto the server
- Yado SSO credentials (`SSO_CLIENT_ID` and `SSO_CLIENT_SECRET`)
- (Optional) A domain already pointed at the server

---

## Method 1: Automated with deploy/deploy.sh

The fastest way. One script handles everything.

### Steps

**1. Clone the repo onto the server**

```bash
git clone https://github.com/USERNAME/malas.git /var/www/malas
cd /var/www/malas
```

If the repo is private, set up an SSH key first:

```bash
# Generate a key (if you don't have one)
ssh-keygen -t ed25519 -C "server-deploy"
cat ~/.ssh/id_ed25519.pub
# Add the output above to GitHub → Settings → Deploy Keys
git clone git@github.com:USERNAME/malas.git /var/www/malas
```

**2. Run the script**

```bash
cd /var/www/malas
bash deploy/deploy.sh
```

The script will:
- Install PHP 8.2, MySQL 8, Nginx, Node 20, Composer, Supervisor
- Create the MySQL database and user
- Set up the `.env` file (the script asks for the domain, DB credentials, SSO credentials)
- Run `composer install`, `npm run build`
- Migrate the database + seed menus
- Configure Nginx automatically
- Configure the queue worker (Supervisor), needed for queued jobs such as automatic storage file migration when the driver is changed
- Print instructions for domain setup

**3. Follow the instructions at the end of the script**

The script prints two options for domain access: Cloudflare Tunnel or direct SSL. See the [After Deploy](#after-deploy-access-via-domain) section.

---

## Method 2: Manual Step-by-Step

Use this if you want full control or the script failed midway.

### 1. Install system dependencies

```bash
sudo apt update
sudo apt install -y nginx mysql-server supervisor \
    php8.2 php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml \
    php8.2-bcmath php8.2-curl php8.2-zip php8.2-intl \
    unzip curl git

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

### 2. Clone the repo

```bash
git clone https://github.com/USERNAME/malas.git /var/www/malas
cd /var/www/malas
```

### 3. Configure MySQL

```bash
sudo mysql
```

```sql
CREATE DATABASE malas_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'malas'@'localhost' IDENTIFIED BY 'PASSWORD_KUAT_DISINI';
GRANT ALL PRIVILEGES ON malas_prod.* TO 'malas'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Set up .env

```bash
cp .env.example .env
nano .env
```

Values that must be changed:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://domain-kamu.com
APP_KEY=                          # will be generated in the next step

LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=malas_prod
DB_USERNAME=malas
DB_PASSWORD=PASSWORD_KUAT_DISINI

SESSION_ENCRYPT=true

SSO_CLIENT_ID=isi_dari_yado
SSO_CLIENT_SECRET=isi_dari_yado
SSO_REDIRECT_URI=https://domain-kamu.com/auth/callback
```

### 5. Install dependencies & build

```bash
composer install --no-dev --optimize-autoloader
npm ci
npm run build
```

### 6. Generate key & migrate

```bash
php artisan key:generate
php artisan migrate --force
php artisan db:seed --class=MenuSeeder --force
php artisan storage:link
```

> After the first deploy, configure **Storage** (`/admin/settings` Storage tab), **AI** (AI tab; the default provider is `puter` and needs no API key, so just leave it if you don't want Gemini/OpenAI/Claude), and **Email** (Email tab; the Resend API key, needed if you want the "Login Without SSO" feature to send magic links; if left empty, this feature silently sends nothing, without an error) through the admin UI, not `.env`. No additional env vars are required for i18n, wishlist, public profile, RanobeDB, or login without SSO; they all work once the migration finishes.

### 7. Cache for production

```bash
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan optimize
```

### 8. Set permissions

```bash
sudo chown -R www-data:www-data /var/www/malas/storage /var/www/malas/bootstrap/cache
sudo chmod -R 775 /var/www/malas/storage /var/www/malas/bootstrap/cache
```

### 9. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/malas
```

```nginx
server {
    listen 80;
    server_name domain-kamu.com;
    root /var/www/malas/public;
    index index.php;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/malas /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl enable nginx php8.2-fpm mysql
```

### 10. Configure the queue worker (Supervisor)

Required: queued jobs (automatic storage file migration when the driver is changed, etc.) never run without an active worker.

```bash
sudo nano /etc/supervisor/conf.d/malas-worker.conf
```

```ini
[program:malas-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/malas/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
numprocs=1
user=www-data
redirect_stderr=true
stdout_logfile=/var/www/malas/storage/logs/worker.log
stopwaitsecs=3600
```

```bash
sudo systemctl enable supervisor
sudo systemctl restart supervisor
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start malas-worker:*
```

Check its status:
```bash
sudo supervisorctl status malas-worker:*
```

---

## Platform: AWS EC2

### Instance Setup

1. Launch an instance: **Ubuntu Server 24.04 LTS**, type `t3.small` (minimum) or `t3.medium` (recommended)
2. Storage: at least 20 GB GP3
3. Security Group: open these ports:

   | Port | Protocol | Source |
   |------|----------|--------|
   | 22 | TCP | Your IP (for SSH) |
   | 80 | TCP | 0.0.0.0/0 |
   | 443 | TCP | 0.0.0.0/0 |

4. Download the `.pem` key pair

### Connect to the Instance

```bash
chmod 400 key-pair.pem
ssh -i key-pair.pem ubuntu@<EC2_PUBLIC_IP>
```

### Clone & Deploy

```bash
git clone https://github.com/USERNAME/malas.git /var/www/malas
cd /var/www/malas
bash deploy/deploy.sh
```

### Domain

- In AWS Route 53 or your DNS provider: create an **A record** pointing to the EC2 Elastic IP
- Use an Elastic IP (not a regular Public IP) so the IP does not change when the instance restarts

```bash
# Attach the Elastic IP in the AWS Console first, then:
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domain-kamu.com
```

### AWS Tips

- Enable **AWS Backup** or take EBS snapshots regularly
- Consider **RDS MySQL** for a more reliable production database (change `DB_HOST` in `.env` to the RDS endpoint)
- For file storage, you can already use **S3** directly; configure it via the Admin → Storage page

---

## Platform: Azure VM

### VM Setup

1. Create a VM: **Ubuntu Server 24.04 LTS**, size `B2s` (minimum) or `B2ms` (recommended)
2. Disk: at least 30 GB Premium SSD
3. Open ports under **Networking → Inbound port rules**:

   | Port | Protocol |
   |------|----------|
   | 22 | TCP |
   | 80 | TCP |
   | 443 | TCP |

### Connect to the VM

```bash
ssh azureuser@<VM_PUBLIC_IP>
```

### Clone & Deploy

```bash
git clone https://github.com/USERNAME/malas.git /var/www/malas
cd /var/www/malas
bash deploy/deploy.sh
```

### Domain

In Azure DNS or an external DNS provider: create an **A record** to the VM's Public IP.

```bash
# Install SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domain-kamu.com
```

### Azure Tips

- Use a **Static Public IP** (not Dynamic) so the IP does not change
- For storage, you can use S3-compatible **Azure Blob Storage**; configure it via the Admin → Storage page with the Azure Blob endpoint

---

## Platform: Local Server (VPS / Bare Metal)

Suitable for a server at home / the office connected to the internet, or an internal lab.

### If you have a public IP

Deploy the same way as above, then set up the domain:
```bash
sudo certbot --nginx -d domain-kamu.com
```

### If you have no public IP (NAT/ISP blocks ports)

Use **Cloudflare Tunnel**: no public IP or router port opening needed:

```bash
# 1. Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 2. Log in to Cloudflare (open the link in a browser)
cloudflared tunnel login

# 3. Create the tunnel
cloudflared tunnel create malas

# 4. Point the domain at the tunnel
cloudflared tunnel route dns malas domain-kamu.com

# 5. Run the tunnel (automatic HTTPS, no certbot needed)
cloudflared tunnel run --url http://localhost:80 malas
```

**Make it a service so it starts automatically on boot:**

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Update `APP_URL` in `.env`:
```env
APP_URL=https://domain-kamu.com
```

Then rebuild the cache:
```bash
php artisan config:cache
```

---

## After Deploy: Access via Domain

Two options for HTTPS:

### Option A: Cloudflare Tunnel (recommended for all cases)
- No public IP needed
- Automatic HTTPS via Cloudflare
- Free (Cloudflare Free plan)
- Instructions are in the [Local Server](#if-you-have-no-public-ip-natisp-blocks-ports) section above

### Option B: Certbot SSL (needs a public IP & a domain already pointed at it)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domain-kamu.com
# Auto-renew is already set up by certbot
```

Once SSL is active, update `.env`:
```env
APP_URL=https://domain-kamu.com
SSO_REDIRECT_URI=https://domain-kamu.com/auth/callback
```

Rebuild the cache:
```bash
php artisan config:cache
```

---

## Updating the Code (deploy/update.sh)

Whenever there is new code on GitHub, run this from the server:

```bash
cd /var/www/malas
bash deploy/update.sh
```

This script will:
1. `git pull origin main`
2. Update Composer if `composer.lock` changed
3. Rebuild the frontend if anything under `resources/` changed
4. Run any new migrations (does not overwrite existing data)
5. Clear & rebuild all caches
6. Restart the queue worker (`php artisan queue:restart`) so the worker uses the latest code
7. Enable maintenance mode during the process, and disable it afterward

### Manual update (if not using the script)

```bash
cd /var/www/malas
php artisan down
git pull origin main
composer install --no-dev --optimize-autoloader
npm ci && npm run build
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan queue:restart
php artisan up
```

---

## Troubleshooting

### Error 500 after deploy

```bash
# Check the Laravel log
tail -n 50 /var/www/malas/storage/logs/laravel.log

# Make sure .env is correct
php artisan config:clear
php artisan config:cache
```

### Images don't show up (403)

```bash
# Make sure the storage symlink exists
ls -la /var/www/malas/public/storage
# Should point to ../storage/app/public

# If missing:
php artisan storage:link
```

### Permission denied in storage

```bash
sudo chown -R www-data:www-data /var/www/malas/storage /var/www/malas/bootstrap/cache
sudo chmod -R 775 /var/www/malas/storage /var/www/malas/bootstrap/cache
```

### Nginx 502 Bad Gateway

```bash
# Check PHP-FPM
sudo systemctl status php8.2-fpm
sudo systemctl restart php8.2-fpm

# Check the nginx log
sudo tail -n 30 /var/log/nginx/error.log
```

### Migration failed

```bash
# See the migration status
php artisan migrate:status

# Roll back 1 step if needed
php artisan migrate:rollback

# Never use migrate:fresh in production!
```

### Storage migration / queued jobs not running

Jobs such as the automatic file migration when the storage driver is changed need an active queue worker via Supervisor.

```bash
# Check the worker status
sudo supervisorctl status malas-worker:*

# If it is not running / does not exist yet, set it up first; see the "Configure the queue worker (Supervisor)" section
# in Method 2: Manual Step-by-Step, or re-run bash deploy/deploy.sh

# Restart the worker manually
sudo supervisorctl restart malas-worker:*

# Check the worker log if jobs keep failing
tail -n 50 /var/www/malas/storage/logs/worker.log
```

### SSO login not working

Make sure `SSO_REDIRECT_URI` in `.env` is **exactly the same** as the one registered in the Yado dashboard:

```env
SSO_REDIRECT_URI=https://domain-kamu.com/auth/callback
```

After changing `.env`:
```bash
php artisan config:cache
```

### SSO down / completely unreachable — emergency access

If Yado is truly unreachable (down, migration, scheduled maintenance), there are two ways in that do not go through SSO. **Both still require identity verification**; there is no unconditional bypass (see [`PHASES.md`](PHASES.md) Phase 16 for the design rationale):

**1. Self-service via email (for any user, not just admins)**

- Login page (`/`) → click the "Login" button → the "Sign in to Malas" modal appears with 2 equal options: "Login with Yado" or "Login with Email". This is no longer just an emergency path; it is now a daily login option that is always available, so users don't have to wait for SSO to go down to try the email path.
- The user picks "Login with Email" → enters the email they normally log in with → if registered, a one-time magic link (15 minutes) is sent by email. The standalone `/auth/fallback` page also remains as a direct link.
- **Requirement:** the Email provider (Resend) must already be configured at `/admin/settings` Email tab. If the `api_key` is not filled in, this feature silently sends nothing (no error to the user, but no help either). Configure this **before** SSO is actually needed, not when it happens.
- **Note**: logging in via email does NOT re-sync the profile (name/avatar/username); that only happens when logging in via SSO. This is deliberate, not a bug.

**2. CLI, for admins/operators with server access only**

If you need to get in fast without waiting for email (or the mail service has not been configured yet), SSH into the server and run:

```bash
php artisan sso:emergency-login super_admin
```

- The argument can be a role (`super_admin`, `admin`, `user`; `superadmin` without the underscore also works) or a specific email/username, e.g. `php artisan sso:emergency-login admin@domainmu.com`.
- If more than one user has the same role, the command shows an interactive list of choices; it does not just pick one.
- The command first shows who will be granted access and asks for confirmation (`y/N`) before issuing the link.
- The output is a URL ready to open in a browser, valid for 15 minutes, single-use (the token and mechanism are exactly the same as the email magic link above; only the issuing path differs, from the CLI rather than a form).
- **Why this is safe to run without an extra gate:** the only requirement to run this command is SSH access to the server itself, which is already equivalent to direct database access. No public endpoint issues tokens this easily.
- Every issued link (from email or CLI) is recorded in the admin Activity Log (`auth.fallback_requested` / `auth.emergency_login_issued`), so there is a trail of when and for whom this emergency access was ever used.

**Do not** create any other bypass path beyond these two (e.g. automatic login based on an email pattern like `admin@domain`); anyone who knows your app's domain could guess it, opening an account takeover hole with no verification at all.
