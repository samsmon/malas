# Changelog

All notable changes to Malas are recorded in this file. The format follows the principles of [Keep a Changelog](https://keepachangelog.com/), simplified for internal history (no numbered releases).

---

## 2026-09-18 — Prod Data Migration, Nginx Performance Tuning, Landing Header Fix, & Multi-Account SSO

- **Full Data & Collection Migration to Production (`yado-hosts` LXC 101)**:
  - Moved all operational data into the production PostgreSQL 16: 2 users (Super Admin and user `sehnauoi` with `sso_id: 3`), 114 series, 773 volumes, all 39 comic collections (149 volumes owned/read by `sehnauoi`), 1 collection group "RomCom" (`sehnauoi-romcom`), 12 group items, 11 wishlist items, loan history, encryption settings, 2 tickets, and 86 activity logs.
  - Synced 363 comic cover media files (~51 MB) into the Docker named volume `malas_storage`, plus a `public/storage -> /var/www/html/storage/app/public` symlink so Nginx serves media files directly with HTTP 200.
  - Synced the `APP_KEY` environment value so the database encryption for the Gemini API key and Resend email settings decrypts cleanly (`DECRYPTED_OK`).
- **Nginx Performance Optimization (Gzip & Immutable Caching)**:
  - Diagnosed slow load times: the PHP/database backend responded very quickly (~20 ms), but the Vite JavaScript bundle (610 KB) and cover assets were served raw, with no compression and no browser cache headers, through the Cloudflare Tunnel.
  - Enabled Gzip compression (level 6, min-length 256 bytes) in `deploy/nginx.conf` for all text, JSON, CSS, and JavaScript types.
  - Added the header `Cache-Control: public, max-age=31536000, immutable` for bundle assets in `/build/assets/` (1 year) and 30 days for comic covers in `/storage/covers/`.
  - JavaScript bundle transfer size dropped from **610 KB** to **192 KB** (~68.5% smaller), giving `cf-cache-status: HIT` on the Cloudflare CDN and 0 ms loads from the browser memory/disk cache on later navigations.
- **Landing Page Header UI Fix**:
  - Fixed the header and footer layout in `resources/js/Pages/Landing.tsx`: the `<header>` and `<footer>` containers changed from `max-w-5xl` to `max-w-3xl mx-auto` so they line up with the main hero card in `<main>`, fixing the Login button and switchers sitting too far to the right.
  - Added the props `size`, `side`, `align`, and `className` to `LanguageSwitcher.tsx` and `ThemeSwitcher.tsx` so they can render compact (`size="icon-sm"`, `side="bottom"`, `align="end"`) in the header navbar.
- **Multi-Account Linking via SSO (`prompt=login`)**:
  - The "Add Account" modal (`LoginMethodDialog` with `mode="link"`) and `SsoController::redirect()` now forward the `prompt=login` parameter to Yado SSO.
  - Ensures that authenticating the target account forces a fresh login on the SSO side without being held by the previous account's session, then links it to the `linked_account_ids` session in Malas so users can switch accounts (`AccountSwitcher`) instantly without repeated re-auth.

---

## 2026-08-30 — Volume Covers: Built, Then Removed Entirely, Replaced by Similar-Series Recommendations

- **Original request**: find covers per volume automatically — open the series edit page, scrape all books matching the title being edited, and take only the Japanese edition so the covers are full (not cropped like local/Western editions).
- **Data source changed completely midway**: it was first built on the Google Books API. The user reported the results as "totally random, nothing matches". A direct investigation (not a guess) proved three stacking limitations of Google Books: (1) `q` does full-text search across ALL book data, not just titles, (2) the `intitle:` operator PROVED unreliable for multi-word titles (even `intitle:"Harry Potter"` returned zero results), (3) its catalog barely indexes popular manga from major Japanese publishers at all. Alternatives tried and rejected: Google Custom Search JSON API (blocked by GCP permissions), Rakuten Books API (needs a new API key registration), openBD.jp (no title search endpoint and an empty cover field), Penguin Random House API (Western catalog, wrong target). Finally moved to **SerpApi Google Images** (`engine=google_images`, `google_domain=google.co.jp`) — results were relevant, but it hit the free quota limit (250 searches/month) quickly when used for bulk auto-fill of covers for one series.
- **Redesigned several times**: from bulk-assigning one search to the whole series → per-volume single-pick with ◀ ▶ navigation → bulk auto-fill (the option "search automatically, take the first result, show a progress bar, review afterwards"), which first ran server-side (failed with "failed to reach server", turned out to be a PHP timeout because one request looped N times over API fetch + synchronous image download) and was then fixed into a client-side loop calling the same search/apply endpoints as manual mode.
- **Final decision: removed ENTIRELY**, not fixed again. After rethinking, the core of this app is only tracking reading progress and ownership (physical/digital) — not a per-volume image gallery, so the whole concept of covers at the `Volume` level (manual upload/URL, AniList single-pick, SerpApi auto-search, bulk auto-fill) was cleanly removed: the `volumes.cover_path` column was dropped (migration), `SerpApiService`/`SerpApiSettingsService`/`SerpApiSetting`/`SerpApiSettingController` files were deleted (the "SerpApi" tab in Admin Settings went with them), `VolumeGrid.tsx` was deleted, and `VolumeController` was trimmed back to just `generate`/`store`/`edit`/`update`/`destroy`/`restore` with no file handling. Covers at the **Series** level (series posters) were not touched — they remain as before.
- **The "Volume (0), No volumes yet" section on the Catalog detail page** (which became empty once covers were removed) was replaced with a **"You Might Like"** section — recommending 12 series with the same genre (OR-match, same pattern as the Catalog Index genre filter), falling back to series of the same type if this series has no genre data, displayed with the same `SeriesCard` as the Catalog Index. Verified directly against the dev DB (not just by reading code) — both the genre-match and type-fallback queries were tested and produced relevant recommendations.
- **The volume grid card in My Collection** was affected too (its cover area used to be just a number on an empty box) — the center area became a big `Eye`/`EyeOff` icon button as the main read/unread toggle, and the old small corner icon was removed (redundant).
- Along the way, bugs in local tooling (not feature code) were also found and fixed: the testing harness (`.claude/php-dev.bat`) had no SSL CA bundle, and `searchCovers()` failed to catch an exception. Both fixes were removed together with the feature code they supported.

---

## 2026-08-28 — Three My Collection Views (Grid/Compact/Table) + Tag Tree Filter in Catalog

- **My Collection — view toggle became a single sliding control**: the two separate grid/table buttons were replaced with one pill with a CSS sliding indicator (`ViewToggle`), adding a third **Compact** view (dense text-only rows). The card grid was enlarged (160px → 190px min-width) so the hover overlay is not cramped.
- **Desktop hover overlay (grid & compact)**: reading progress, +/- stepper, "Mark all as read", and the "Continue to Vol. X" button appear on hover (`opacity-0`/`group-hover:opacity-100`, only at `md:` and up) — previously there was only a plain stepper.
- **Mobile adaptation**: hover does not exist on touch devices, so on mobile all the controls above are always visible (not waiting for hover) — the grid card shows progress+stepper+menu below the cover (not an overlay on top of the cover), and the compact row becomes 2 lines. A new `⋮` menu (`RowActionsMenu`, 4-item dropdown: View Details/Continue to Vol X/Mark all as read/Delete) closes the access gap for actions that on desktop only appear on hover.
- **Animation**: uses Tailwind/`tw-animate-css`, already the standard in this project (toggle indicator slides via `transform`, overlay fade/translate, `active:scale-90/95` on buttons) — deliberately **not** adding Anime.js because every animation need here is pure CSS transition/transform and needs no JS orchestration.
- **Skeleton loading**: `GridSkeleton`/`CompactSkeleton`/`TableSkeleton` were added for the "Refresh" state, replacing the previous blank state.
- **Tag Filter (tree per category) in Catalog** — piggybacks on the same "Genre Filter" popover (not a new button) so the filter bar doesn't get longer. AniList tag data (name + category, e.g. "Isekai" → "Theme-Reincarnation") was **already** fetched from the start (used to generate `themes`/`demographics`) but then discarded — now it is stored in full (filtered to minimum rank 60 on the AniList relevance scale, non-spoiler) into the new column `series.tags` (flat array of names, used with `whereJsonContains` — same pattern as `genres`) and `series.tag_categories` (name→category map, only used to build the tree, NEVER part of a WHERE clause). One data source (AniList) as the user requested — old series need a re-sync ("Sync AniList" in Edit Series) to fill these fields.
- Tag categories are turned into a tree from the part before the first hyphen in the raw AniList category ("Theme-Reincarnation" → parent "Theme"), collapsible but still fully rendered in the DOM so the same search box can still filter tags inside collapsed categories.
- Verified end-to-end with a real browser + HTTP: sliding indicator, hover overlay hidden by default (checked via computed style), mobile breakpoint (resized to 375px, checked `offsetParent` to account for ancestor `display:none`, not just the element's own computed style), the 4-item dropdown actually clicked and its contents correct, and the tag filter in Catalog actually filters results (tested with 2 dummy series with different tags, filter results matched exactly).
- **Bug found during verification** (not in this feature's code): the `.claude/launch.json` "Laravel Dev" config pointed to a bare `php` that does not resolve in this environment — fixed with a wrapper script (`.claude/php-dev.bat`, gitignored, local only) that calls Herd's PHP with the required extension flags.
- **Fix: the My Collection grid hover overlay overlapped the info panel below it** — `AdultBlurOverlay` turned out to create its own `div.relative` for the cover, so the hover overlay written as its sibling (not child) was not clipped by that cover's `overflow-hidden`; the overlay, which was `absolute inset-x-0 bottom-0` (open height, only anchored to the bottom), could become taller than the cover box when it had a lot of content. A real bug found by the user through a screenshot, not caught by the earlier computed-style verification (which only checked opacity/pointer-events, not the bounding box). Fix + simplification (follow-up user feedback): the outer overlay wrapper stays `absolute inset-0` for safety (clamped exactly to the cover), but the wrapper itself is transparent — the dark background+blur moved into an auto-height inner panel, so visually it only covers the bottom part of the cover (not the whole image), exactly like the original design. Also removed: the (+/-) stepper that was always shown in the info panel under the genre badge (redundant with the stepper in the overlay), and the "Mark all as read" button and "⋮" trigger inside the overlay (both are already reachable via right-click/the mobile dropdown) — the overlay is now much more compact (just progress+stepper+continue-reading button).
- **Right-click (context menu) added to My Collection grid & compact views** — previously only the table view had it, and with only 2 items. Now all three views (grid/compact/table) share the same menu contents (`RowContextMenuItems`, 4 items: View/Continue to Vol X/Mark all as read/Delete) — exactly the same as the existing "⋮" dropdown, consistent with the right-click pattern already used in `Admin/Series/Index.tsx`.
- **New document `docs/API.md`** — a complete reference of all Laravel routes (method, path, route name, controller@action, access level, response type: Inertia page/JSON/Redirect/File download), generated from `php artisan route:list` + return-type detection from controller source (not just guessing from route names). It is **not** a formal OpenAPI/REST specification — Malas is an Inertia app, not an API for external consumers, so this is purely an internal reference. Linked from README.md/README.id.md.

---

## 2026-08-23 — Docker Deploy (Postgres) + Deploy File Structure Cleanup

- **User request**: add a third deploy method (Docker, generic for Proxmox LXC/VM but portable to any Linux), with a fully Postgres database (for consistency with the other microservices), make sure old data is copied into the new database, and tidy up the messy infrastructure files in the root.
- **`DatabaseBackupController` is now 3-driver-aware** (SQLite/MySQL/Postgres): added a Postgres branch in `getBackupTables()` (`pg_catalog.pg_tables`) and `fkChecksStatement()` (`SET session_replication_role = replica/origin` — Postgres has no global FK toggle like MySQL/SQLite). Identifier quoting in the SQL dump now follows the active driver (backticks for MySQL/SQLite, `"double quote"` for Postgres) through the new helpers `identifierQuoteChar()`/`quoteIdentifier()`.
- **New command `php artisan malas:migrate-data --from= --to=`** (`MigrateDatabaseData.php`) — for data migration during a DB engine cutover (e.g. old SQLite/MySQL → new Postgres). Copies data row by row through the Laravel query builder (`cursor()` + `array_chunk`), not through SQL dump text — so it is fully driver-agnostic, regardless of SQL dialect differences between the three engines. Unlike a regular `.sql` backup (which deliberately skips the `users` table), this command copies **all** tables because it is meant for a full cutover.
- **New Docker stack** (`deploy/`): `Dockerfile` (multi-stage: Node asset build → Composer install → PHP-FPM runtime, extensions `pdo_pgsql`/`gd`/`intl`/etc.), `docker-compose.yml` (services `app`, `queue`, `nginx`, `db`=Postgres 16), `docker-compose.override.yml` (local dev: bind-mount source + a `vite` service for HMR), `nginx.conf`, `.env.docker.example`.
- **Script `deploy/deploy-docker.sh`** — generic, only needs Docker Engine + the Compose plugin on the host (Proxmox LXC/VM or any Linux, **not** using the Proxmox API at all): sets up `.env`, generates `APP_KEY`, builds and runs the stack, migrates+seeds, offers to migrate old data (calls `malas:migrate-data`), then caches for production. `deploy/update-docker.sh` updates code on a running deploy (same pattern as the native `update.sh`).
- **File structure tidy-up**: `deploy.sh`/`update.sh` (native, existing) moved to `deploy/deploy.sh`/`deploy/update.sh` (the `$SCRIPT_DIR` path resolution was updated to `cd` up one level, since they are now one folder deeper than the root). The project root is now clean — every deploy method lives in one place under `deploy/`. Path references updated in `README.md`, `README.id.md`, `docs/DEPLOYMENT.md`.
- **New document `docs/DOCKER.md`** — a complete guide to the Docker method: when to use it vs native, prerequisites (including the nesting note for unprivileged Proxmox LXC), migrating data from an old install, code updates, HTTPS, troubleshooting.
- **New `.dockerignore`** — without it, `COPY . .` in the Dockerfile also copies the local `bootstrap/cache/*.php` (gitignored, but present on the dev disk) which still references `Laravel\Breeze\BreezeServiceProvider` from `require-dev` — making `composer dump-autoload` fail completely in the `vendor` stage because Breeze is not installed with `--no-dev`. Found directly while building the real image, not just by reading code.
- **Permission bug found & fixed**: the non-root `malas` user in the runtime image was initially only `chown`ed for `storage/` and `bootstrap/cache/`, not `public/` — making `php artisan storage:link` fail (`symlink(): Permission denied`) because it needs to write a new symlink inside `public/`. Fix: add `public/` to the `chown` list in the `Dockerfile`.
- **Verified end-to-end with real Docker** (not just by reading code): `docker build` succeeded, `docker compose up` ran app+queue+nginx+db, 44 migrations ran cleanly on real Postgres (zero SQL dialect issues — all of this app's queries already go through Eloquent/the query builder, only `DatabaseBackupController` has raw SQL), `storage:link`+seed succeeded after the permission fix, the landing page returned 200 through nginx→PHP-FPM→Postgres, login via magic link succeeded, the Postgres backup download produced a valid `.sql` (`SET session_replication_role = replica;` + `"double-quoted"` identifiers), the re-import returned 302 successfully with zero new log errors, and a re-download afterwards was byte-for-byte identical (except timestamps) — data integrity is safe. `malas:migrate-data` was also tested separately (SQLite → SQLite scratch DB) — 34 tables, all rows copied matching the source counts.

---

## 2026-08-22 — Fix: Database Backup Download/Import 500 on SQLite (Dev)

- **Real bug reported by the user**: after the 403 fix above (`hasRole()` → `isSuperAdmin()`), accessing `/admin/settings/database/download` on `malas.test` returned 500 "An Error Occurred" — the user said the error did not appear in the log.
- **Investigation**: the error actually WAS in `storage/logs/laravel.log` (found a match at the exact timestamp of the user's request) — `SQLSTATE[HY000]: General error: 1 near "SHOW": syntax error ... SQL: SHOW TABLES`. The `malas.test` `.env` confirmed `DB_CONNECTION=sqlite` (per this project's dev convention, see `CLAUDE.md`), while `DatabaseBackupController` was written MySQL-only from the start (`SHOW TABLES`, `SET FOREIGN_KEY_CHECKS=0/1`) — neither syntax is understood by SQLite. This bug was previously completely hidden by the 403 bug (requests never reached the broken code).
- **Fix**: `getBackupTables()` now branches on `DB::connection()->getDriverName()` — SQLite uses `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`, otherwise it stays `SHOW TABLES`. The FK-check toggle (used in `download()` before/after the dump, and in `import()` before/after the transaction + in catch/rollback) is centralized in a new helper `fkChecksStatement(bool $enable)` that emits `PRAGMA foreign_keys = ON/OFF;` for SQLite or `SET FOREIGN_KEY_CHECKS=1/0;` for MySQL. `import()` also skips raw FK-check lines from the uploaded file (regex `^(SET\s+FOREIGN_KEY_CHECKS|PRAGMA\s+foreign_keys)`) and always uses the `fkChecksStatement()` matching the CURRENT active driver — deliberately designed so cross-driver backups (e.g. export from dev SQLite, import into prod MySQL) still work, since the `INSERT`/`DELETE` statements themselves are driver-agnostic.
- Verified end-to-end over HTTP (ad-hoc server + SQLite dev database, exactly the same environment as `malas.test`): `GET .../download` → 200 with a valid `.sql` file (`PRAGMA foreign_keys = OFF;` present, no longer 500), then `POST .../import` with that same file → 302 success with no new errors in the log, and `GET .../download` again after the import produced a file byte-for-byte identical (except the timestamp line) to the previous backup — proving the export→import round trip does not corrupt data.

---

## 2026-08-16 (part 4) — Fix: Database Backup Download/Import 403 for the Real Super Admin

- **Real bug reported by the user**: accessing `/admin/settings/database/download` as the real super_admin returned 403 "Access Denied".
- **Root cause**: `DatabaseBackupController::download()`/`import()` used `auth()->user()->hasRole('super_admin')` — a method from Spatie Laravel Permission. This app **never** calls `assignRole()` anywhere, so Spatie's `model_has_roles` table is always empty and `hasRole()` always returns `false`, even though the `users.role` column (which is what the whole app actually uses for Policy/menu access) was correctly `super_admin`. Two parallel authorization mechanisms that were never synchronized — the only place in the codebase using Spatie's `hasRole()` (everything else consistently uses `User::isAdmin()`/`isSuperAdmin()`, including `AiSettingController`/`MailSettingController`, whose features are identical).
- **Fix**: replace `hasRole('super_admin')` → `isSuperAdmin()` in both methods (`download()` and `import()`), consistent with the pattern already correct across the whole app.
- **Documentation root cause**: `CLAUDE.md`'s own "Authorization System" section used to suggest the `hasRole('super_admin')` pattern as an "allowed exception" — fixed, plus an explicit note added "never use Spatie `hasRole()`" so the same bug doesn't happen again in new code.
- Verified: `User::isSuperAdmin()` for the real super_admin account now returns `true` (passes `abort_unless`), confirmed directly through tinker + an HTTP request log trace (the earlier 403 is gone and the request continues into the backup logic — the remaining 500 in local testing was purely MySQL-only `SHOW TABLES` meeting the SQLite dev DB, not a bug from this fix).

---

## 2026-08-16 (part 3) — Reveal API Key/Secret in Admin Settings (Eye Icon)

- Direct user request: the three secrets on the Admin Settings page (Storage `secret_access_key`, AI `api_key`, Mail `api_key`) can now be viewed through an eye icon toggle (Eye/EyeOff), instead of being fully hidden as before (previously only `has_key`/`has_secret` booleans were sent to the frontend, and the field was always empty).
- Safe from an authorization standpoint because this page is **already** `super_admin`-only through `StorageSettingPolicy` — this reveal does not expose anything to a new audience, it just gives access back to the admin who already has full control over the value (and can reset it at any time through the same form).
- Backend (`StorageSettingController::edit()`) now sends the real `secret_access_key`/`api_key` (already auto-decrypted through the model's `encrypted` cast) to the frontend, not just the boolean `has_key`/`has_secret` (the boolean is still sent, used for the required-field marker `*`).
- Frontend: new `SecretInput` component (`Admin/Settings/Index.tsx`) — an `Input` wrapper + eye icon button that toggles `type="password"`/`type="text"`, used in three places (AI, Mail, Storage tabs) through react-hook-form's `Controller` (the field is now prefilled with the real value, not an empty string).
- The translation keys `apiKeyPlaceholder`/`apiKeySaved`/`secretAccessKeyPlaceholder` in `admin.json` (id/en/ja) became dead code after this change (no longer relevant once the field is prefilled with the real value) — removed. The card description ("API key is stored encrypted, never shown again after saving") was also updated because it was no longer accurate.
- Verified in the Browser: the AI API key field loaded with the real value (masked), clicking the eye icon → `type` changed to `text` and the real value read back exactly, clicking again → back to masked. Submitting the form without changing anything → the key stayed intact in the database (not nulled/corrupted).

---

## 2026-08-16 (part 2) — "Missing Volumes" Badge Is Clickable, Auto-Fills the Add Volume Form

- The user asked "so what do I do with it" about the "missing volumes" badge that was still merely informational — an action was added: the badge is now a `<Link>` to the collection detail page with the query param `?addVolumes=4,6-7,9-12`.
- `Collection/Show.tsx` reads that query param once in a `useEffect` on mount, immediately prefills the volume number field in the "Add Volume" form + auto-opens its dialog (no need to click the "Add Volume" button), then cleans the param from the URL bar (`window.history.replaceState`) so a refresh/browser back button doesn't trigger it again.
- The flow is now: click the badge → the "Add Volume" dialog opens right away with the missing numbers filled in → the user only picks the format → submit. From 4 steps (see the numbers, open the detail, open the dialog, retype) down to 2 (click the badge, pick the format+submit).
- Verified end-to-end in the Browser (not curl — the Browser pane tool recovered in this session): a dummy collection with 5/12 volumes → click the "7 missing" badge → the dialog opened with the input `"4, 6-7, 9-12"` exactly, URL bar clean (query param gone) → submit → the collection became 12/12.

---

## 2026-08-16 — "Missing Volumes" Badge (Next Volume to Buy) in My Collection

- New feature from a discussion ("next volume to buy") — for every collection whose `series.total_volumes` is known, the system computes the difference between `range(1, total_volumes)` and the volumes the user already owns (`CollectionVolume.volume_number`), then shows it as an amber badge `{{count}} missing` on the grid card & table row in `Collection/Index.tsx`. Hovering the badge opens a `HoverCard` showing the full numbers, compressed with the same range syntax used by the "Add Volume" form (e.g. `4, 6-7, 9-12`) through the new function `compressRanges()`.
- `total_volumes` from AniList/RanobeDB already represents volumes that have **been released** (not a projection of total planned), so no extra logic is needed to filter "not yet released" — every number in `range(1, total_volumes)` that isn't owned is automatically valid to flag as "missing". Series with a null `total_volumes` (incomplete AniList data) are skipped, not counted.
- The badge uses `stopPropagation()` so clicking/hovering it doesn't trigger navigation to the collection detail page (same pattern as the delete button and `ReadStepper` already in the same file).
- Verified through direct HTTP requests (curl, since the browser pane still had tool problems in this session) — a dummy collection with volumes `[1,2,3,5,8]` out of 12 → the server's `missing_volumes` returned exactly `[4,6,7,9,10,11,12]`; a complete collection (3/3) → empty array, no badge shown (checked via the `missing.length === 0` condition in the component).

---

## 2026-08-15 (part 5) — Collection Export/Import (Personal Backup)

- New feature at the user's request: users can export their entire collection (+ reading progress, reviews, ratings) to a JSON file and import it back. "Export"/"Import" buttons in the `Collection/Index.tsx` header.
- **Export** (`CollectionController::export()`) — `response()->streamDownload()` (same pattern as `DatabaseBackupController`), filename `malas-koleksi-{username}-{date}.json`. Each entry contains: series identifiers (`anilist_id`, `ranobedb_id`, `mal_id`, `slug` — all sent together so matching on import stays robust even if one changes or is empty), condition, acquired_at, notes, personal_rating, personal_review, and the full volume list (number, format, ebook_source, language, read_at).
- **Import** (`CollectionController::import()`) — uploads a JSON file, validates the structure (`version` + `collections` array) before touching anything, wrapped in `DB::beginTransaction()`. Series matching goes in order: `anilist_id` → `ranobedb_id` → `mal_id` → `slug`, looked up in the **local** catalog (not auto-fetching from AniList — a deliberate decision, to avoid duplicating the logic of `AniListController::import()`; if a series isn't in the local catalog yet, that entry is skipped and counted separately). Series already in the user's collection are also skipped (**append-only**, as the user confirmed — not overwrite). All volume fields (`format`/`ebook_source`/`language`) and `condition` are whitelisted through `sanitizeEnum()` before insert — the user's uploaded file is not trusted as-is. The result is reported through flash: "X imported, Y skipped (already owned or not in the catalog)".
- Verified end-to-end through direct HTTP requests (curl, not browser — the browser pane tool had problems this session): export of user A with 2 collections (including rating/review/2 volumes) → complete and accurate JSON; import into user B who already had 1 of those 2 series → only 1 new series was imported, the existing one wasn't duplicated/overwritten; an entry whose series isn't in the local catalog → skipped gracefully, no crash; an invalid/corrupt JSON file → rejected with an error message, not a 500.

---

## 2026-08-15 (part 4) — Temporarily Disable AI Funfact Generation

- At the user's request, the AI funfact generation feature (auto-generate + "Regenerate" button + funfact text) was temporarily disabled through the constant `DashboardController::FUNFACT_GENERATION_ENABLED = false`. The genre word cloud (the non-AI part of the same "Genre Taste" card) **still** displays normally — only the AI part is skipped. `regenerateFunfact()` also got a defensive 404 guard in case a stray request hits that endpoint while it's disabled. No code/data was deleted — just flip the constant back to `true` to re-enable.

---

## 2026-08-15 (part 3) — Modal Layout Fix, Collection URLs Use Titles, Confirm+Undo for Removing from Group, Puter.js Removed

- **Fix for the "Add Manga" modal layout**: the type filter was covered and the modal scrolled along with it — the root cause was that the item list div (`min-h-[360px] flex-1 overflow-y-auto`) had a 360px height floor that could be larger than the space flexbox allocated (`max-h-[85vh]` minus the header/search/filter/footer heights), so once the item grid got long enough, the whole `DialogContent` was forced taller than `max-h-[85vh]` instead of only that div scrolling — pushing the filter out of the viewport. Fix: `min-h-[360px]` → `min-h-0` (so the flex item can shrink fully to the remaining space), plus an explicit `shrink-0` on the header/search/filter/footer so they don't get compressed.
- **The `/my-collection` URL uses the series title, not a UUID** — user request "my collection URL still uses a random string, not the collection's title". New `Collection::resolveRouteBinding()`: matches through the Series slug (`whereHas('series', fn ($q) => $q->where('slug', $value))`), **restricted to collections owned by the logged-in user** (two users can both own a collection of the same series, so one `Series::slug` is "used" by many `Collection`s) — falling back to id if not found. No new `slug` column was added to the `collections` table at all, just reusing `series.slug`, which is already globally unique. Six frontend files + controllers that generate `collection.show` links were updated: `SearchController`/`GlobalSearch.tsx`, `Catalog/Show.tsx` (reuses the `series.slug` already in props, no extra query needed), `CollectionController::index()`/`Collection/Index.tsx`, `CollectionGroupController::show()`/`CollectionGroups/Show.tsx`, `DashboardController::continueReading()`/`Dashboard.tsx`, `LoanController::index()`/`Loans/Index.tsx`. Action endpoints (PATCH/POST/DELETE behind `/my-collection/{collection}/...`, not GET navigation) deliberately **still** use the raw `collection.id` — those aren't URLs the user reads or bookmarks.
- **Confirmation + Undo for removing a manga from a group** — previously the X button in `CollectionGroups/Show.tsx` called `router.delete()` straight away with no confirmation, and the success toast had no Undo button (even though the mandatory CLAUDE.md rule says all reversible actions must have Undo). Added a confirmation dialog (same pattern as the Delete Group dialog in the same file) before actually deleting, and `CollectionGroupController::removeItem()` now sends `undo_url`/`undo_payload` — a new PATCH route `collection.groups.items.undoRemove` → `undoRemoveItem()` that re-attaches the pivot (not a hard delete, so the undo is simple and doesn't need complicated payload reconstruction like `CollectionController::undoDestroy()`).
- **Puter.js removed entirely** — direct user request "let's remove the puter integration". Removed: `resources/js/lib/puter.ts` (file deleted), the `<script src="https://js.puter.com/v2/">` tag in `app.blade.php`, the "Puter" option from the AI provider dropdown (`Admin/Settings/Index.tsx`) plus the `Rule::in()` validation in `AiSettingController`, and the `provider === 'puter'` check in `AiFunfactService`. New default provider: `gemini` (replacing `puter`, but it still needs an API key — if empty it automatically falls back to `AiFunfactService::fallbackText()`, a static text from genre data, not AI). Endpoints used only for Puter's client-side generate flow — `dashboard.funfact.auto-save` and `dashboard.funfact.report-error` (plus their controller methods, `saveAutoGeneratedFunfact()`/`reportFunfactError()`) — became completely dead code once Puter was removed, and were deleted too. A new migration normalizes old `ai_settings.provider = 'puter'` rows (if any) to `'gemini'`.
- All verified through the Browser tool: the filter modal looked full + only the item grid scrolled (not the whole dialog), clicking a collection/group card navigated to `/my-collection/{series-title}`, clicking remove from group showed a confirmation dialog first, the toast after removal had an Undo button that actually restored the item, the admin AI provider tab only showed Gemini/OpenAI/Claude (Puter is gone), and the funfact "Regenerate" button still works normally (fails gracefully through the regular server path, not a crash referencing Puter).

---

## 2026-08-15 (part 2) — Wider "Add Manga" Modal + Infinite Scroll

- **The modal was actually widened**: the user request "make the add manga to group modal wider" uncovered another bug — the `max-w-7xl` set in Phase 28 was never in effect! `ui/dialog.tsx` has a built-in base style `sm:max-w-sm`, and a custom class WITHOUT the `sm:` prefix (like a bare `max-w-7xl`) loses in the Tailwind cascade once the viewport is ≥640px — the dialog had silently stayed at 384px all along. Fix: `sm:max-w-7xl` (not just `max-w-7xl`). Verified directly through `getComputedStyle` in the Browser tool — before the fix `computedMaxWidth: "384px"`, after the fix `"1280px"`.
- **Infinite scroll replaces `<Pagination>`**: explicit user request "infinite scrolling, not paginate". The "collections that can be added" list now accumulates each page's results into local state (`accumulated`), and fetches the next page automatically when scrolled near the bottom — not by clicking page numbers manually.
  - The first attempt used `IntersectionObserver` and **failed to be detected** during verification in the Browser tool — root cause: the `useEffect` that created the observer ran BEFORE the sentinel DOM was mounted (Base UI's Dialog content mounts one tick after `addOpen` becomes `true`), and the effect's dependency array never retriggered once the ref was attached. The second attempt moved to the ref-callback pattern (the observer is created when the sentinel node actually mounts) — but the observer still never fired at all in this Browser tool environment (even `observe(document.body)` never got a callback), probably because the tab wasn't compositing active frames (see the "Browser pane is not displayed" error when trying a screenshot).
  - **Final solution**: switched entirely to a regular `onScroll` handler (checking `scrollHeight - scrollTop - clientHeight < 300`) — it doesn't depend on the rendering/compositing pipeline, is easier to verify (can be triggered manually through `dispatchEvent(new Event('scroll'))`), and actually works: verified 50 dummy items loading 24 → 48 → 50 over two scrolls, each sending exactly one request (`page=2` then `page=3`), with no duplicate/excess requests after all pages ran out.
- **A similar bug likely exists elsewhere**: `Admin/Series/Edit.tsx` (`max-w-3xl`) and `User/Collection/Index.tsx` (`max-w-4xl`) also use the `max-w-*` pattern without the `sm:` prefix — not verified/fixed in this session (out of scope, flagged as a separate task). `Admin/ActivityLog/Index.tsx` was already correct from the start (`sm:max-w-2xl`).
- The "React Components" section of `CLAUDE.md` got an explicit rule about the mandatory `sm:` prefix for overriding `DialogContent` width, so this doesn't happen again.

---

## 2026-08-15 — Fix: Blank Screen Opening a Collection Group (Empty Slug + Guest Crash), Emoji-Free README

- **Bug #1 (the real root cause)**: the user had a collection group ("RomCom") created BEFORE the slug migration (Phase 28) — the `slug` column was added as `nullable()` so the migration wouldn't fail on old data, but nobody backfilled it. That group stayed saved with `slug = NULL` forever. Once the frontend (`Index.tsx`/`Show.tsx`) started generating all links using `group.slug`, the link to this group broke (`route('collection.groups.show', null)`), navigation failed → **blank screen**. This was the main cause of the user's report, not just about guests.
  - Fix: new migration `2026_08_15_090000_backfill_collection_groups_slug.php` — backfills every `collection_groups.slug` that is still NULL using `CollectionGroup::generateUniqueSlug()`, identical to the Series slug backfill (`2026_08_02_090000_add_slug_to_series_table.php`). Verified directly: the "RomCom" group got the slug `sehnauoi-romcom`, and both the Index and Show pages rendered normally after the backfill (checked using the Browser tool directly, not curl — the `href` link in Index now really points to the correct slug, and clicking through to the detail page succeeded with no JS error).
- **Bug #2**: `CollectionGroups/Show.tsx` always rendered through `UserLayout`, which assumes a logged-in user (`AccountSwitcher.tsx` accesses `auth.user!` — a non-null assertion). For a guest (not logged in) opening a **public** group, `auth.user` is `null` via `HandleInertiaRequests`, so React crashed when trying to render the sidebar/account switcher → also a blank screen, but a separate case from Bug #1 (it only affects guests, while Bug #1 affects anyone, including the logged-in owner).
  - Fix: add the `is_guest` prop from `CollectionGroupController::show()` (`$viewer === null`), then in `Show.tsx` use `Layout = is_guest ? PublicShell : UserLayout` — exactly the same pattern as `Profile/Show.tsx`. The breadcrumb to `/collection-groups` (an auth-only route) is also hidden for guests. The public/private status badge in the header now reads the real `group.is_public`, instead of always showing "Public" to non-owners (which hit the case of an admin viewing someone else's private group).
- Neither bug was caught by the Phase 27/28 verification because that verification only checked the Inertia JSON response through curl (server props correct), not an actual React render in a browser — so the NULL slug on old data & the client-side crash slipped through.
- **README.md & README.id.md overhauled** — all emoji removed (section badges, section headers, feature lists, troubleshooting/backlog bullets, "back to top" buttons) at the user's request ("don't use excessive emoji, better to have none at all"). Internal anchor links (`#troubleshooting`, etc.) were adjusted because GitHub generates different heading slugs once emoji are removed.

---

## 2026-08-14 (part 9) — Collection Groups: Bigger Modal + Pagination, Type Filter, Slug URLs, Public/Private

- **The "Add Manga" modal was enlarged & paginated** — `max-w-3xl` → `max-w-5xl`, and the list of collections that can be added is now paginated server-side (24/page, the same `Pagination.tsx` used on other list pages) so users can browse their entire collection, not just a short list loaded once and filtered on the client.
- **Type filter** (Manga/Light Novel/One Shot/Doujinshi/Manhwa/Manhua, segmented control) was added to this modal, reusing `useTypeFilterOptions()` — the same pattern as the type filter on other list pages (see the mandatory rule in CLAUDE.md).
- Search & type filter in the modal are now **server-side** (debounced `router.get` partial reload `only: ['available']`), instead of client-side filtering over a fully loaded array — manga already in the group are automatically excluded (`whereNotIn`) at the query level, not only in the UI.
- **Group URLs use a slug, not a UUID** — format `{username}-{group-name-slug}` (e.g. `/collection-groups/testowner-romcom`), generated in `CollectionGroup::generateUniqueSlug()` (same pattern as `Series::generateUniqueSlug()`), regenerated automatically when the group name changes. Falls back to id if the username hasn't been synced from SSO yet.
- **Public/Private option per group** — a `Switch` on the group detail page (owner-only). Public groups appear in a new "Public Collection Groups" section on the user's public profile (`ProfileController::publicGroups()`) and can be accessed by anyone (including guests) through the direct URL; private groups can only be seen by their owner (and admins). The route `GET /collection-groups/{group}` was moved out of the `auth` middleware group (same pattern as the public profile `/u/{user}`) — visibility is checked manually in the controller (`abort_unless($group->is_public || $isOwner || ...)`), not through middleware.
- `PublicShell` (a minimal shell for public pages without login — header + login button) was extracted from `Profile/Show.tsx` into the shared component `Components/app/PublicShell.tsx`, also used in `CollectionGroups/Show.tsx` so guests opening a public group don't run into `UserLayout`, which needs a login session.
- New migration: `collection_groups.slug` (unique) + `collection_groups.is_public` (default false).
- **Bug found & fixed during direct HTTP verification**: the `available` query that `join()`s to the `series` table (to sort by title & filter by type) made `whereNotIn('id', ...)` ambiguous — SQLite doesn't know whether `id` belongs to the `collections` or `series` table, error `ambiguous column name: id`. Fix: qualify it as `whereNotIn('collections.id', ...)`.
- Full live HTTP test: 30 dummy collections → type filter (manga vs novel) correct, substring search correct, page 2 pagination correct, adding 2 items → immediately excluded from `available` (total 30→28), public toggle → a guest without login can see the group (`is_owner: false`, `available: null`), private toggle again → the guest gets 403, group rename → slug regenerated automatically, the owner's public profile shows the public group with a cover collage. Test data (users, collections, series, groups, tokens) was cleaned from the dev database after verification.

---

## 2026-08-14 (part 8) — Collection Groups Fully Reworked (MDList MangaDex Style)

- **The grouping design from part 6 turned out to have the wrong semantics** — the user explained they meant "MDList MangaDex style": a group is the first-class object (given a name, e.g. "RomCom"), filled with many manga from the user's collection — not just a single string label per collection. Replaced entirely, not patched.
- New `CollectionGroup` model + pivot `collection_group_items` — **many-to-many**, one manga can be in more than one group at once. The `collections.group_name` column (old design) was removed.
- New pages: `/collection-groups` (group list, cover collage from the first 4 manga) → `/collection-groups/{group}` (group contents — add manga from the collection through a picker dialog, remove from the group, rename, delete the group). A "Collection Groups" link was added to the My Collection page header.
- All the old grouping UI in `Collection/Index.tsx` (inline popover, filter dropdown, "Group" table column) was cleanly removed.
- **Bug found & fixed during direct HTTP verification**: the pivot table `collection_group_items` was initially given `uuid('id')->primary()` like other tables in this app — but Eloquent's `attach()`/`syncWithoutDetaching()` inserts pivot rows through the raw query builder (not model events), so `HasUuids` never got the chance to fill the `id` column, causing a `NOT NULL constraint violation` in SQLite. Fix: the pivot table uses purely a composite primary key (`collection_group_id`, `collection_id`) instead of a synthetic `id` — the standard Laravel pattern for pivot tables without extra data.

---

## 2026-08-14 (part 7) — Fix: Login Links (CLI/Email) Override the Active Account Instead of Adding

- **Bug found by the user**: logging in through the CLI emergency link (`sso:emergency-login`) or an email magic link, when opened while already logged in as another account, **overrides** the currently active account instead of adding it as a linked account (the multi-account switching feature, part 5). Root cause: the link-or-replace decision previously depended on the `sso_link_mode` flag, which is only set when login starts from the "Add Account" modal in the UI — CLI/email links never go through that modal at all, so the flag was never set.
- **Fix**: `AccountLinkService::loginAs()` now decides link-or-replace from the login state **at the moment the link is consumed** (`auth()->check()`), not from a UI flag — if another user is active when the link is clicked, it is automatically added to the linked accounts list, whatever the link's source (the "Add Account" modal, CLI, or email). The `sso_link_mode` flag and the `?link=1` query parameter that caused the problem were removed entirely (dead code after this fix).
- Verified through direct HTTP: log in as A → consume a bare magic link for B (simulating CLI/email, without the "Add Account" modal) → the active identity became B, **A still appears in the linked accounts list** (previously A would have disappeared entirely). The fresh guest login case (no previous session) stays clean, with no phantom accounts left behind.

---

## 2026-08-14 (part 6) — Stepper from My Collection, Collection Grouping, Multilingual Flash Messages

- The reading progress +/- stepper can now also be used directly from the **My Collection** page (`/my-collection`), without opening the collection detail first — it reuses exactly the same endpoint as the detail page (Phase 23), just extra UI on the grid card & table row.
- New **collection grouping** feature — users can give their collections a free-form label (e.g. "Bedroom Shelf", "Office Shelf") through an inline popover, plus a filter dropdown "All Groups"/"No Group"/group name. The `collections.group_name` column (a free string, not a separate table). **⚠️ This design was replaced entirely in part 8** — it turned out to have the wrong semantics, see the entry above.
- **Controller flash messages are finally multilingual** — an old backlog item long noted in CLAUDE.md. New `lang/{id,en,ja}/flash.php`, ~70 `->with('success'/'error'/'info', ...)` calls across 24 controllers converted from hardcoded Indonesian to `__('flash.xxx', [...])`. Verified directly through HTTP: the same request with different `users.locale` values produced the correct flash message in all three languages.
- **Bug found & fixed during the flash-message sweep**: `VolumeController::generate()` used a dynamic key (`->with($created > 0 ? 'success' : 'info', $message)`) that slipped past the literal grep search for `with('success'` — found through a second sweep that searched for leftover words "berhasil"/"gagal" outside `__()` calls.

---

## 2026-08-14 (part 5) — Multi-Account Switching (Session-Based)

- Users (not just admins) can now link other accounts ("Add Account") and switch quickly between accounts without logging in again, as long as they stay in the same browser — triggered by the case of an admin who couldn't access `/my-collection` with their own admin account.
- Deliberately **session-based, with no permanent links in the DB** — the list of linked accounts (`linked_account_ids`) lives only in the session. Switch browsers/devices and you must link again from scratch. The reason: a permanent link is only about convenience, not security — switching accounts always requires real proof of login to the target account first.
- Open to **all users**, not restricted to admins — there is no security gap in opening it widely because the validation is in the session, not in the role.
- New `AccountSwitcher.tsx` (a Popover on the sidebar footer avatar, Admin & User Layout) — view profile, quick-switch accounts, "Add Account" (reuses `LoginMethodDialog`), and two logout options: "Sign Out of This Account" (X/Twitter pattern — auto-switches to another linked account if there is one) vs "Sign Out of All Accounts".
- New `AccountLinkService` and `Auth\AccountController` (`switch`/`logoutCurrent`) in the backend — strict validation: the switch target must already be in the session whitelist, so you can't switch to an arbitrary account.

---

## 2026-08-14 (part 4) — Quick-Edit Reading Progress & Volume Count in My Collection

- New "reading progress" +/- stepper on the collection detail page — moves the read-volume boundary one step without having to find and click a specific volume's eye icon. `+` marks the lowest-numbered unread volume as read, `-` flips the highest-numbered read volume back to unread. The per-volume eye icon is still there for manual corrections out of order.
- "Owned count" +/- stepper per format (physical/ebook/online/webtoon) — quickly add/remove volumes without opening the "Add Volume" dialog. `+` takes the next volume number not owned at all (numbers are shared across formats within one collection), `-` deletes the highest-numbered volume of that format. The stepper only appears for formats that already have at least 1 volume.
- A volume that is currently on loan is protected from deletion via the stepper — the `-` button is disabled + has a tooltip if that format's highest volume is on loan.
- **Bug found & fixed during direct HTTP verification**: the initial server query implementation silently fell through to the next non-loaned volume if the top volume was on loan, instead of rejecting the action — contradicting the "disable + tooltip, don't silently change the target" design. Fix: the query only ever targets the true top volume, and rejects (info toast) if it's on loan.

---

## 2026-08-14 (part 3) — Multi-Select Genre Filter in the User Catalog

- The genre filter on the Catalog page changed from a single-select dropdown to a typeable combobox (fuzzy search) where more than one genre can be picked — new `GenreMultiSelect.tsx` (Popover + `Command`/cmdk), with selected genres shown as badges that can be removed one by one.
- The genre filter is now **OR-match**: a series passes if it has any of the selected genres, not all of them. Verified: Comedy alone 59 results, Romance alone 43 results, both combined 67 results (the correct union).
- This item was a miss from a previous session — explicitly requested but skipped; found again through the "check for missed features" audit (see the entry below).

---

## 2026-08-14 (part 2) — Favicon Installed, README Overhauled (Bilingual), Missed-Feature Audit

- The previously generated favicon (`public/images/favicon/`) was finally wired into `resources/views/app.blade.php` — before, there was no favicon at all. SVG with light/dark variants (`prefers-color-scheme`), PNG fallback, `apple-touch-icon`, and a new `site.webmanifest` for the PWA/home-screen icon.
- README completely overhauled into bilingual (🇮🇩 Indonesian / 🇬🇧 English) with a language switcher, logo, tech stack badges, and a new "Unfinished (Backlog)" section that is transparent about feature gaps.
- Audit of features that were requested but missed: grep for `TODO`/`FIXME` in code (none), cross-check `CLAUDE.md`/`PHASES.md`/`prd.md`. Found one real miss — the multi-select genre filter in the Catalog (requested in a previous session, not yet done) — built right away, see the entry above.

---

## 2026-08-14 (part 1) — Fix Admin URLs (Slug) & Genre/Tags Editor in Series Edit

- **Fix admin URLs still using UUIDs**: the slug rollout in Phase 15 only touched the user side (`catalog.show`) — all `route('admin.series.show'/'edit', ...)` calls on 9 admin pages (Index, Show, EditVolume, Edit, AniList, RanobeDb, Search, Tickets, Command Palette) still used the raw UUID. The backend was updated to send `slug`/`series_slug`, and all frontend route calls were switched to slugs (the UUID is still used where needed — bulk-select, delete/update API targets).
- **Genre/tags editor in Series Edit**: this page previously had no UI at all for genre/authors/illustrators/themes/demographics — new `TagListInput.tsx` (free tag editor, Enter/comma adds, click X removes), 5 new fields in the form. The "Sync AniList/RanobeDB" popover now also fills in tags (before, it only filled title/synopsis/etc., even though the genre data was already fetched from the API).
- **Bug found & fixed during direct HTTP verification**: Laravel 12's global middleware `ConvertEmptyStringsToNull` turned the empty-string sentinel (used as the signal for "delete all tags") into `null` before validation ran — the `genres.*` rule, which had no `nullable`, rejected `null` with 422. This meant the "delete all tags" feature failed completely if actually tried. Fix: add `nullable` to the tag rules, and change the sentinel filter in the controller to drop `null` as well.

---

## 2026-08-14 — Light/Dark/System Theme

- The one-click dark/light toggle in the sidebar footer (Admin/User Layout) and the Landing page was replaced with 3 explicit options (Light/Dark/System) — exactly the same pattern as the existing `LanguageSwitcher`: `ThemeSwitcher.tsx` (Popover), synced to the DB per user (`users.theme`, `PATCH /settings/theme`), guest-safe (localStorage-only when not logged in).
- `useTheme()` was rewritten — resolves `system` through `matchMedia`, live-updating if the OS preference changes while the app is open.
- A new "Theme" card on the Settings page, between the "Language" card and the "Public Profile" card.

---

## 2026-08-03 (part 3) — Fix: Login Button on the Public Profile Page

- The Login button in the `PublicShell` header and the "Log in to follow" CTA (both in `Profile/Show.tsx`, seen by guests opening a public profile) still redirected straight to SSO — missed in the login modal rollout because the initial rollout only touched the Landing page.
- Fixed: both places now open `LoginMethodDialog` too, each with its own local state (`loginOpen` in `PublicShell`, `followLoginOpen` in the main component).
- Re-grepped `sso.redirect` across all of `resources/js` to make sure no other Login button was left behind.

---

## 2026-08-03 (part 2) — Login Method Modal (SSO / Email)

- The Landing page now shows a login method modal as soon as the "Login" button is clicked — "Log in with Yado" or "Log in with Email" (`LoginMethodDialog.tsx`), instead of redirecting straight to SSO.
- Email login was promoted from the small link "Can't reach SSO?" (a hidden emergency fallback) to an option on par with SSO in the modal — the backend mechanism is exactly the same (single-use magic link, `SsoFallbackController`), only the UI framing changed.
- The rate limit of the `POST /auth/fallback` endpoint was raised from `throttle:3,15` to `throttle:5,10` — it is now used as a daily option, not just an emergency, so the limit needs to be looser.
- **Important note**: the profile (name/avatar/username) is only re-synced from Yado when logging in through SSO. Users who log in by email from then on don't get automatic profile updates — this is a conscious decision, not a bug (discussed & approved before implementation).

---

## 2026-08-03 (part 1) — AniList Batch Import, SSO-Down Logout Fix, New-Tab Context Menu

### AniList Batch Import (genre, year, popularity)

- Genre filter (dropdown of canonical AniList enums), release year, and a "Sort by Popularity" toggle were added to the `Admin/AniList/Index.tsx` page — you can browse using only filters without typing any title.
- Multi-select checkboxes per result (only those not yet in the catalog) + "Select All" + import all at once. `AniListService::getMangaBatch()` fetches up to 50 series in **one** GraphQL request (`media(id_in: [...])`), not N separate requests per series — important to save AniList's rate-limit quota (~90 req/minute).
- A "Hide those already in the catalog" toggle — a client-side filter, combined with the existing "Already imported" badge.
- **Found during research (verified directly against the API before coding)**: `seasonYear` in the AniList schema is the anime airing-season concept, and always returns an empty array for `type: MANGA`. The correct year filter for manga uses the range `startDate_greater`/`startDate_lesser` (`FuzzyDateInt`, format `YYYYMMDD`).

### Fixed

- `SsoController::logout()` always forced the browser to navigate to the SSO domain (`sso.yado.my.id/logout`) to destroy the session there too — if SSO is down, the browser hangs for a long time waiting for a connection to the dead domain, even though the local session had actually already been invalidated. Added `ssoReachable()`, a quick check (3-second timeout) before redirecting — if it can't be reached, it goes straight back to the home page without waiting. Verified through a direct HTTP request: logout now completes in ~3.4 seconds bounded by the timeout, instead of potentially hanging indefinitely until the browser itself gives up.

### Added

- The context menu (right-click) in `Admin/Series/Index.tsx` now has an "Open in New Tab" option (`window.open()`) alongside regular SPA navigation.

---

## 2026-08-03 — Login Without SSO (Fallback), Email Configuration (Resend), Landing Page Overhaul

### Login Without SSO (Fallback)

An emergency route if Yado (SSO) is truly unreachable (down/migration/maintenance) — not a replacement for SSO, only for emergencies. Deliberately **not** using a local password (no user has a stored password, everything is managed by SSO) or an admin approval system (discussed, then simplified) — a single-use magic link via email already synced from SSO was chosen, verifying identity through inbox ownership.

#### Added
- A link "Can't reach SSO?" on the Landing page → `/auth/fallback` — fill in an email form → a single-use magic link is sent (if the email is registered & the mail service is configured) → click the link → logged in right away.
- The `sso_fallback_tokens` table — the token is stored **hashed** (SHA-256), TTL 15 minutes, single-use (same pattern as Laravel's built-in `password_reset_tokens`).
- Rate limit `throttle:3,15` on the request endpoint, and the response is **always the same generic message** whether the email is registered/not/banned — anti email-enumeration.
- Email send failures (wrong API key, provider down) are caught by try/catch — they don't cause a 500 on the request, and are recorded in the Activity Log + the regular Laravel log.

#### Fixed
- `ActivityLog::record()` always used `auth()->id()` for `user_id` (a NOT NULL column) — it blew up (SQL constraint violation → 500) for actions triggered by a guest such as a login request without SSO. Added a fallback to the subject user's ID when nobody is logged in. Found & fixed during end-to-end verification through direct HTTP requests, not just tinker.
- `SsoController::logout()` always forced the browser to navigate to the SSO domain (`sso.yado.my.id/logout`) to destroy the SSO session too — if SSO is down, the browser hangs for a long time waiting for a connection to the dead domain (the local session had actually already been invalidated). Added a quick check (`ssoReachable()`, 3-second timeout) before redirecting — if SSO can't be reached, it goes straight back to the home page without waiting.

### Emergency Login via CLI

- `php artisan sso:emergency-login {identifier=super_admin}` — reuses the same `SsoFallbackToken` as the email magic link, but issued from the CLI (needs SSH access to the server). The identifier can be a role (`super_admin`/`admin`/`user`) or a specific email/username. It always asks for confirmation and shows who will be given access before issuing the link — if several users share the same role, the command offers an interactive choice instead of just picking one.

### Email Configuration (Resend)
- The `mail_settings` table (single-row, encrypted `api_key`) + a new "Email" tab in `/admin/settings` — same pattern as Storage/AI (configured through the admin UI, not `.env`).
- `MailSettingsService` sets the Resend config at runtime from the DB before sending, same pattern as `StorageSettingsService::disk()`.
- The `resend/resend-php` package (Laravel's native `resend` mail transport; `config/mail.php` already has a stub from Laravel 12).

### Landing Page Overhaul
- Added a header (Malas brand, language switch, dark/light mode toggle, Login button) and a footer (tagline, copyright that updates per year) — before, there was only a hero + feature grid with no navigation.
- `LanguageSwitcher` was made guest-safe — when not logged in, changing language is done on the client only (`i18n.changeLanguage()`) without calling an endpoint that needs an authenticated session.

---

## 2026-08-02 — Title-Based Catalog URLs (Slug), Admin Multi-Language Complete

### Title-Based Catalog URLs

- New `series.slug` column — auto-generated from `title_romaji` through `Series::generateUniqueSlug()`. Symbols such as `@`, `!`, commas, and colons are dropped outright (not converted into words — the default `Str::slug()` dictionary is deliberately emptied), and the full title is used as is no matter how long. Regenerated automatically when the title changes; a `-2`/`-3` suffix is added if there are duplicate titles.
- `/catalog/{series}` (and all other routes that bind the `Series` model) now accept a slug — `Series::resolveRouteBinding()` tries to match the slug first, falling back to `id` so old links/bookmarks still using a UUID keep working.
- All pages that link to the catalog (Catalog, Dashboard, My Collection, Wishlist, Tickets, Public Profile, Global Search) were updated to use the slug instead of the UUID when building URLs.
- A new migration backfills slugs for all series already in the database.

### Multi-Language (id/en/ja) — Admin Complete

The entire `Admin/**` page backlog (~25 pages: Series, Settings, Users, Announcements, Tickets, Loans, Menus, GenreFunfacts, AniList, RanobeDb, Search, Collections), the root pages (`Landing`, `Error`, `Auth/Banned`, `Maintenance`), and the remaining `Components/app/**` components are now fully translated. See [`CLAUDE.md`](CLAUDE.md), the "Multi-Language System" section, for details of the current coverage — the only documented remaining gaps are controller flash messages (a separate backlog) and the root `Pages/Dashboard.tsx`, which turned out to be dead code (not referenced by any controller, deliberately left untouched).

---

## 2026-08-01 — Multi-Language (id/en/ja), Public Profile for Guests, Puter.js AI

### Multi-Language (id/en/ja)

The foundation of the multi-language system was added and most user-facing pages are fully translated — see the 2026-08-02 entry above for the admin side being completed.

#### Added
- `react-i18next` + per-namespace JSON resources in `resources/js/lang/{id,en,ja}/` (`common.json`, `dashboard.json`, `user.json`, `catalog.json`, `collection.json`, `admin.json`).
- The `users.locale` column (default `id`) + a "Language" card on the Settings page, **plus a quick-switch language button** (`LanguageSwitcher.tsx`) right in the Admin & User Layout sidebar footer — change language without opening Settings.
- `SetLocale` middleware — sets `App::setLocale()` server-side from the user's preference on every request, shared to the frontend through `HandleInertiaRequests`.
- `lang/{id,en,ja}/validation.php` + `lang/{id,en,ja}/pagination.php` — Laravel's built-in validation & paginator messages now automatically follow the user's active language (before, they were always English because `lang/` had never been published).
- `menuTranslationKey()` (`resources/js/lib/menu.ts`) — maps the menu `key` from the database to a translation key, so sidebar labels change with the language; custom menus renamed by an admin still fall back to the DB label as is.
- `useTypeFilterOptions()` (`resources/js/lib/typeFilters.ts`) — a single translation source for the type filter Segmented Control repeated across many pages (a mandatory CLAUDE.md rule).

#### Fully translated
Layouts & shared (`AdminLayout`, `UserLayout`, `SidebarNav`, `CommandPalette`, `GlobalSearch`, `StatusBadge`, `Pagination`, `LanguageSwitcher`); all `User/**` pages (Dashboard, Catalog, Collection — including `Collection/Show.tsx`, ~1200 lines, Wishlist, Tickets, Loans, Directory, Profile); `Settings/Index.tsx` in full; `Admin/Dashboard.tsx` and `Admin/ActivityLog/Index.tsx`.

#### Not yet translated (backlog)
The remaining `Admin/**` pages (Series, Users, Announcements, Tickets, Menus, etc. — see CLAUDE.md for the full per-file list with size estimates), a few small `Components/app/**` components, root pages (`Landing`, `Error`, etc.), and controller flash messages (`->with('success', '...')`) still hardcoded in Indonesian.

### Public Profile Accessible Without Login

- The route `/u/{user}` (`profile.show`) was moved out of the `auth` middleware group — now guests (not logged in) can view someone's public profile without logging in through SSO first.
- `ProfileController::show()` was made null-safe for guest viewers (`is_owner`/`is_following` no longer crash), plus a new `is_guest` flag sent to the frontend.
- Guests get a minimal public layout (`PublicShell` — just the Malas header + Login button, no sidebar), and collection cards in the grid are **not clickable** for guests (because `catalog.show` still needs login) — they can only see the cover & title.

### Free AI Provider via Puter.js

- The "Genre Taste" feature (AI funfact) now defaults to [Puter.js](https://docs.puter.com/) — runs directly from the user's browser, free, no API key. Admins can still switch to Gemini/OpenAI/Claude in `Admin/Settings` (AI tab) if they want.
- Auto-generate & manual generate of funfacts still run automatically in the background for the Puter provider (see `lib/puter.ts` + `DashboardController::regenerateFunfact()`/`saveAutoGeneratedFunfact()`).
- Dedicated HTTP 429 (rate limit) handling for the Gemini/OpenAI/Claude providers — `AiRateLimitException` makes the funfact fall back to fallback text instead of failing completely, and doesn't eat into the user's manual regenerate quota.

---

## 2026-07-26 — Personal Collection: Read Tracking, Review & Rating, Undo

A follow-up iteration on the library UI batch — focused on per-volume read tracking, personal reviews, and UX improvements in My Collection.

### Added — Read Tracking
- The `collection_volumes.read_at` column — mark individual volumes as read/unread through the eye icon on each volume card/row; read volumes are shown greyed out.
- An eye icon button in the volume list header (to the left of the "Owned Volumes" title) to mark **all** volumes as read at once (`CollectionController::markAllVolumesRead()`).
- A "Last read: Vol. N" indicator on the collection detail page, computed automatically from the highest-numbered volume that has been marked read.
- The My Collection datatable (`/my-collection`) shows reading progress per series: `N/M read`, computed from `read_volumes_count` (a `withCount` query with the condition `whereNotNull('read_at')`).

### Added — Volume Delete Mode
- The "Delete" button in the volume toolbar toggles "selection mode" — when active, the eye icon on each volume turns into a checkbox (taking the same position) for bulk-select, then deletes through the existing bulk delete endpoint.

### Added — Personal Review & Rating
- New columns `collections.personal_rating` (smallint, -10 to 10) and `collections.personal_review` (text, nullable).
- A "Personal Review & Rating" card on the collection detail page — a slider from -10 (Not Recommended) to +10 (Recommended) MyAnimeList-style, plus a comment textarea. Endpoint `PATCH /my-collection/{collection}/review`.
- A series' genres, themes, and demographics are shown in full on the collection detail page (before, only genres).

### Added — Undo on Toasts
- `useFlash` can now show an "Undo" button on success toasts (sonner `action`), driven by the session flash `undo_url` + `undo_payload` (shared through `HandleInertiaRequests`).
- Per-volume read toggle: undo calls the same toggle endpoint (naturally reversible).
- Mark all as read: new endpoint `unmarkVolumesRead` — undo only reverts the volumes that were *just* changed by the mark-all action, not all volumes (so it doesn't wrongly revert volumes that were already read before).

### Added — Global Search (User Side)
- A search bar in the center of the `UserLayout` header (desktop) + a search icon in the mobile topbar, plus a ⌘K/Ctrl+K shortcut from anywhere.
- `GlobalSearch.tsx` (based on `cmdk`, the same component as the admin Command Palette) — search results combine static navigation (automatic fuzzy match, e.g. typing "pinjaman" immediately shows the Loans menu) + manga titles from the Catalog + titles from your own My Collection.
- New endpoint `GET /search` (`User\SearchController`).

### Changed — My Collection
- The My Collection grid view changed from horizontal cards (small 80px thumbnail) to vertical poster cards (full-width cover, 2:3 aspect) with `grid-template-columns: repeat(auto-fill, minmax(160px,1fr))` — the number of columns & cover width adjust automatically to screen width, not fixed breakpoints.
- Recommendations on the user dashboard changed from a grid to a **Carousel** (`embla-carousel-react` + `ui/carousel.tsx`) — each slide shows the cover, title, author, genre/tags, and a short synopsis (cut at 160 characters).
- The "Volume Progress" chart on the user dashboard was removed — it was biased because many series don't have `total_volumes` filled in (ongoing/ambiguous).

### Fixed
- Genre recommendations on the user dashboard were sometimes completely empty even though the user had many collections — root cause: the rest of the catalog not yet collected by the user didn't all have genre data, so the overlap score was always 0. Fix: fall back to a random pick from series not yet collected if genre scoring yields nothing (also used in the Surprise Me endpoint).
- Rows of the My Collection & Admin Series tables could sometimes only be clicked through their title — the navigation `onClick` was moved from nested inside the `render` prop of `ContextMenuTrigger` to a prop directly on `ContextMenuTrigger` (a more reliable props-merge path in Base UI, instead of a two-layer merge).

---

## 2026-07-25 (continued) — New UI Libraries: Empty, Hover Card, Context Menu, Command Palette, Chart

A batch integrating several shadcn/Base UI components that were already installed but not yet used, plus new features on the dashboard.

### Added
- **`Empty` component** (`ui/empty.tsx`) — used in the empty states of My Collection and Loans, replacing the old `EmptyState` on both pages.
- **Rows-per-page selector** (5/10/25/50/100) on all server-paginated datatables (Admin Series/Users/Collections/Tickets/Loans/Announcements, User Tickets/Loans) — the `per_page` param is whitelisted through the `Controller::perPage()` helper, and `Pagination.tsx` was extended with an optional selector that reads `data.per_page` straight from the paginator.
- **Collector avatars** on the Catalog detail page — shows an avatar stack (no names, for privacy) + the total number of users who collect that series.
- **Hover Card preview** — hovering a series title in Admin Series & My Collection (table view) shows the cover, type, status, and score without a click.
- **Context menu (right-click)** — View/Edit/Delete shortcuts on rows in Admin Series & My Collection, complementing the existing dropdown menu.
- **Admin Command Palette** (⌘K/Ctrl+K, `CommandPalette.tsx`) — quick navigation to all admin pages + direct search of Series/Users/Tickets through the `GET /admin/command-search` endpoint. A trigger button is also permanently in the admin sidebar.
- **Dashboard charts** (`recharts` + `ui/chart.tsx`) — Admin: Series per Status, Collections per Type, Loan Status (donut). User: Collections per Status.
- **Genre recommendations + Surprise Me** — the user dashboard shows series recommendations based on genre overlap with the user's collection (computed in PHP, not a raw DB JSON query, to stay portable across SQLite/MySQL); a "Surprise Me" button picks one random series (genre-weighted) with a reveal dialog.

### Skipped
- The `Attachment` component for uploading images to the admin media gallery — the spec the user pasted was lost during context compaction of the previous session, postponed until it is pasted again.

---

## 2026-07-25 — UX Overhaul: Catalog, My Collection, Admin Tools, 18+ Content

A big batch of fixes & features on the user and admin sides, plus queue worker infrastructure for deployment.

### Fixed
- Catalog & Admin Series pagination kept jumping back to page 1 on its own — the search debounce `useEffect` should not have run on every mount (including when changing pages), and is now skipped on the first render.

### Added — User Side
- The "Add Series" modal in My Collection was enlarged, with a roomier selection grid.
- Grid/Table view toggle + sort (name, date added, volume count) in My Collection, stored per device via `localStorage`.
- Grid/Table toggle for the owned volume list on the collection detail page.
- An "in collection / not in collection" filter in the Catalog.
- The volume checklist in a collection can now be clicked anywhere inside the cover box, not exactly on the checkbox.
- A quick refresh button next to search — Catalog, My Collection, Admin Series.
- Series status filter (publishing/finished/hiatus/etc.) in My Collection.
- Series genres are shown on the My Collection card.
- Optional collection condition (mint/good/fair/poor), editable from the collection detail page.
- A "latest tickets" widget on the user dashboard.
- Extra media gallery (screenshots/artwork) on the Catalog detail page; the volume count badge on catalog grid cards was removed (deemed uninformative).
- User avatars (with initials fallback) are shown consistently in the sidebar.

### Added — Admin Side
- The admin Collections page was restructured: the list is grouped per user (with drill-down), instead of a flat table of all collections.
- AniList import no longer navigates away after import — it stays on the search page, with a "view in catalog" button for series that have been imported.
- The admin & user sidebars were restructured into collapsible categories/sub-categories (e.g. the "AniList" group, the "Others" group).
- The Storage Settings + Database Backup pages were merged into a single tabbed `/admin/settings` page.
- A "hide 18+ content" filter when searching AniList, plus an 18+ badge on results.
- A global "blur 18+ content" setting (Content tab on the Settings page) — 18+ series covers are blurred automatically across all user pages, click to reveal temporarily (Reddit/Instagram style).
- Admin activity log — records sensitive actions (delete/bulk-delete series & volumes, ban/unban/change user role, database import, change storage/content settings) with a new viewer page.
- Upload of extra media gallery per series from the Edit Series page.
- Automatic file storage migration (Local ↔ S3) when the driver/bucket/endpoint is changed — runs in the background through a queue job, with status shown on the Settings page.

### Changed — Deployment Infrastructure
- `deploy.sh` now installs & configures **Supervisor** for the queue worker (`malas-worker`) — required so queue jobs such as storage migration actually run in production.
- `update.sh` runs `php artisan queue:restart` after a code update, so the running worker uses the latest code.
- `docs/DEPLOYMENT.md` updated: Supervisor prerequisite, manual queue worker setup steps, troubleshooting for queue jobs not running.

---

## 2026-07-23 — Admin Series Bulk Delete

### Added
- Multi-select checkboxes in `Admin/Series/Index.tsx` — select many series at once to delete in one action, no need to do it one by one.
- `SeriesController::bulkDestroy()` + the route `DELETE /admin/series/bulk` (registered before the resource route so it doesn't clash with the `{series}` wildcard).
- A "Delete (N)" toolbar appears in `PageHeader` when series are selected, with a confirmation dialog separate from single-item delete.

---

## 2026-07-22 — Storage Settings, Database Backup, Ticket System, AniList Fixes

### Added
- **Storage settings via the admin UI** (`/admin/settings/storage`) — driver `local` or `s3` (compatible with AWS S3 and S3-compatible services like Cloudflare R2), stored in the `storage_settings` table with an encrypted `secret_access_key`. Configuration no longer goes through `.env`.
- **`StorageSettingsService`** — a single entry point for all file operations (disk, url, store, delete). All code that previously accessed the `Storage::` facade directly was migrated to this service.
- **Database backup & import** (`/admin/settings/database`, super_admin only) — download an SQL dump (excluding sensitive tables: `users`, `sessions`, `jobs`, etc.), import with `DELETE FROM` + `INSERT` per table wrapped in `DB::transaction()` so it is atomic and can roll back if it fails midway.
- **Ticket system** — users can create request tickets (e.g. asking for a new title to be added to the catalog) from `User/Tickets/Create.tsx` (can be pre-filled from the catalog page), and admins respond from `Admin/Tickets/Show.tsx`. Statuses: `open`, `in_progress`, `resolved`, `closed`.
- A "create a request ticket" note on the Catalog and Collection pages when search results are empty / the collection isn't in the catalog yet.
- Volume range input syntax — `CollectionController::storeVolumes()` accepts mixed formats like `1,2,3,5-9,11,12,15-18`, expanded into a list of individual volumes (auto-swap if the range is reversed, dedupe, limit 100 per batch).

### Fixed
- The "Sync AniList" popover / search card whose position was off (stuck below/right of the trigger, not centered) — replaced with an absolute `inset-0` overlay inside a per-card `relative` wrapper, because Base UI Popover's anchor engine isn't designed for full centering.
- The cover preview in Edit Series didn't appear after a new upload — React reused the same `<img>` DOM node across renders, so the `style.display = 'none'` from the old `onError` got stuck. Fix: add `key={displayCover}` so React remounts the element when the source changes.

---

## 2026-07-21 — SSO Integration

### Added
- `SsoController` — PKCE-based OAuth2 authentication to Yado. All users (including admins) log in through SSO; there are no local register/login forms anymore.
- New columns on `users`: `sso_id` (unique), `username`, `avatar`. `password` was made nullable.
- `Settings/Index.tsx` page — the user profile is shown read-only (profile data is managed on the SSO side).

---

## Earlier — AniList Migration & Series Management

### Changed
- **Full migration from Jikan (MyAnimeList) to the AniList GraphQL API** — `JikanService` removed, replaced by `AniListService`. New columns on `series`: `anilist_id`, `genres`, `authors`, `themes`, `demographics` (all json).
- Search & import of series from AniList (`Admin/AniList/Index.tsx`) and re-sync of metadata into existing series (the "Sync AniList" Popover in Edit Series).

### Added
- Per-user volume tracking in the personal collection, bulk delete of volumes from the collection detail page.
- A volume loan system from the personal collection.

---

## Earlier — Foundation (Phase 0–10)

Initial setup of Laravel 12 + Inertia v2 + React 19, auth & role system (Spatie Permission), database-based menu management, admin series/volume CRUD, user catalog & collection, announcements, user & menu management. Full details are in [`docs/PHASES.md`](docs/PHASES.md). First QA pass: 2026-07-03.
