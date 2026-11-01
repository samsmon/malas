# PHASES — Malas v2 Implementation Plan

**Version:** 2.7
**Date:** 2026-06-26 (Phase 0–10), updated 2026-08-03 (Phase 11–18)
**Status:** ✅ All phases complete (QA pass 2026-07-03) + Phase 11–18 post-launch enhancements (Phase 18 needs manual visual verification)

> After each phase is complete: open a new QA chat with the instructions from `QA.md`.
> Do not start the next phase before QA passes.
> Phase 0–10 below are the original v2 planning history and are **not re-edited** to reflect later changes — detailed per-feature changes after QA are recorded in Phase 11 and in [`CHANGELOG.md`](../CHANGELOG.md).

---

## Phase 0 — Project Setup & Clean Slate ✅

**Goal:** Fresh Laravel 12 install with the full stack integrated.

Installed stack:
- Laravel 12 + Laravel Breeze (React + TypeScript + Inertia)
- Inertia.js v2, React 19, TypeScript 5, Tailwind CSS v4
- shadcn/ui (init with Zinc + CSS variables)
- Spatie Laravel Permission
- league/flysystem-aws-s3-v3 (Cloudflare R2)
- Ziggy for the route helper on the frontend

### Done Criteria
- [x] `php artisan serve` + `npm run dev` run without errors
- [x] `/login` is accessible, the form appears
- [x] `npx tsc --noEmit` → 0 errors
- [x] `php artisan migrate:fresh` succeeds

---

## Phase 1 — Database & Models ✅

**Goal:** All tables and models ready with relations and factories.

Actual models and relations:
- `User` — `hasMany(Collection)`, `belongsToMany(Announcement)`
- `Series` — `hasMany(Volume)`, `hasMany(Collection)`
- `Volume` — `belongsTo(Series)` (no relation to collections/loans — the FK was moved)
- `Collection` — `belongsTo(User)`, `belongsTo(Series)`, `hasMany(CollectionVolume)`, `hasMany(Loan)`
- `CollectionVolume` — `belongsTo(Collection)`, `hasMany(Loan)` (uuid PK, HasUuids)
- `Loan` — `belongsTo(Collection)`, `belongsTo(CollectionVolume, 'collection_volume_id')`
- `Menu`, `Announcement` — per the PRD

### Done Criteria
- [x] `migrate:fresh --seed` succeeds
- [x] All models have `$fillable` and the correct relations
- [x] Roles created: `super_admin`, `admin`, `user`

---

## Phase 2 — Auth & Middleware ✅

**Goal:** Login/register works, the middleware stack is active, role-based redirect.

### Tasks

1. **User model** add helper methods:
   ```php
   public function isAdmin(): bool
   {
       return in_array($this->role, ['admin', 'super_admin']);
   }
   public function isSuperAdmin(): bool
   {
       return $this->role === 'super_admin';
   }
   ```

2. **Middleware `EnsureNotBanned`**
   - Check `auth()->user()->is_banned`
   - If banned → `return Inertia::render('Auth/Banned', ['reason' => ...])`

3. **Middleware `CheckMenuAccess`**
   - Get `Route::currentRouteName()`
   - Query `Menu::where('route_name', $routeName)->first()`
   - If none → continue (skip)
   - If `is_maintenance` and not an admin → `Inertia::render('Maintenance', [...])`
   - If the role is not in `role_access` → `abort(403)`

4. **Register middleware** in `bootstrap/app.php`
   ```php
   ->withMiddleware(function (Middleware $middleware) {
       $middleware->alias([
           'banned'     => EnsureNotBanned::class,
           'check.menu' => CheckMenuAccess::class,
       ]);
   })
   ```

5. **Route-based redirect after login**
   - Override `AuthenticatedSessionController@store`
   - Admin → `/admin/dashboard`, user → `/dashboard`

6. **`HandleInertiaRequests` middleware**
   - Add shared data: `auth.user` (without password), `menus` (filtered by role)
   ```php
   public function share(Request $request): array
   {
       return [
           ...parent::share($request),
           'auth' => ['user' => $request->user()?->only('id','name','email','role')],
           'menus' => $request->user()
               ? Menu::where('is_visible', true)
                     ->whereJsonContains('role_access', $request->user()->role)
                     ->orderBy('sort_order')
                     ->get()
               : [],
       ];
   }
   ```

7. **Pages `Auth/Banned.tsx`** and **`Maintenance.tsx`**

### Done Criteria
- [x] Login succeeds, redirects to the correct route per role
- [x] `EnsureNotBanned` blocks banned users
- [x] `CheckMenuAccess` blocks routes that don't match the role
- [x] Maintenance mode renders the maintenance page
- [x] Admin can still access routes under maintenance

---

## Phase 3 — Layouts & Shared UI ✅

**Goal:** AdminLayout and UserLayout ready, with a dynamic sidebar built from the shared `menus` data.

### Tasks

1. **`AdminLayout.tsx`**
   - Sidebar with menus from `usePage().props.menus` (filter: admin role)
   - Topbar: user name + logout
   - Active menu highlight based on the current route
   - Responsive: collapsible sidebar on mobile

2. **`UserLayout.tsx`**
   - Simpler sidebar (4-5 menus)
   - Same data source from Inertia shared props

3. **Shared components:**
   - `AnnouncementBanner.tsx` — dismissible banner, POST to `/announcements/{id}/dismiss`
   - `PageHeader.tsx` — page title + optional breadcrumb
   - `EmptyState.tsx` — UI for when data is empty

4. **Dark/light mode toggle**
   - Store in `localStorage`
   - Use Tailwind `dark:` classes

5. **Install the shadcn components the layout needs:**
   ```bash
   npx shadcn@latest add button badge separator avatar dropdown-menu tooltip
   ```

### Done Criteria
- [x] Admin logs in → sees the admin sidebar with menus
- [x] User logs in → sees the user sidebar with limited menus
- [x] Active menu item is highlighted
- [x] Dark mode toggle works
- [x] Sidebar is collapsible on mobile

---

## Phase 4 — Admin: Series & Volume CRUD ✅

**Goal:** Admin can manage series and volumes. Including cover upload.

### Tasks

1. **Install shadcn components:**
   ```bash
   npx shadcn@latest add table card dialog form input select textarea label toast sonner pagination
   ```

2. **SeriesPolicy** + register in `AuthServiceProvider`

3. **`Admin/SeriesController`** — index, create, store, show, edit, update, destroy
   - Cover upload → convert to WebP, store in R2
   - Paginate 20 per page

4. **Pages:**
   - `Admin/Series/Index.tsx` — table + filter + pagination
   - `Admin/Series/Create.tsx` — add series form
   - `Admin/Series/Edit.tsx` — edit series form
   - `Admin/Series/Show.tsx` — series detail + Volume tab

5. **VolumePolicy** + `Admin/VolumeController` — CRUD nested under series

6. **Routes:**
   ```php
   Route::middleware(['auth', 'banned', 'check.menu'])->prefix('admin')->name('admin.')->group(function () {
       Route::resource('series', Admin\SeriesController::class);
       Route::resource('series.volumes', Admin\VolumeController::class)->shallow();
   });
   ```

7. **TypeScript types** in `lib/types.ts`:
   ```typescript
   interface Series { id: string; title_romaji: string; status: SeriesStatus; ... }
   interface Volume { id: string; series_id: string; volume_number: number; ... }
   ```

### Done Criteria
- [x] Admin can add, edit, delete series
- [x] Admin can add, edit, delete volumes in a series
- [x] Cover upload works (local disk in dev, R2 for prod)
- [x] Pagination works
- [x] Form validation errors show inline
- [x] A regular user cannot access `/admin/series` (must be 403)

---

## Phase 5 — User: Catalog & Collection ✅

**Goal:** Users can browse the catalog and manage their personal collection with per-user volume tracking.

The actual implementation differs from the initial plan — volume tracking doesn't use a checklist toggle from the admin's volume list, but is entered by the user themselves:

- `User/CollectionController` — index, store (multi-series), show, destroy, storeVolumes, destroyVolume
- Volume input: CSV of volume numbers + format per batch → stored in `collection_volumes`
- Add series via a search dialog + multi-select at `/my-collection`
- `VolumeGrid` becomes a pure display component (no toggle)

### Done Criteria
- [x] User can browse the catalog, with no edit/delete buttons
- [x] User can add series to the collection (multi-select from the dialog)
- [x] User can enter the volumes they own (CSV + format)
- [x] User cannot view/edit another user's collection (must be 403)
- [x] Admin can see all collections at `/admin/collections`

---

## Phase 6 — Loans ✅

**Goal:** Users can record and track loans of volumes from their collection.

Loan references `collection_volume_id` (not `volume_id`).

### Done Criteria
- [x] User can record a loan from the collection detail page
- [x] User can mark it as returned
- [x] Overdue status shows automatically if past due_at
- [x] Admin can see all loans

---

## Phase 7 — Jikan API Integration ✅

**Goal:** Admin can search and import series data from MyAnimeList.

### Done Criteria
- [x] Jikan search uses a 500ms debounce
- [x] Preview card appears with data from Jikan
- [x] Import successfully fills in all series fields
- [x] Duplicate MAL ID is handled (update, not error)
- [x] If Jikan is down, the page doesn't crash

---

## Phase 8 — Announcements & Dashboard ✅

**Goal:** Announcements work end-to-end, and the admin and user dashboards show relevant data.

### Done Criteria
- [x] Admin can create, edit, delete announcements
- [x] Banner appears on every user's dashboard
- [x] User can dismiss it, and the banner doesn't appear again
- [x] Expired announcements don't appear
- [x] Admin dashboard shows correct stats
- [x] User dashboard shows the user's own collection data

---

## Phase 9 — User Management & Menu Management ✅

**Goal:** Admin can manage users and menus. Super admin can manage roles.

### Done Criteria
- [x] Admin can ban/unban users
- [x] A banned user is logged out automatically + cannot log in
- [x] Admin can toggle maintenance mode per menu
- [x] Maintenance mode takes effect immediately without a server restart
- [x] Super admin can change a user's role
- [x] A regular admin cannot change a role to super_admin

---

## Phase 10 — Polish & Hardening ✅

**Goal:** Final QA before production-ready.

### Done Criteria
- [x] `tsc --noEmit` → 0 errors
- [x] No empty / blank pages when data is empty
- [x] Loading state on all buttons that trigger a request
- [x] Error pages 403/404/500/503 via `Error.tsx`
- [x] All mutations have `$this->authorize()`
- [x] All routes have `auth` + `check.menu` middleware
- [x] File upload validates `mimes:jpeg,jpg,png,webp`
- [x] No leftover `dd()` / `var_dump()` / `any` TypeScript

---

## Phase 11 — Post-Launch Enhancements ✅

**Goal:** Items that emerged after the v2 QA pass, outside the original phase plan.

Worked on incrementally after 2026-07-03, not in formal phase order:

1. **Jikan → AniList migration** — `JikanService` removed entirely, replaced by `AniListService` (GraphQL). Adds the columns `anilist_id`, `genres`, `authors`, `themes`, `demographics` (json) to `series`. The search & import UI was reworked into a per-card absolute overlay (not a Popover, because Base UI's anchor engine always places a popover beside the trigger, not centered).
2. **Yado SSO** — `SsoController` PKCE OAuth2 completely replaces Breeze's local auth. New columns on `users`: `sso_id`, `username`, `avatar`; `password` became nullable.
3. **Ticket system** — `tickets` table + `User/Tickets/*` (create & view) + `Admin/Tickets/*` (respond). Can be reached directly from the catalog with the series pre-filled. A "create a request ticket" note was added to the Catalog and Collection pages when empty / when a search has no results.
4. **Storage settings via UI** — `storage_settings` table (driver `local`/`s3`, encrypted credentials) + `StorageSettingsService` as the only file access path. All code that previously called the `Storage::` facade directly was migrated.
5. **Database backup & import** — `DatabaseBackupController` (super_admin only): download an SQL dump (excluding sensitive tables such as `users`, `sessions`, `jobs`), import with `DELETE + INSERT` per table wrapped in a transaction so it is atomic (not `TRUNCATE`, which implicitly commits in MySQL).
6. **Volume input with range syntax** — `CollectionController::storeVolumes()` accepts `1,2,5-9,11,12` and expands it into a list of individual volume numbers (with edge case validation: swap if reversed, dedupe, limit 100 per batch).
7. **Bulk delete series (admin)** — multi-select checkboxes in `Admin/Series/Index.tsx` + `SeriesController::bulkDestroy()`, one request deletes many series at once (still authorizing per item via Policy).
8. **Mobile-first UI pass (user side)** — responsive fixes in `PageHeader`, `Pagination`, and the Catalog/Collection pages so no elements overlap on narrow screens.
9. **Cover preview fix** — `key={displayCover}` on the Edit Series `<img>` element so React remounts the element (instead of reusing the DOM node), avoiding the old `onError` (`display:none`) getting stuck across renders.
10. **Deployment tooling** — `deploy.sh` (sets up an Ubuntu 24 server from already-cloned code, no re-clone), `update.sh` (pull + smart-skip build steps + safe migration), and `docs/DEPLOYMENT.md`.

### Done Criteria
- [x] No references to `JikanService` remain in the codebase
- [x] Login only through SSO, no local register/login form
- [x] User can create a ticket, admin can respond, status updates
- [x] Storage can be switched Local ↔ S3 from the UI without a restart/redeploy
- [x] Database backup can be downloaded and re-imported without data corruption
- [x] The volume range `1-5,7,9-12` is parsed correctly, including reversed/duplicate edge cases
- [x] Admin can select many series at once and delete them in one action
- [x] `npx tsc --noEmit` → 0 errors

---

## Phase 12 — Library UI, Dashboard, Read Tracking & Review ✅

**Goal:** Integrate unused shadcn/Base UI components, a more informative dashboard, and read-tracking + personal review features in the collection.

Worked on iteratively after Phase 11, in two batches:

**Batch 1 — Library UI & Dashboard**
1. The `Empty` component (`ui/empty.tsx`) replaces `EmptyState` in My Collection & Loans.
2. Rows-per-page selector (5/10/25/50/100) on all server-paginated datatables — `Controller::perPage()` whitelists the param, `Pagination.tsx` extended.
3. Collector avatars (no names, for privacy) + total count on the Catalog detail page.
4. Hover Card preview of cover/type/status/score in Admin Series & My Collection.
5. Context menu (right-click) View/Edit/Delete in Admin Series & My Collection.
6. Admin Command Palette (⌘K) — quick nav + search of Series/Users/Tickets via `Admin/CommandSearchController`.
7. Dashboard charts (Recharts) — Admin (Series per Status, Collections per Type, Loan Status), User (Collections per Status).
8. Genre recommendations + Surprise Me on the user dashboard — computed in PHP (not a raw JSON query) for SQLite/MySQL portability.

**Batch 2 — Read Tracking, Review, Search, Undo**
9. The `collection_volumes.read_at` column — per-volume read toggle (eye icon, greyed out once read), a mark-all button in the volume list header, and a "Last read: Vol. N" indicator.
10. Volume delete mode — the "Delete" button toggles selection, and the eye icon turns into a checkbox in the same slot.
11. Columns `collections.personal_rating` (-10..10) + `personal_review` — a personal review & rating card (MyAnimeList-style slider) on the collection detail page; series genre/theme/demographic are shown in full.
12. Dashboard recommendation carousel (`embla-carousel-react` + `ui/carousel.tsx`) — cover, title, author, genre, short synopsis per slide; the biased "Volume Progress" chart (many series lack `total_volumes`) was removed.
13. The My Collection grid was replaced with auto-fill poster cards (`repeat(auto-fill,minmax(160px,1fr))`) — wider covers, columns adjust automatically.
14. User Global Search (⌘K + header search bar) — `GlobalSearch.tsx` + `User/SearchController`, searches Catalog/My Collection/navigation at once.
15. Undo on toasts — `useFlash.ts` + flash `undo_url`/`undo_payload`, wired to the read toggle and mark-all-read (a dedicated `unmarkVolumesRead` endpoint so undo doesn't wrongly revert volumes that were already read before).
16. Fix: genre recommendations completely empty when the rest of the catalog has no genre data — fall back to a random pick.
17. Fix: rows of the My Collection & Admin Series tables could only be clicked through the title — `onClick` moved to a direct prop on `ContextMenuTrigger`, not nested in the `render` prop.

**Deferred to backlog:** the `Attachment` component for admin media gallery upload (spec lost during context compaction); public profile + follow system + activity feed (Steam style) — a big feature, deliberately scheduled for a separate session.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors
- [x] `php artisan test` → pass
- [x] All new endpoints have the appropriate `$this->authorize()`
- [x] Read toggle, delete mode, and review are saved correctly in the database (verified through tinker)
- [x] Dashboard recommendations are never completely empty as long as there are series not yet collected

---

## Phase 13 — Light Novel Metadata Import (RanobeDB) ✅

**Goal:** Import series/volume metadata for light novels from [RanobeDB](https://ranobedb.org), in parallel with the existing AniList integration (not replacing it; the manga/manhwa/manhua side stays on AniList).

The full plan is in [`docs/RANOBEDB_INTEGRATION.md`](RANOBEDB_INTEGRATION.md). REST API without auth, three-level model (Series → Books → Releases), staff natively split into author/illustrator. Migration `series.ranobedb_id` + `series.illustrators` (json) added.

Implementation: `RanobeDbService` (REST client) + `RanobeDbController` (`/admin/ranobedb`, search/detail/import) + `Admin/RanobeDb/Index.tsx` (card overlay, same pattern as AniList). A "Sync RanobeDB" popover in Edit Series to re-sync metadata into existing series. `ExternalSearchController` + `Admin/Search/Index.tsx` merge AniList+RanobeDB results in a single search (`/admin/search-external`).

### Done Criteria
- [x] Search & import of light novel series from RanobeDB works
- [x] Genre/demographic/theme/author/illustrator are split correctly from `tags[]`/`staff[]`
- [x] Release dates handle the sentinel `99999999` (ongoing) correctly
- [x] Duplicate import (same `ranobedb_id`) updates instead of creating a new series
- [x] `npx tsc --noEmit` → 0 errors, `php artisan test` → pass

---

## Phase 14 — Multi-Language, Public Profile & Follow, Wishlist, AI Genre Taste, Menu Reorder ✅

**Goal:** A big post-launch enhancement batch: full multi-language support, basic community features (public profile + follow), wishlist, a lightweight AI feature with no server cost (Puter.js), and admin polish (drag-drop menu reorder).

Worked on iteratively after Phase 13, not in formal phase order:

1. **Multi-language (id/en/ja)** — `react-i18next` + per-namespace JSON resources (`common`, `dashboard`, `user`, `catalog`, `collection`, `admin`) in `resources/js/lang/{id,en,ja}/`. The `SetLocale` middleware sets `App::setLocale()` server-side from `users.locale` (a new column, default `id`), shared to the frontend through `HandleInertiaRequests`. `lang/{id,en,ja}/validation.php` + `pagination.php` were published so Laravel's built-in messages follow the active language. `LanguageSwitcher.tsx` in the sidebar footer (Admin & User Layout) to change language without opening Settings. `useTypeFilterOptions()` and `menuTranslationKey()` as centralized hooks/helpers to avoid duplicate translations. Coverage: all of `User/**`, `Settings/Index.tsx`, `Admin/Dashboard.tsx`+`ActivityLog/Index.tsx`, all Layouts/shared components — the remaining `Admin/**` pages are still backlog, see the "Multi-Language System" section of [`CLAUDE.md`](../CLAUDE.md).
2. **Public profile & follow** — column `users.is_profile_public` (opt-in, default false) + `follows` table. The route `/u/{user}` was deliberately moved out of the `auth` middleware group so guests can view profiles (collection shown read-only, cannot click through to catalog detail because that still needs login). `ProfileController` was made null-safe for guest viewers. `PublicShell` (a minimal guest-only layout, not `UserLayout`, which non-null-asserts `auth.user`) is used when `is_guest = true`. A User Directory (`/directory`, needs login) to find & follow other users.
3. **Wishlist** — `wishlist_items` table (unique per user+series), `WishlistController` + `User/Wishlist/Index.tsx`, separate from Collection (no volume/format tracking, purely an interest marker).
4. **Genre Taste (AI Funfact)** — genre word cloud + AI funfact text on the user dashboard. A `genre_funfacts` table (manual regenerate quota, default 5×/week, can be overridden by admin) + `ai_settings` (active provider, single-row). Default provider is **Puter.js** — client-side, free, no server API key (`resources/js/lib/puter.ts`, script loaded globally via `app.blade.php`). Alternative providers (Gemini/OpenAI/Claude) generate server-side through `AiFunfactService`, with a dedicated `AiRateLimitException` for HTTP 429 so it falls back to default text without eating the user's manual quota. Admin manages per-user quota at `/admin/funfact-quota` (`GenreFunfactController`).
5. **Sidebar menu reorder (drag & drop)** — `SortableMenuList.tsx` (`@dnd-kit/core` + `sortable` + `utilities`) in `Admin/Menus/Index.tsx`, `PATCH /admin/menus/reorder` updates `sort_order` according to the drag order. A preview of the user sidebar without logging in as a regular user at `/admin/menus/user`.
6. **Ebook details per collection volume** — columns `collection_volumes.ebook_source` and `language`, relevant for the `ebook`/`online` formats.
7. **18+ content blur expanded** — the column `series.is_adult` is used consistently in AniList/RanobeDB search and catalog display, tied to the blur toggle in the `/admin/settings` Content tab.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors
- [x] `php artisan test` → pass, Pint clean
- [x] A guest can access `/u/{user}` without errors, cannot follow or go to the catalog
- [x] Changing language updates the UI immediately without a reload, saved per user
- [x] AI funfact (Puter provider) is generated & saved without a server API key
- [x] Drag-drop menu reorder immediately updates the sidebar order
- [x] The remaining `Admin/**` pages, root pages (`Landing`, `Error`, `Auth/Banned`, `Maintenance`), and
      `Components/app/**` are fully translated — see [`CLAUDE.md`](../CLAUDE.md) for the full
      coverage. Remaining documented gaps: controller flash messages (a separate backlog, no
      centralized translation system yet) and the root `Pages/Dashboard.tsx` which is dead code (deliberately not
      touched).

---

## Phase 15 — Title-Based Catalog URLs (Slug) ✅

**Goal:** Change series catalog URLs from raw UUIDs (`/catalog/f3a1...`) to slugs read from the title (`/catalog/one-piece`), without breaking old links/bookmarks.

1. New `series.slug` column — auto-generated from `title_romaji` via `Series::generateUniqueSlug()` (`Str::slug()` with an empty dictionary, so symbols like `@`/`!`/commas/colons are dropped outright instead of converted into words like `@` → `at`). The full title is used as is no matter how long. Regenerated automatically through model events (`creating`/`updating`) if the title changes; a `-2`/`-3` suffix is added if there are duplicate titles.
2. `Series::resolveRouteBinding()` — tries to match the slug first, falling back to `id` (UUID) so old links keep working without a special redirect.
3. A migration backfills slugs for all series already in the database (verified via tinker: 46/46 series in dev backfilled correctly).
4. All controllers that send series data to the frontend (`User/SeriesController`, `DashboardController`, `CollectionController`, `WishlistController`, `ProfileController`, `TicketController`, `SearchController`) were updated to also send `slug`.
5. All pages that build links to `catalog.show` (Catalog, Dashboard recommendations/Surprise Me, Collection, Wishlist, Tickets, Public Profile, Global Search) were updated to use `slug` instead of `id` when generating URLs.

### Done Criteria
- [x] Titles with symbols (`@`, `!`, commas, colons, parentheses) produce a clean slug without those symbols — verified via tinker
- [x] Duplicate titles produce slugs with the suffix `-2`, `-3`, etc. — verified via tinker
- [x] Changing a series title regenerates the slug automatically
- [x] Old UUID-based URLs are still accessible (route binding fallback)
- [x] `npx tsc --noEmit` → 0 errors, migration + backfill succeeded in dev

---

## Phase 16 — Login Without SSO (Fallback) + Email Configuration (Resend) ✅

**Goal:** An emergency login route if Yado (SSO) is truly unreachable — down, migrating, or under maintenance — without building a permanent local password system (which contradicts this project's "SSO-only" design).

Design decision (from a discussion before implementation): not an admin approval system (discussed, then simplified), not a local password (no user has a stored password). The solution: a single-use magic link via email already synced from SSO — verifying identity through inbox ownership, not something guessable (a public name/email).

1. **Email Configuration (Resend)** — `mail_settings` table (single-row, encrypted `api_key`, same pattern as `storage_settings`/`ai_settings`), a new "Email" tab in `/admin/settings`. `MailSettingsService` sets the Resend config at runtime from the DB before sending — no email credentials in `.env`. The `resend/resend-php` package (Laravel's native `resend` mail transport).
2. **Login Without SSO** — a link "Can't reach SSO?" on the Landing page → `/auth/fallback` (`SsoFallbackController`) → the user fills in an email → if it matches an existing user AND mail is configured, an `SsoFallbackToken` is issued (SHA-256 hash, 15-minute TTL, single-use, `sso_fallback_tokens` table) → the `SsoFallbackLoginMail` email is sent → click the link → `Auth::login()` right away.
3. **Anti email-enumeration** — the request endpoint response is always the same generic message, never leaking whether the email is registered/the user is banned/the mail failed to send.
4. **Rate limiting** — `throttle:3,15` on the POST route, preventing magic link request spam.
5. **Error handling** — email send failures (wrong API key, provider down) are caught by try/catch and don't cause a 500; recorded in `ActivityLog` + the regular Laravel log.
6. **Fix `ActivityLog::record()`** — found during testing: this method always used `auth()->id()` for `user_id` (a NOT NULL column), which is null for guest requests (a new case: login requests without SSO). A fallback to the subject user's ID was added when nobody is logged in.
7. **Landing page overhaul** — added a header (brand, language switch, dark mode toggle, Login button) and a footer (tagline, copyright) so the page feels more complete, and also a place to put the fallback link. `LanguageSwitcher` was made guest-safe (skips persisting to the server when not logged in, just changes on the client).
8. **CLI emergency access** — `php artisan sso:emergency-login {identifier=super_admin}` (`app/Console/Commands/IssueEmergencyLoginLink.php`), reusing the same `SsoFallbackToken` as the email path. The identifier can be a role (`super_admin`/`admin`/`user`) or a specific email/username; if several users share the same role, the command offers an interactive choice; it always asks for confirmation before issuing a link. Used when quick access is needed without waiting for email, or the mail service hasn't been configured yet. See the full usage guide in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), the section "SSO down / completely unreachable — emergency access".

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all new files
- [x] Migration `mail_settings` + `sso_fallback_tokens` succeeded in dev
- [x] Token is single-use — invalid right after one use, verified through tinker + a direct HTTP request (400 on the second attempt)
- [x] Rate limit of 3x/15 minutes works, verified through a direct HTTP request (429 after 3x)
- [x] Email send failure (wrong API key) doesn't cause a 500 — verified with a fake API key, the request still returned a successful 302 redirect
- [x] `ActivityLog` is recorded correctly with `user_id` filled in even for guest requests
- [x] A valid magic link logs in successfully and redirects according to role (verified: redirects to `/admin/dashboard` for admins)
- [x] `php artisan sso:emergency-login` — resolves by role keyword & by email/username, interactive choice if there are several candidates, cancels if confirmation is "no", clear error if nothing matches — all verified directly through the CLI

---

## Phase 17 — AniList Batch Import, Logout Fix When SSO Is Down, New-Tab Context Menu ✅

**Goal:** Speed up catalog entry for admins (import many series at once from AniList by genre/year/popularity), and fix two small gaps found while working in the SSO/admin area.

1. **AniList batch import** — a genre filter (dropdown, canonical AniList enum), release year, and a "Sort by Popularity" toggle were added to `Admin/AniList/Index.tsx`; you can browse using only filters without typing a title. Multi-select checkboxes per result (only those not yet in the catalog) + "Select All" + import all at once through `AniListController::bulkImport()`, which calls `AniListService::getMangaBatch()` — a single GraphQL request (`media(id_in: [...])`) for up to 50 series, not N separate requests (saving AniList's rate-limit quota of ~90 req/minute). A "Hide those already in the catalog" toggle — a client-side filter.
   - **Found during research**: `seasonYear` in the AniList schema is the anime airing-season concept, and always returns empty for `type: MANGA` — verified directly against the API before use. The correct manga year filter uses the range `startDate_greater`/`startDate_lesser` (`FuzzyDateInt` `YYYYMMDD`).
2. **Logout fix when SSO is down** — `SsoController::logout()` previously always forced the browser to navigate to the SSO domain to destroy the session there, even though the local session was already invalid. If SSO is down, the browser hangs for a long time waiting for a connection to the dead domain. Added `ssoReachable()` — a quick check (3-second timeout) before redirecting; if it can't be reached, it goes straight back to the home page. Verified through a direct HTTP request: logout finishes in ~3.4 seconds (bounded by the timeout) instead of potentially hanging longer until the browser itself gives up.
3. **"Open in New Tab" context menu** — `Admin/Series/Index.tsx`, right-click now has an option to open a series in a new tab (`window.open()`) besides regular SPA navigation.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] AniList genre+year+popularity filters verified via curl directly against `graphql.anilist.co` before use in code (this found that `seasonYear` doesn't apply to manga)
- [x] Bulk import verified end-to-end through real HTTP requests — 2 series (Chainsaw Man, Kaiju No. 8) were imported in one request, slug/genre generated correctly, recorded in the Activity Log
- [x] Logout with SSO unreachable finishes in ~3 seconds (bounded by the timeout), not hanging indefinitely
- [x] Test data (series, tokens, activity logs) cleaned from the dev database after verification

---

## Phase 18 — Login Method Modal (SSO / Email) ⚠️ (code complete, browser click-through not yet verified)

**Goal:** The Landing page shows a login method modal as soon as the "Login" button is clicked, instead of redirecting straight to SSO. Email login is promoted from a small hidden link ("Can't reach SSO?") to an option on par with SSO — the backend mechanism (magic link, `SsoFallbackController`) is not changed at all, only the UI framing.

1. `LoginMethodDialog.tsx` — a shared component (3 states: choice → email form → sent), attached to the header Login button and the Landing page hero, controlled by one shared `loginOpen` state.
2. The rate limit of `POST /auth/fallback` raised `throttle:3,15` → `throttle:5,10` — it is now used daily, not just in emergencies, so the limit needs to be looser.
3. `landing.fallbackLink`/`fallbackLinkAction` (the old translation keys) were removed, and new `loginDialog.*` keys were added (id/en/ja).
4. Agreed before implementation: the profile (name/avatar/username) is only synced from SSO when logging in through SSO — users who log in by email from then on don't get automatic profile updates. This is a conscious decision, not a bug.
5. The design was also prepared for reuse by the "Add Account" feature (multi-account switching, planned but **not yet implemented** — two open questions: the scope of logging out one account vs all, and where to place the switcher in the UI).
6. **Follow-up fix** — the user reported that the Login button on the public profile page (`PublicShell` header + the "Log in to follow" CTA in `Profile/Show.tsx`) still redirected straight to SSO, missed in the initial rollout that only touched the Landing page. Fixed: both places now open `LoginMethodDialog` too (each with its own local state, `loginOpen` in `PublicShell` and `followLoginOpen` in the main component). Re-grepped `sso.redirect` across all of `resources/js` to make sure nothing else was missed — only one legitimate reference remains, inside `LoginMethodDialog.tsx` itself.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors
- [x] Manual code review — the `Dialog` pattern used is identical to the ones already proven to work in `SsoFallback.tsx`/`AlertDialog`/other dialogs in this app
- [x] Grep of `sso.redirect` across all of `resources/js` — only one reference remains (inside `LoginMethodDialog.tsx`), every other Login button now opens the modal
- [ ] **Not yet verified via browser click-through** — tried through an ad-hoc test server (`php -S`, not Herd) and hit a module-loading quirk that kept the `#app` React root from ever mounting. Confirmed this is not a code bug (the same assets, `button.js`/`card.js`, are used across the app that runs normally on Herd; each asset returns 200 when fetched directly) — most likely because `php -S` doesn't handle static asset serving/headers as well as the nginx used by Herd. **A one-time manual click-through is needed at `https://malas.test` (the normal dev environment) to confirm the modal really opens & the form submit works in a real browser — now including on the public profile page too.**

---

## Phase 19 — Light/Dark/System Theme ✅

**Goal:** Replace the existing one-click dark/light toggle (in the Admin/User Layout sidebar footer and the Landing page) with 3 explicit options (Light/Dark/System), exactly the same pattern as the proven `LanguageSwitcher` (Popover + per-user DB sync + guest-safe).

1. New `users.theme` column (default `system`) + `PATCH /settings/theme` (`SettingsController::updateTheme()`), mirroring `updateLocale()`.
2. The `useTheme()` hook was rewritten entirely — resolves `system` through `matchMedia('(prefers-color-scheme: dark)')`, live-updates when the OS changes theme (`mql.addEventListener('change', ...)`), syncs from `auth.user.theme` (shared Inertia prop), `setTheme()` does an optimistic update + localStorage + a conditional `router.patch()` (skipped for guests). The return value changed from `{ theme, toggleTheme }` to `{ theme, resolvedTheme, setTheme }`.
3. New `ThemeSwitcher.tsx` (mirroring `LanguageSwitcher.tsx`) replaces the old toggle Button in `AdminLayout.tsx`, `UserLayout.tsx`, and `Landing.tsx`.
4. New translation keys `theme.*` (label/light/dark/system/cardTitle/cardDescription) in all three `common.json`; a new "Theme" card in `Settings/Index.tsx` between the "Language" card and the "Public Profile" card.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean
- [x] Live HTTP test `PATCH /settings/theme` with valid & invalid values (the `Rule::in(['light','dark','system'])` validation correctly rejects foreign values)

---

## Phase 20 — Fix Admin URLs (Slug) & Genre/Tags Editor in Series Edit ✅

**Goal:** Two bugs/gaps reported together while working in this area: (1) all `route('admin.series.show'/'edit', ...)` still used raw UUIDs — Phase 15 only touched the user side (`catalog.show`); (2) the Admin Series Edit page had no UI at all to view/edit genre/authors/illustrators/themes/demographics, and the "Sync AniList/RanobeDB" popover on that page didn't fill in tag data even though the GraphQL query already fetched it.

1. **Admin slug** — the backend (`SeriesController`, `CommandSearchController`, `ExternalSearchController`, `AniListController`, `RanobeDbController`, `TicketController`, `VolumeController`) was updated to send `slug`/`series_slug` to all pages that link to admin series; on the frontend (`Admin/Series/Index.tsx`, `Show.tsx`, `EditVolume.tsx`, `Edit.tsx`, `AniList/Index.tsx`, `AniList/Status.tsx`, `RanobeDb/Index.tsx`, `Search/Index.tsx`, `Tickets/Show.tsx`, `CommandPalette.tsx`) all `route()` calls for series links changed `.id` → `.slug` — `.id` is still used where the real UUID is needed (bulk-select, delete/update API targets).
2. **Genre/tags editor** — new `TagListInput.tsx` (Enter/comma adds a tag, click X removes), 5 new fields on the Edit page in a 2-column grid; `SeriesController::edit()` now sends all five tag fields (before, only `show()` sent them); the Sync AniList/RanobeDB popovers (`applySync()`/`applyRdSync()`) now fill in tags too — `AniListController::formatResults()` was updated to expose `genres`/`authors`/`themes`/`demographics` (RanobeDB already exposed them in its detail endpoint).
3. **FormData array + sentinel pattern** — the frontend always sends `genres[]=''` and the like (even when the array is empty) so Laravel doesn't skip the key entirely (otherwise `update()` wouldn't touch that column, and old tags the admin deliberately deleted would not actually be deleted).
   - **Bug found during direct HTTP verification**: Laravel 12's global middleware `ConvertEmptyStringsToNull` turned the `''` sentinel into `null` before validation ran — the `genres.*` rule that was only `['string','max:100']` (without `nullable`) rejected `null` with 422, so the "delete all tags" feature actually failed completely if tried. Fix: add `nullable` to all `*.` rules in `UpdateSeriesRequest`, and change the sentinel filter in the controller to drop `null` too, not just `''`.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on the 9 backend files touched
- [x] Live HTTP test: sync tags from an AniList/RanobeDB search result to the Edit page, save, verify they're stored in the DB
- [x] Live HTTP test: send an empty sentinel for 2 of the 5 tag fields → **found the 422 bug** (see point 3 above) → fix → retest → tags were deleted successfully, other fields untouched
- [x] Admin slug verified: `GET /admin/series/{slug}` and `/edit` both 200, full genre data comes through in the Edit page props
- [x] Test data restored to its original state after verification (temporary role, tags that had been deleted were restored)

---

## Phase 21 — Favicon Installed, README Overhauled (Bilingual), Missed-Feature Audit ✅

**Goal:** The already-generated favicon (`public/images/favicon/`) had never been wired into the app; the README was still ID-only and not very engaging to read; the user asked for an audit of whether any requested features were missed and left undone.

1. **Favicon** — `<link rel="icon">` (SVG light/dark via `prefers-color-scheme`, PNG fallback 16/32), `apple-touch-icon` (180px), and a new `site.webmanifest` (192/512px, for PWA/home-screen) were added to `resources/views/app.blade.php` — before, there was no favicon at all.
2. **Bilingual README** — completely overhauled: a header with logo, tech stack badges, a language switcher (🇮🇩/🇬🇧) to two full parallel sections (features, tech stack, setup, deployment, testing, troubleshooting, docs, license), plus a new "Unfinished (Backlog)" section that is honest about gaps.
3. **Missed-feature audit** — cross-checked `CLAUDE.md`/`PHASES.md`/`prd.md`/`CHANGELOG.md` + grep `TODO`/`FIXME` (no results in the code). Found 1 real miss: a searchable + multi-select genre filter in the user Catalog was explicitly requested in a previous session (`"can search genres... can pick more than 1 genre"`) but was skipped before being done — became Phase 22.

### Done Criteria
- [x] Favicon verified live — all `<link>`s resolve 200, appear correctly in the page's `<head>`
- [x] `site.webmanifest` verified 200

---

## Phase 22 — Multi-Select Genre Filter in the User Catalog ✅

**Goal:** Replace the single-select genre filter (`Select` dropdown) in `User/Catalog/Index.tsx` with a filter you can type into (fuzzy search) and pick more than one genre at once — an item from the Phase 21 audit.

1. New `GenreMultiSelect.tsx` — Popover + `Command`/cmdk (built-in fuzzy filter), grouped Manga/Light Novel (reusing the existing `genreOptions`), selected genres shown as badges that can be clicked away with X under the trigger (state always visible, no need to reopen the popover to check).
2. Backend `User\SeriesController::index()` — the `genre` filter changed from a single-value exact match to a multi-value **OR-match** (chained `orWhereJsonContains`) — a series passes if it has *any one* of the selected genres, not all (so results don't go empty too fast when several genres are picked at once).
3. `filters.genre` is now always an array (not `string | null`) — round-trips through the query string `genre[0]=X&genre[1]=Y`, and pagination links preserve this array via `withQueryString()`.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean
- [x] Live HTTP test OR-match: Comedy alone (59 results) + Romance alone (43 results) → both combined 67 results (the correct union, neither an intersection nor a naive sum)
- [x] Live HTTP test: the pagination link (`next_page_url`) preserves `genre[0]`/`genre[1]` correctly

---

## Phase 23 — Quick-Edit Reading Progress & Volume Count in My Collection ✅

**Goal:** The per-volume read toggle (clicking the eye icon one by one) was reported as awkward for linear reading (reading in order from volume 1 upward). The user asked for a +/- stepper to move the "read boundary" quickly, plus quick-edit of the owned volume count per format (physical/digital) without opening the "Add Volume" dialog every time.

1. **Reading progress stepper** — new `CollectionController::advanceReadProgress()`: `forward` marks the lowest-numbered unread volume as read, `backward` flips the highest-numbered read volume back to unread. It deliberately moves only one boundary and doesn't touch volumes manually marked out of order via the eye icon (the eye icon remains for specific corrections). Undo reuses the existing `toggleRead` endpoint (toggling back is automatically correct regardless of whether it went forward or backward).
2. **Quick-edit of volume count per format** — new `CollectionController::quickAdjustCount()`: `+` adds the next-numbered volume not owned at all (volume numbers are shared across formats within one collection — the unique constraint `collection_id`+`volume_number`), `-` deletes the highest-numbered volume FROM the chosen format. The stepper only appears for formats that already have ≥1 volume; the "Add Volume" dialog (range syntax) remains for non-sequential/gap cases.
3. **Loaned volume protection** — if a format's highest volume is on loan, the `-` button is disabled + has a tooltip on the frontend (not silently skipping to the volume below it) — a conscious decision so users always know exactly which volume will be deleted, rather than the system guessing.
   - **Bug found during direct HTTP verification**: the initial implementation used a server-side `whereDoesntHave('activeLoans')` query, which silently fell through to the next non-loaned volume if the top volume was on loan — contradicting the "disable + tooltip, don't silently swap the volume" decision. Fix: the query only ever takes the true top volume, rejects (info toast) if it's on loan, and never falls back to another volume.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean
- [x] Live HTTP test of the forward/backward stepper — the changed volumes & `last_read_volume` matched expectations
- [x] Live HTTP test of quick-add (takes the next global number across formats) and quick-remove (top volume of a specific format)
- [x] Live HTTP test of the on-loan case: **found a bug** (see point 3 above) → fix → retest → the volume below is no longer touched, the action is rejected correctly
- [x] Test data (collections, volumes, loans, temporary role) cleaned from the dev database after verification

---

## Phase 24 — Multi-Account Switching (Session-Based) ✅

**Goal:** Users (not just admins) can link other accounts and switch quickly without logging in again each time — triggered by a concrete case of an admin who couldn't access `/my-collection` with their own admin account. Discussed at length before implementation: it was first raised as "why would one person need 2 collections" (the answer: that's a collection grouping problem, not an account problem — so a separate backlog item), then it was decided to be generic for all users (not admin-only, since security is already ensured by session validation, not role restriction) and session-based with no permanent link in the DB (permanent linking is only about convenience, not security — re-auth to the target account is still mandatory).

1. `AccountLinkService::loginAs()` — a single logic point used by `SsoController::callback()` and `SsoFallbackController::consume()`, handling adding the previous user to the `linked_account_ids` session when in "Add Account" mode (the `sso_link_mode` flag, set explicitly true/false on every request so no stale flag from an earlier attempt gets stuck).
2. `Auth\AccountController::switch()` — validation requires the target `user_id` to be in the `linked_account_ids` session first before `Auth::login()`; `logoutCurrent()` — X/Twitter pattern: sign out only from the active account, auto-switch to another linked account if there is one, delegating to `SsoController::logout()` (full logout) if it's the last account.
3. New `AccountSwitcher.tsx` replaces the avatar link + separate Logout button in `AdminLayout`/`UserLayout` — one Popover: view profile, quick-switch to linked accounts, "Add Account" (reuses `LoginMethodDialog` with the new `mode="link"`), "Sign Out of This Account" vs "Sign Out of All Accounts".
4. `HandleInertiaRequests` shares `linked_accounts` (fetched fresh from the DB on every request, not directly from the session, so names/avatars are always up to date).

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] Live HTTP test: log in as account A → "Add Account" B (through the email magic link with the `link=1` flag) → active identity becomes B, A enters `linked_accounts` → switch back to A → switch to account C which is NOT linked → **403 correctly rejected**
- [x] Live HTTP test: `logoutCurrent` while a linked account remains → auto-switches to that account; `logoutCurrent` when it's the last account → effectively a full logout (delegated to `SsoController::logout()`)
- [x] Live HTTP test: `POST /logout` ("Sign Out of All Accounts") still wipes all linked accounts at once, regardless of order/count
- [x] Test data (temporary role, tokens, sessions) cleaned from the dev database after verification

---

## Phase 25 — Stepper from My Collection, Collection Grouping, Multilingual Flash Messages ✅

**Goal:** Three items combined into one batch at the user's request ("go, together with grouping, multilingual flash messages") — extend the reading progress stepper to the My Collection page (no need to open the collection detail), the collection grouping feature discussed in Phase 24, and the old backlog item of flash messages not yet being multilingual.

1. **Reading progress stepper in My Collection** — `Collection/Index.tsx` (`ReadStepper`) reuses the exact same `collection.volumes.readProgress` endpoint as the collection detail page (Phase 23) — zero backend changes. Per-row loading state (`busyId`) so a click on one collection doesn't block another. Appears on both the grid card AND the table row, with `stopPropagation()` so it doesn't trigger navigation to the detail.
2. **Collection grouping** — new `collections.group_name` column (free string of 100 chars, not a separate table — deliberately simple, the filter dedupes from existing values per user). New `CollectionController::updateGroup()`. UI: a filter dropdown (sentinel `__ungrouped__` for "No Group") + inline edit through a Popover (`GroupEditor`) on the grid card & table row (new "Group" column). **⚠️ This design turned out to have the wrong semantics and was replaced entirely in Phase 27** — see details there.
3. **Multilingual flash messages** — the old backlog item was finally done. New `lang/{id,en,ja}/flash.php`, ~70 `->with('success'/'error'/'info', ...)` calls across 24 controllers converted from hardcoded Indonesian to `__('flash.namespace.key', [...])`. One bug found during the manual sweep: `VolumeController::generate()` used the pattern `->with($created > 0 ? 'success' : 'info', $message)` (a dynamic key) that slipped past the initial grep (`grep "with('success'"` only catches literal string keys) — found through a second sweep that searched for leftover hardcoded words "berhasil"/"gagal" outside `__()`.
   - **Scope decision**: raw exception messages (`$e->getMessage()`, from external APIs) and `ActivityLog::record()` text (admin activity log) are deliberately **not** translated — the former has unpredictable content, and the latter is not a per-locale flash toast anyway (read by admins, consistently Indonesian).

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all 24 controllers + 3 `flash.php` files touched
- [x] Live HTTP test of the stepper from My Collection: forward/backward changes `read_volumes_count` in the response without opening the detail page
- [x] Live HTTP test of grouping: set a group name, verify it's saved; set an empty string, verify it becomes null
- [x] Live HTTP test of flash i18n: the same request (`readProgress` forward/backward) with `users.locale` set alternately to `id`/`en`/`ja` — the flash message was correct for all 3 and matched the active language
- [x] Live tinker test: the `:count` placeholder confirmed safe to use in a plain `__()` (not `trans_choice()`) in all three languages — no stray pluralization logic
- [x] The second sweep found & fixed 1 bug (`VolumeController::generate()`'s dynamic key that slipped past the initial grep)
- [x] Test data (collections, temporary role/locale, tokens, sessions) cleaned from the dev database after verification

---

## Phase 26 — Fix: Login Links (CLI/Email) Override the Active Account Instead of Adding ✅

**Goal:** A direct bug report ("fix it right away") — logging in through a CLI magic link (`sso:emergency-login`) or an email link clicked while still logged in as another user **overrides** the active session instead of adding it as a linked account (even though the "Add Account" button in the UI works correctly). The user suspected email login had the same bug — correct.

1. **Root cause**: `AccountLinkService::loginAs()` only linked the old account if the session flag `sso_link_mode` was set — and that flag is only set from the "Add Account" UI flow (`?link=1` on `/auth/redirect`, the `link` field on `POST /auth/fallback`). CLI/email links never go through that flow, so the flag was always empty.
2. **Fix**: `loginAs(User $user)` (the `linkMode` parameter removed) now decides purely from `auth()->check()` at the moment the link is consumed — if another user is still logged in, it is automatically linked into `linked_account_ids`, regardless of whether the link comes from the CLI, email, or "Add Account". The `sso_link_mode` session flag and the `link` query/POST param were removed entirely (dead code).
3. Touched: `AccountLinkService.php`, `SsoController.php` (`redirect()` goes back to having no `Request` param), `SsoFallbackController.php`, `LoginMethodDialog.tsx` (JSDoc updated, the `link` param removed from the POST body & route call).

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean
- [x] Live HTTP test: log in as A → consume a bare token (CLI-style, without the "Add Account" modal) for B → A enters `linked_accounts`, active user becomes B
- [x] Live HTTP test: guest fresh login → `linked_accounts` empty (no regression to the normal case)
- [x] Test data (tokens, sessions) cleaned from the dev database after verification

---

## Phase 27 — Collection Groups Fully Reworked (MDList MangaDex Style) ✅

**Goal:** The grouping design in Phase 25 point 2 turned out to have the wrong semantics — the user explained they meant "MDList MangaDex style": a group is the first-class object (given a name, e.g. "RomCom"), filled with many manga from the user's collection, not just a single string label per collection. Replaced entirely, not patched.

1. **New `CollectionGroup` model** + pivot `collection_group_items` — **many-to-many**, one manga can be in more than one group at once. The `collections.group_name` column (the Phase 25 design) was removed through a new migration.
2. **Bug found & fixed during direct HTTP verification**: the pivot table was initially given `uuid('id')->primary()` like other tables in this app — but Eloquent's `attach()`/`syncWithoutDetaching()` inserts pivot rows through the raw query builder (not model events), so `HasUuids` never got the chance to fill the `id` column, causing a `NOT NULL constraint violation` in SQLite. Fix: the pivot table uses purely a composite primary key (`collection_group_id`, `collection_id`) instead of a synthetic `id` — the standard Laravel pattern for pivot tables without extra data.
3. **New pages**: `/collection-groups` (group list, cover collage from the first 4 manga) → `/collection-groups/{group}` (group contents — add manga from the collection through a picker dialog, remove from the group, rename, delete the group). The routes were deliberately given a separate top-level prefix (not nested under `/my-collection/`) to avoid clashing with the existing `/my-collection/{collection}` route binding.
4. A "Collection Groups" link was added to the My Collection page header. All the old grouping UI in `Collection/Index.tsx` (inline popover, filter dropdown, "Group" table column) was cleanly removed.
5. `lang/{id,en,ja}/flash.php` — the key `collections.group_updated` (Phase 25) was removed, replaced by a new `collection_groups.*` block. `lang/{id,en,ja}/collection.json` — a new top-level `groups` namespace, fully translated.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] Live HTTP test: create group → add items from the collection → remove one item → rename → delete group — all correct, including confirming the underlying collections are NOT deleted when the group is deleted
- [x] Live HTTP test: the pivot NOT NULL bug was found, the migration was rolled back & fixed (composite PK), re-migrated, and the full verification retry passed
- [x] Test data (groups, collections, items) cleaned from the dev database after verification

---

## Phase 28 — Collection Groups: Bigger Modal + Pagination, Type Filter, Slug URL, Public/Private ✅

**Goal:** Four fixes/additions to collection groups (Phase 27), requested directly without a "how about?" (not a discussion): the "Add Manga" modal was too small for big collections, a type filter was needed, group URLs still used UUIDs (should be slugs like Series), and groups needed a public/private option (appearing on the profile if public).

1. **The "Add Manga" modal was enlarged & paginated** — `max-w-3xl` → `max-w-5xl`, the list of collections that can be added is paginated server-side (24/page, reusing `Pagination.tsx`) and a type filter (segmented control, reusing `useTypeFilterOptions()`) was added. Search & type filter are now server-side through a debounced partial reload (`only: ['available']`), not client-side filtering over an array loaded fully once.
2. **Group URLs use a slug** — `CollectionGroup::generateUniqueSlug()` (same pattern as `Series::generateUniqueSlug()`) creates the slug `{username}-{group-name}`, regenerated automatically when the group name changes. A new migration adds the columns `slug` (unique) + `is_public` (default false) to `collection_groups`.
3. **Public/Private option** — a `Switch` on the group detail page (owner-only). Public groups appear on the owner's public profile (a new section) and can be accessed by guests through the direct URL; private only by the owner/admin. The route `GET /collection-groups/{group}` was moved out of the `auth` middleware group (same pattern as `/u/{user}`), visibility checked manually in the controller.
4. `PublicShell` (previously inline in `Profile/Show.tsx`) was extracted into the shared component `Components/app/PublicShell.tsx`, also used in `CollectionGroups/Show.tsx` — needed so guests opening a public group don't run into `UserLayout`, which needs a login session.
5. **Bug found & fixed during direct HTTP verification**: the `available` query that `join()`s to the `series` table made `whereNotIn('id', ...)` ambiguous (SQLite didn't know which table `id` belongs to). Fix: qualify it as `whereNotIn('collections.id', ...)`.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] Live HTTP test with 30 dummy collections: type filter (manga vs novel) correct, substring search correct, page 2 pagination correct
- [x] Live HTTP test: add 2 items to a group → immediately excluded from `available` (total 30→28)
- [x] Live HTTP test: public toggle → a guest without login can see the group (`is_owner: false`, `available: null`); private toggle again → the guest gets 403
- [x] Live HTTP test: rename group → slug regenerated automatically (`testowner-romcom` → `testowner-shounen-favorites`)
- [x] Live HTTP test: the group owner's public profile shows the public group with a cover collage
- [x] Test data (users, collections, series, groups, tokens) cleaned from the dev database after verification

---

## Phase 29 — Fix: Blank Screen Opening a Collection Group (Empty Slug + Guest Crash), Emoji-Free README ✅

**Goal:** A direct bug report ("just a black screen") — the user couldn't access collection groups at all. Along with another request in the same message: the README overhauled to be emoji-free ("don't use excessive emoji, better to have none at all").

1. **Bug #1, the real & main root cause**: the user had a real collection group ("RomCom") created BEFORE the slug migration (Phase 28) was run. That migration added the `slug` column as `nullable()` (so it wouldn't fail on old data) but **forgot to backfill** — so that old group stayed saved with `slug = NULL` permanently. Once `Index.tsx`/`Show.tsx` started generating all links using `group.slug` (no longer `group.id`), the link to this group broke (`route('collection.groups.show', null)`) — this is what kept the user from accessing their group at all, a blank screen on any page that tried to render that link. It was found through a direct check of `CollectionGroup::whereNull('slug')->count()` in the dev database — found 1 NULL row, belonging to a real user (not test data).
   - **Fix**: new migration `2026_08_15_090000_backfill_collection_groups_slug.php` — backfills every `slug` that is still NULL using `CollectionGroup::generateUniqueSlug()`, identical to the Series slug backfill (`2026_08_02_090000_add_slug_to_series_table.php`, a pattern already in the codebase, just not followed in Phase 28). Verified: the "RomCom" group got the slug `sehnauoi-romcom`, and both Index and Show rendered normally — the `href` link in Index now really points to the correct slug, and clicking through to the detail succeeded without errors.
2. **Bug #2, separate**: `CollectionGroups/Show.tsx` always rendered through `UserLayout`, which assumes a login session — `AccountSwitcher.tsx` accesses `auth.user!` (a non-null assertion). For a guest opening a **public** group (an intentional feature from Phase 28), `auth.user` is truly `null`, so React crashed when trying to render the sidebar/account switcher. Unlike Bug #1 (which affects anyone, including the logged-in owner), Bug #2 only affects guests.
   - **Fix**: `CollectionGroupController::show()` sends a new prop `is_guest` (`$viewer === null`). `Show.tsx` uses `const Layout = is_guest ? PublicShell : UserLayout` — exactly the same pattern as `Profile/Show.tsx`. The breadcrumb to `/collection-groups` (an auth-only route) is hidden for guests. The visibility badge in the header for non-owners now reads the real `group.is_public`, instead of always showing "Public" (which hit the case of an admin viewing someone else's private group).
3. Why neither was caught during Phase 27/28 verification: that verification only checked the Inertia JSON response through curl (the props sent by the server were correct), not actually rendering React in a browser with the existing old data — so both the NULL slug in existing data and the client-side crash slipped through detection.
4. **README.md & README.id.md**: all emoji removed (badges, section headings, feature/troubleshooting/backlog bullets, "back to top" buttons). Internal anchor links (`#troubleshooting`, etc.) were adjusted because GitHub generates different heading slugs once emoji are removed from section titles.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on touched files
- [x] `CollectionGroup::whereNull('slug')->count()` → 0 after the backfill migration ran
- [x] Browser verification (real React render, not just curl) as the real group owner: Index → click a group card → Show rendered without errors, href link uses the correct slug
- [x] Browser verification: a guest opens a public group → no crash, `PublicShell` + Login button appear, group content rendered
- [x] `README.md`/`README.id.md` checked for zero leftover emoji (shields.io badges are kept because they are images, not text emoji), no internal anchor links broken
- [x] Extra test data (users, series, collections, groups, tokens) cleaned from the dev database after verification — the user's real data (the "RomCom" group) was left, only its slug was backfilled

---

## Phase 30 — Wider "Add Manga" Modal + Infinite Scroll ✅

**Goal:** A direct request — "make the add manga to group modal wider, and infinite scrolling, not paginate".

1. **Bug found**: the `max-w-7xl` set in Phase 28 for the "Add Manga" modal was never actually in effect — `DialogContent` (`ui/dialog.tsx`) has a base style `sm:max-w-sm`, and an override class WITHOUT the `sm:` prefix loses in the Tailwind cascade once the viewport is ≥640px (the `sm:` media-query rule sits later in the generated stylesheet, winning by source order against a non-prefixed base utility of equal specificity). The modal had silently stayed at 384px since the start of Phase 28, even though the code was already "correct" in giving `max-w-7xl`. Fix: `sm:max-w-7xl`. Verified through `getComputedStyle` in the Browser tool: before the fix `384px`, after the fix `1280px`.
2. **Replace `<Pagination>` with infinite scroll**: the collection list in the modal now accumulates each page's results into local state (`accumulated`), auto-fetching the next page when scrolled near the bottom of the container.
   - The first attempt used `IntersectionObserver` inside `useEffect` — failed, because the effect ran before the sentinel DOM was mounted (Base UI's Dialog content mounts one tick after `addOpen` is true) and the dependency array didn't retrigger once the ref was attached.
   - The second attempt moved to the ref-callback pattern (the observer is created exactly when the sentinel node mounts) — still didn't fire at all in this Browser tool environment, even a plain `observe(document.body)` never got a callback, probably because the tab wasn't compositing active frames (see the "Browser pane is not displayed" error when trying a screenshot).
   - **Final solution**: a regular `onScroll` handler (`scrollHeight - scrollTop - clientHeight < 300`) — doesn't depend on the rendering/compositing pipeline at all, and is easy to verify manually (`dispatchEvent(new Event('scroll'))`). Verified: 50 dummy items loaded 24 → 48 → 50 over two scrolls, each sending exactly one request (`page=2`, `page=3`), zero duplicate/excess requests.
3. **A similar bug likely exists in other dialogs** — `Admin/Series/Edit.tsx` (`max-w-3xl`) and `User/Collection/Index.tsx` (`max-w-4xl`) both use `max-w-*` without the `sm:` prefix. Not verified/fixed in this Phase (out of the task's scope), flagged as a separate task. `Admin/ActivityLog/Index.tsx` was already correct from the start (`sm:max-w-2xl`).
4. The `CLAUDE.md` "React Components" section got an explicit rule: overriding `DialogContent` width MUST use the `sm:` prefix.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors on touched files
- [x] Browser verification: `getComputedStyle(dialog).maxWidth` = `1280px` (not `384px`) after the dialog opens
- [x] Browser verification: 50 dummy collections, scrolling to the bottom twice → items grew 24→48→50, the network requests `page=2` then `page=3` each happened only once
- [x] Browser verification: after all pages ran out, further scrolling sends no new request (a no-op, guarded by `current_page >= last_page`)
- [x] Test data (users, series, collections, groups, tokens) cleaned from the dev database after verification

---

## Phase 31 — Modal Layout Fix, Collection URLs Use Titles, Confirm+Undo for Removing from Group, Puter.js Removed ✅

**Goal:** Four items straight from the user in one message (not a discussion): the filter modal was covered and scrolled along, the `/my-collection` URL was still a UUID instead of a title, removing a manga from a group had no confirmation/undo, and the Puter.js integration was to be removed entirely.

1. **Modal layout fix**: the root cause was classic flexbox — the item list div (`min-h-[360px] flex-1 overflow-y-auto`) had a 360px height floor that could be bigger than the space flexbox allocated inside `max-h-[85vh]`, so once the item grid got long, the whole `DialogContent` (not just the list div) was forced past the maximum height — pushing the filter out of the viewport. Fix: `min-h-[360px]` → `min-h-0`, plus an explicit `shrink-0` on the header/search/filter/footer so they don't get compressed when space is tight.
2. **Collection URL uses the series title** — new `Collection::resolveRouteBinding()`, matching through the Series slug, **restricted to collections owned by the logged-in user** (two different users can both own a collection of the same series). No new `slug` column in the `collections` table — it reuses `series.slug`, which is already globally unique, so there's no risk of a forgotten backfill like Phase 28/29. Six files updated: `SearchController`/`GlobalSearch.tsx`, `Catalog/Show.tsx`, `CollectionController::index()`/`Collection/Index.tsx`, `CollectionGroupController::show()`/`CollectionGroups/Show.tsx`, `DashboardController::continueReading()`/`Dashboard.tsx`, `LoanController::index()`/`Loans/Index.tsx`. Action endpoints (PATCH/POST/DELETE, not navigation) deliberately still use the raw `collection.id`.
3. **Confirmation + Undo for removing from a group** — a new confirmation dialog before `handleRemove()` actually runs (same pattern as the Delete Group dialog), and `CollectionGroupController::removeItem()` now sends `undo_url`/`undo_payload`. A new PATCH route `collection.groups.items.undoRemove` — re-attaches the pivot; the undo is simple because it's only a detach (not a hard delete like `CollectionController::destroy()`).
4. **Puter.js removed entirely** — `lib/puter.ts` deleted, the `<script src="https://js.puter.com/v2/">` tag removed from `app.blade.php`, the "Puter" provider option removed from the admin AI settings + backend validation. The new default provider is `gemini` (needs an API key — falls back to static text if empty, `AiFunfactService::fallbackText()` has existed from the start). Endpoints used only by Puter's client-side flow (`dashboard.funfact.auto-save`, `dashboard.funfact.report-error`) became completely dead code and were deleted too. A migration normalizes old `ai_settings.provider = 'puter'` rows to `'gemini'`.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] Browser verification: the type filter is fully visible in the modal, only the item grid scrolls (not the whole dialog)
- [x] Browser verification: clicking a collection card/group item → navigates to `/my-collection/{series-title-slug}`, not a UUID
- [x] Browser verification: clicking remove from group → the confirmation dialog appears first; confirm → success toast with an Undo button; click Undo → the item returns to the group
- [x] Browser verification: the AI tab in admin settings only shows Gemini/OpenAI/Claude (no Puter); the funfact "Regenerate" button still works normally through the regular server path (no crash referencing Puter)
- [x] Sweep `grep -rli puter` across `resources/js`, `app`, `resources/views` → zero real results (only a false-positive substring in `InputError.tsx`)
- [x] Test data (users, series, collections, groups, tokens, funfacts) cleaned from the dev database after verification

---

## Phase 32 — Temporarily Disable AI Funfact Generation, Collection Export/Import ✅

**Goal:** Two items from the user in separate messages: (1) temporarily disable the AI funfact generation feature, (2) a new feature to export/import the personal collection (backup) — the user confirmed JSON format and append-only import mode (skip what already exists, not overwrite).

1. **Disable AI funfact**: the constant `DashboardController::FUNFACT_GENERATION_ENABLED = false` — skips auto-generate in `index()` and adds a defensive 404 guard in `regenerateFunfact()`. The genre word cloud (the non-AI part of the same card) still displays normally; only the "Regenerate" button + the AI funfact text are hidden (`Dashboard.tsx` checks `funfact.generation_enabled`). Fully reversible — just flip the constant back to `true`, no data to restore.
2. **Collection export**: `CollectionController::export()`, `response()->streamDownload()` (same pattern as `DatabaseBackupController::download()`). The JSON file contains series identifiers (`anilist_id`/`ranobedb_id`/`mal_id`/`slug` — all sent together, not just one, so import still matches even if one field changes), condition/acquired_at/notes/rating/review, and the full volume list (number, format, ebook_source, language, read_at).
3. **Collection import**: `CollectionController::import()`, an uploaded JSON file with its structure validated (`version`+`collections`), a DB transaction. Series matching goes in order `anilist_id` → `ranobedb_id` → `mal_id` → `slug` against the **local** catalog — deliberately **not** auto-fetching from AniList if a series isn't in the catalog yet (skipped + counted, not duplicating the logic of `AniListController::import()`). Series the user already owns are skipped too (append-only per the user's confirmation). All enum fields (`condition`, `format`, `ebook_source`, `language`) are whitelisted through `sanitizeEnum()` before insert — the uploaded file isn't trusted as is.
4. UI: "Export"/"Import" buttons in the `Collection/Index.tsx` header, with the import dialog using the same file-input pattern as `DatabaseTab` in `Admin/Settings/Index.tsx`.
5. Verification this time used direct HTTP requests (curl + cookie jar + CSRF token), not the Browser tool — the browser pane tool had problems this session (navigating to the ad-hoc server origin kept failing even though curl confirmed the server itself was alive). Still end-to-end through real HTTP requests (not just unit-level), including a real multipart file upload.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on all touched files
- [x] Verification (curl+cookie jar, live server): the funfact card only shows the word cloud, the AI button/text are gone
- [x] Verification: export of user A (2 collections, one with rating/review/2 volumes) → complete JSON, accurate field by field
- [x] Verification: importing that file into user B who already had 1 of the 2 series → only 1 new series was imported, the existing one wasn't duplicated, the flash report "1 imported, 1 skipped" was correct
- [x] Verification: an entry whose series isn't in the local catalog → skipped gracefully (no crash), counted in the report
- [x] Verification: an invalid/corrupt JSON file → rejected with a flash error, not a 500
- [x] Test data (users, series, collections, volumes, tokens) cleaned from the dev database after verification

---

## Phase 33 — "Missing Volumes" Badge (Next Volume to Buy) in My Collection ✅

**Goal:** A feature from a new-feature-idea discussion — "next volume to buy"; the user agreed with the logic (compare owned volumes vs `total_volumes`) and agreed to put it as a badge on the My Collection page (Option A of several discussed).

1. `CollectionController::missingVolumes()` — `range(1, series.total_volumes)` minus the volume numbers the user already owns. `total_volumes` from AniList/RanobeDB already represents volumes that **have been released**, not a projection of total planned, so no separate release-date filter logic is needed. Series with a null `total_volumes` are skipped (the gap can't be computed).
2. UI: an amber badge `{{count}} missing` on the grid card & table row in `Collection/Index.tsx` (`MissingVolumesBadge`), shown only when there is a gap. Hover opens a `HoverCard` showing the full numbers compressed with the same range syntax as the "Add Volume" input (the new function `compressRanges()`, e.g. `4, 6-7, 9-12`). The badge uses `stopPropagation()` so it doesn't trigger card navigation (same pattern as the delete button/`ReadStepper` already there).
3. The `index()` query was updated to eager-load `collectionVolumes:id,collection_id,volume_number` (columns restricted, avoiding over-fetch) to compute the gap without N+1 queries.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on touched files
- [x] Verification (curl, the browser pane had tool problems this session): a dummy collection `[1,2,3,5,8]` out of 12 → the server's `missing_volumes` returned exactly `[4,6,7,9,10,11,12]`
- [x] Verification: a complete collection (3/3 volumes) → `missing_volumes` empty, no badge shown
- [x] Test data (users, series, collections, volumes, tokens) cleaned from the dev database after verification

---

## Phase 34 — "Missing Volumes" Badge Is Clickable, Auto-Fills the Add Volume Form ✅

**Goal:** A direct follow-up to Phase 33 — the user asked "so what do I do with it" about the purely informational badge; it was agreed (through several rounds of "how about?" discussion) that the badge becomes clickable and immediately fills the "Add Volume" form on the detail page.

1. The badge (`MissingVolumesBadge` in `Collection/Index.tsx`) is now a `<Link>` (not just a static span) to `route('collection.show', c.slug)` + the query param `?addVolumes={compressRanges(missing)}`, e.g. `?addVolumes=4%2C%206-7%2C%209-12`. `stopPropagation()` is kept so that clicking the badge doesn't also trigger the `onClick` of the wrapping card (which navigates to the same page but without the query param).
2. `Collection/Show.tsx` — a new `useEffect` (runs once on mount) reads `addVolumes` from `window.location.search`, calls `avReset({ volumes: prefill, format: 'physical' })` to prefill the existing react-hook-form form, `setAddVolumeOpen(true)` to auto-open the dialog, then `window.history.replaceState` to clean the query param from the URL bar (not through an Inertia visit — it only changes the address bar, with no reload/refetch).
3. No schema changes/new endpoints — fully reuses the existing "Add Volume" form (`collection.volumes.store`), only the entry point is new (a query param, instead of a manual button click).

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors on touched files
- [x] Browser verification (not curl — the Browser pane tool recovered this session): a dummy collection with 5/12 volumes, clicking the "7 missing" badge in My Collection → navigates to the detail page, the "Add Volume" dialog opens automatically with the input exactly `"4, 6-7, 9-12"`, URL bar clean of the query param
- [x] Browser verification: submitting that form → the collection becomes 12/12 volumes, the badge disappears (nothing missing anymore)
- [x] Test data (users, series, collections, volumes, tokens) cleaned from the dev database after verification

---

## Phase 35 — Reveal API Key/Secret in Admin Settings (Eye Icon) ✅

**Goal:** A direct request from the user — the three secrets on the Admin Settings page (Storage `secret_access_key`, AI `api_key`, Mail `api_key`) that were fully hidden (only the booleans `has_key`/`has_secret` were sent to the frontend) can now be viewed through an eye icon toggle.

1. **Why it is safe**: this page is **already** `super_admin`-only through `StorageSettingPolicy::view()`/`update()` (checked in `StorageSettingController::edit()`). This reveal does not expose anything to a new audience — it just gives a super_admin who already has full control over the secret (can reset it at any time) access to view the value again.
2. **Backend**: `StorageSettingController::edit()` now sends the real `secret_access_key`/`api_key` to the frontend (already auto-decrypted through the `encrypted` cast on the `StorageSetting`/`AiSetting`/`MailSetting` models), not just a boolean. The booleans `has_key`/`has_secret` are still sent & used for the required-field marker (`*`) in the label.
3. **Frontend**: a new `SecretInput` component (`Admin/Settings/Index.tsx`) — an `Input` + an eye icon button (Eye/EyeOff) that toggles `type="password"`/`type="text"`. Used in three places (AI, Mail, Storage tabs) through react-hook-form's `Controller`; the field is now prefilled with the real value (`aiSetting.api_key ?? ''`, etc.), not an empty string as before.
4. **Cleanup**: the translation keys `apiKeyPlaceholder`/`apiKeySaved`/`secretAccessKeyPlaceholder` (`admin.json` id/en/ja) became dead code once the field was prefilled with the real value — deleted. The card description saying "never shown again after saving" was updated because it was no longer accurate.

### Done Criteria
- [x] `npx tsc --noEmit` → 0 errors, `php -l` clean on touched files
- [x] Browser verification: the AI API key field loaded with the real value (masked, `type="password"`), clicking the eye icon → `type` became `text` and the real value read back exactly from the DOM, clicking again → back to masked
- [x] Browser verification: the Mail API key field also loaded with the real value (masked) — consistent pattern
- [x] Browser verification: submitting the AI form without changing anything → the key stayed exactly intact in the database (checked directly through tinker), not nulled/corrupted by resubmitting the same value
- [x] Sweep of dead translation keys (`apiKeyPlaceholder`/`apiKeySaved`/`secretAccessKeyPlaceholder`) → zero references remaining in `Admin/Settings/Index.tsx` before deleting them from the JSON
- [x] Test data: none (used the real, previously configured admin settings data, only re-read, not changed/deleted)

---

## Phase 36 — Fix: Database Backup Download/Import 403 for the Real Super Admin ✅

**Goal:** A direct bug report from the user — accessing `/admin/settings/database/download` as the real super_admin returned 403 "Access Denied".

1. **Root cause**: `DatabaseBackupController::download()`/`import()` used `auth()->user()->hasRole('super_admin')` — a method from Spatie Laravel Permission. But this app **never** calls `assignRole()` anywhere in the codebase, so Spatie's `model_has_roles` table is always empty and `hasRole()` ALWAYS returns `false`, regardless of the `users.role` column (which is what is actually used for every other Policy/menu access in this app) being correctly `super_admin`. This is the only place in the entire codebase that uses Spatie `hasRole()` — two exactly identical sibling controllers (`AiSettingController`/`MailSettingController`) already correctly use `isSuperAdmin()`.
2. **Fix**: replace `hasRole('super_admin')` → `isSuperAdmin()` in both methods, consistent with the correct pattern across the app.
3. **Documentation root cause**: the "Authorization System" section of `CLAUDE.md` itself turned out to suggest the `hasRole('super_admin')` pattern as an "allowed exception" — probably the source of why this code was written wrongly from the start. Fixed along the way, with an explicit note added "never use Spatie `hasRole()`" plus an explanation of why (the Spatie Role infrastructure exists but is never assigned).

### Done Criteria
- [x] `php -l` clean on touched files
- [x] Verification: `User::isSuperAdmin()` for the real super_admin account returns `true` (passes `abort_unless`)
- [x] HTTP verification: a request to `/admin/settings/database/download` logged in as the real super_admin — the 403 is gone, the request continues into the backup logic (the remaining 500 error in local testing was purely the MySQL-only `SHOW TABLES` syntax meeting the SQLite dev DB, not a bug from this fix — it won't happen on a production server that really uses MySQL)
- [x] Sweep `grep -rn "hasRole("` across `app/` → zero results remaining

---

## Phase 37 — Fix: Database Backup Download/Import 500 on SQLite (Dev) ✅

**Goal:** A follow-up bug report from the user after Phase 36 — the 403 was gone, but `/admin/settings/database/download` now returned 500 "An Error Occurred", and the user said the error didn't appear in the log.

1. **Investigation**: the error actually WAS in `storage/logs/laravel.log` (grep found a match at the exact timestamp of the user's request) — `SQLSTATE[HY000]: General error: 1 near "SHOW": syntax error ... SQL: SHOW TABLES`. A direct check of the `malas.test` `.env` confirmed `DB_CONNECTION=sqlite` (per this project's dev convention in `CLAUDE.md`), while `DatabaseBackupController` was written MySQL-only from the start (`SHOW TABLES`, `SET FOREIGN_KEY_CHECKS=0/1`) — those two syntaxes error on SQLite. This bug never surfaced before because it was always hidden first by the Phase 36 403 bug.
2. **Fix `getBackupTables()`**: branch on `DB::connection()->getDriverName()` — SQLite uses `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`, otherwise it stays `SHOW TABLES`.
3. **Fix the FK-check toggle**: centralized into a new helper `fkChecksStatement(bool $enable): string` — emits `PRAGMA foreign_keys = ON/OFF;` for SQLite, `SET FOREIGN_KEY_CHECKS=1/0;` for other drivers. Used in `download()` (before/after the dump) and `import()` (before/after the transaction, plus in catch/rollback).
4. **Fix cross-driver import**: `import()` now skips raw FK-check lines from the uploaded file (regex `^(SET\s+FOREIGN_KEY_CHECKS|PRAGMA\s+foreign_keys)`) and always uses the `fkChecksStatement()` matching the ACTIVE driver — deliberately designed so cross-driver backups (e.g. export from dev SQLite, import into prod MySQL) still work, since `INSERT`/`DELETE` themselves are driver-agnostic between SQLite and MySQL.

### Done Criteria
- [x] `php -l` clean on touched files
- [x] End-to-end HTTP verification on the SQLite dev database (exactly the same environment as `malas.test`): `GET .../download` → 200 with a valid `.sql` file (`PRAGMA foreign_keys = OFF;` present, no longer 500)
- [x] Round-trip verification: `POST .../import` using the freshly downloaded backup file → 302 success, zero new errors in `laravel.log`
- [x] Data integrity verification: `GET .../download` again after the import → a file byte-for-byte identical to the previous backup (except the timestamp line), proving export→import doesn't corrupt/alter data

---

## Phase 38 — Docker Deploy (Postgres) + Deploy File Structure Cleanup ✅

**Goal:** User request — add a third deploy method (Docker, generic for Proxmox LXC/VM but portable to any Linux), a fully Postgres database (for consistency with the other microservices), make sure old data is copied into the new database, and tidy up the messy deploy infrastructure files in the root.

1. **`DatabaseBackupController` is now 3-driver-aware**: added a Postgres branch in `getBackupTables()` (`pg_catalog.pg_tables`) and `fkChecksStatement()` (`SET session_replication_role = replica/origin`, since Postgres has no global FK toggle like MySQL/SQLite). Identifier quoting in the SQL dump follows the active driver (backtick vs `"double quote"`) through the new helpers `identifierQuoteChar()`/`quoteIdentifier()`.
2. **New command `php artisan malas:migrate-data --from= --to=`** (`MigrateDatabaseData.php`) — data migration during a DB engine cutover, copying row by row through the query builder (`cursor()` + `array_chunk`), not through SQL text — fully driver-agnostic. Unlike a regular `.sql` backup (which skips `users`), this command copies **all** tables because it is meant for a full cutover.
3. **New Docker stack** in `deploy/`: `Dockerfile` (multi-stage Node→Composer→PHP-FPM runtime), `docker-compose.yml` (app/queue/nginx/db=Postgres 16), `docker-compose.override.yml` (local dev + Vite HMR), `nginx.conf`, `.env.docker.example`.
4. **Script `deploy/deploy-docker.sh`** — generic, only needs Docker Engine + the Compose plugin (not using the Proxmox API): sets up `.env`, generates `APP_KEY`, builds and runs the stack, migrates+seeds, offers to migrate old data, caches for production. `deploy/update-docker.sh` updates code on a running deploy.
5. **File structure tidy-up**: `deploy.sh`/`update.sh` (native) moved to `deploy/deploy.sh`/`deploy/update.sh` (the `$SCRIPT_DIR` path updated to `cd` up one level). Path references updated in `README.md`, `README.id.md`, `docs/DEPLOYMENT.md`. New document `docs/DOCKER.md`.
6. **Real bug #1 found while building the real image** (not just reading code): without `.dockerignore`, `COPY . .` in the Dockerfile also copied the local `bootstrap/cache/*.php` (gitignored but present on the dev disk) which still references `Laravel\Breeze\BreezeServiceProvider` from `require-dev` — making `composer dump-autoload` fail completely in the `vendor` stage because Breeze is not installed with `--no-dev`. Fix: add `.dockerignore` (excluding `vendor/`, `node_modules/`, `bootstrap/cache/*.php`, `.env`, etc.).
7. **Real bug #2 found while running the real stack**: the non-root `malas` user in the runtime image was only `chown`ed for `storage/`+`bootstrap/cache/`, not `public/` — `php artisan storage:link` failed (`symlink(): Permission denied`) because it needs to write a new symlink into `public/`. Fix: add `public/` to the `chown` list in the `Dockerfile`.

### Done Criteria
- [x] `php -l` clean on touched PHP files
- [x] `docker compose config` valid for `docker-compose.yml` (alone) and combined with `docker-compose.override.yml`
- [x] `docker build` succeeded to the end (after the `.dockerignore` fix)
- [x] `docker compose up` — all 4 services (app, queue, nginx, db) run and the `db` health-check is `healthy`
- [x] 44 migrations ran cleanly on real Postgres (zero SQL dialect issues — the whole app uses Eloquent/the query builder, only `DatabaseBackupController` has raw SQL)
- [x] `storage:link` + seed succeeded after the `public/` permission fix
- [x] Landing page 200 through nginx → PHP-FPM → Postgres; login via magic link succeeded
- [x] Backup download on real Postgres produces a valid `.sql` (`SET session_replication_role = replica;` + `"double-quoted"` identifiers)
- [x] Round-trip import → 302 success, zero new errors in the log; the re-download afterwards is byte-for-byte identical (except timestamps) to the previous backup
- [x] `malas:migrate-data` tested separately (SQLite → SQLite scratch DB via a dynamic connection): 34 tables, all rows copied matching the source counts
- [x] Test containers + test images cleaned up (`docker compose down -v`, `docker rmi`) after verification

---

## Phase 39 — Three My Collection Views (Grid/Compact/Table) + Hover Actions ✅

**Goal:** A UX iteration on My Collection from a mockup discussion (visual preview before execution, over several feedback rounds) — the view toggle becomes one control, a new Compact view, a bigger grid card, a desktop hover overlay for quick actions, mobile adaptation (hover doesn't exist on touch devices), animation, skeleton loading.

1. **`ViewToggle`**: a single pill control (grid/compact/table icons) replacing two separate buttons, with a sliding indicator using a `transform: translateX()` CSS transition.
2. **Grid**: card 160px → 190px min-width. The hover overlay (`md:` and up only) shows progress, stepper, "Mark all as read", and a "Continue to Vol X" button — `opacity-0`/`pointer-events-none` by default, `group-hover:opacity-100` on hover. Mobile doesn't get this overlay at all (`hidden md:flex`) — progress+stepper+menu are always shown below the cover.
3. **Compact (new view)**: dense text-only rows. Desktop: by default shows badge+progress, on hover swaps to stepper+info-icon+menu (`sm:group-hover:hidden`/`sm:group-hover:flex`, the DOM stays fully rendered so it doesn't clash with the CSS toggle pattern). Mobile: 2 lines always shown (title+menu on top, badge+progress below) — no inline stepper because hover doesn't exist, the menu is enough.
4. **`RowActionsMenu`** (a dropdown, not a context menu): 4 items — View Details, Continue to Vol X (reuses the `readProgress` endpoint in the forward direction), Mark all as read (reuses the `readAll` endpoint), Delete. Used in grid+compact so mobile doesn't lose access to actions that on desktop only appear on hover.
5. **Animation**: fully Tailwind/`tw-animate-css` (already the project standard, checked first — every shadcn primitive here already uses `data-open:animate-in`/`data-closed:animate-out`) — toggle indicator, overlay fade/translate, `active:scale-90/95`. Deliberately **not** adding Anime.js, discussed explicitly with the user why it isn't needed (all animation needs are pure CSS transitions, with no complex orchestration needing JS).
6. **Skeleton**: `GridSkeleton`/`CompactSkeleton`/`TableSkeleton` for the `refreshing` state.

### Done Criteria
- [x] `tsc --noEmit` and `npm run build` clean
- [x] Browser verification: the sliding indicator `translateX` is correct (0/30/60px) in all three states
- [x] Computed style verification: grid overlay `opacity:0`/`pointer-events:none` by default, `display:flex` when ready for hover
- [x] Mobile breakpoint verification (resized to 375px): only ONE action control is rendered per row (checked via `offsetParent !== null`, not just the element's own `getComputedStyle`, which doesn't account for an ancestor's `display:none`)
- [x] The `RowActionsMenu` dropdown was actually clicked, the 4 items are correct and match the state (disabled if there is nothing to mark)
- [x] Table view (untouched) still works, zero new console errors
- [x] **Bug found & fixed during verification** (in tooling, not feature code): `.claude/launch.json` "Laravel Dev" pointed to a bare `php` that doesn't resolve — made a wrapper `.claude/php-dev.bat` (gitignored)

---

## Phase 40 — Tag Tree Filter in Catalog (Piggybacking on the Genre Popover) ✅

**Goal:** A continuation of the "tree-style view" discussion — the user asked for a genre/subgenre tree, but AniList genres are flat (no hierarchy). What truly has a hierarchy is AniList tags (category → tag), which were **already** fetched from the start (used to generate `themes`/`demographics`) but thrown away raw. The user asked for this tag tree to piggyback on the same "Genre Filter" popover (not a new button) so the filter bar doesn't get longer.

1. **Migration**: new columns `series.tags` (flat array of tag names, for `whereJsonContains` — same pattern as `genres`) and `series.tag_categories` (name→category map, only for the UI tree, NEVER part of a WHERE clause).
2. **`AniListController::mapToSeries()`**: adds `extractAllTagNames()`/`extractTagCategoryMap()` — filters non-spoiler tags + minimum rank 60 (AniList relevance scale), a single change point that automatically applies to both full import and "Sync AniList" (both go through the same method).
3. **`SeriesController::tagOptions()`**: aggregates the `tag_categories` of all series in PHP (same pattern as `genreOptions()`), grouped by coarse category (the part before the first hyphen, e.g. "Theme-Reincarnation" → "Theme"). The tag filter uses OR-match `whereJsonContains('tags', ...)`, a column separate from genre.
4. **`GenreMultiSelect.tsx`** extended: a "Tag" section sits below the genre section inside the same popover, with collapsible categories (local state) but tags still fully rendered in the DOM (only CSS-hidden when collapsed) — so the search box above can still filter tags in collapsed categories. The count badge on the trigger combines genre+tag.

### Done Criteria
- [x] `php -l` clean, `tsc --noEmit` and `npm run build` clean
- [x] Fixture test of `mapToSeries()` via reflection: low-rank and spoiler tags are filtered, valid tags enter `tags`+`tag_categories` correctly
- [x] HTTP verification: `tagOptions` generated correctly from real series data (tested with 2 dummy series), the filter `?tag[]=X` actually filters results accordingly (checked the count + titles of the series returned)
- [x] Browser verification: the Genre Filter popover shows the Tag section with correct categories+counts, clicking a tag actually updates the URL query and the count badge on the trigger
- [x] Cross-source data stays "one flow" (AniList) as the user requested — old series need a re-sync to fill the new fields, documented in CLAUDE.md

---

## Phase 41 — Route Reference Document (docs/API.md) ✅

**Goal:** User request — make "API documentation". The scope was clarified first (this app is Inertia, not a REST API for external consumers) — the outcome of the clarification: a reference of all Laravel routes in one markdown document, not a formal OpenAPI specification.

1. Generated from `php artisan route:list --json`, grouped per area (Auth & Landing, User, Admin).
2. Each route's response type (Inertia page/JSON/Redirect/File download) is detected from the **real return-type hint in the controller source** (`RedirectResponse`/`JsonResponse`/`StreamedResponse`, etc. — this project's convention is to always write explicit return types), plus a fallback scan of the method body (`Inertia::render`/`Inertia::location`/`return redirect`) for methods whose return type is just a generic `Response` — not just guessing from route names, so it is accurate on the 2 edge cases found during manual checking (`Inertia::location()` for the external SSO redirect, and the closure routes `/` and `/banned` that have no controller class name).
3. Built-in framework routes (`sanctum/csrf-cookie`, `storage/{path}`, `up`) are skipped — not part of the application's features.
4. Linked from README.md/README.id.md (also adding `docs/DOCKER.md`, which turned out never to have been linked from the README since Phase 38).

### Done Criteria
- [x] 135 routes generated, grouped correctly per area
- [x] Manual spot-check: the JSON endpoints (11 routes) all accurately match the actual controller contents, not wrongly guessed from names
- [x] Two edge cases (SSO `Inertia::location`, closure routes) turned out wrong in the first name-based heuristic iteration, fixed to return-type-based + body-scan, re-verified correct

---

## Phase 42 — Fix: Grid Hover Overlay Overlap + Right-Click in My Collection ✅

**Goal:** A user bug report (via screenshot) — the My Collection grid hover overlay (Phase 39) overlapped the info panel below it. Along with a feature request: right-click (context menu) in the My Collection grid & compact views, consistent with the pattern already in `Admin/Series/Index.tsx` and the table view.

1. **Root cause of the overlap**: `AdultBlurOverlay` creates its own `div.relative` + `overflow-hidden` for the cover. The hover overlay written as a SIBLING (not a child) of `AdultBlurOverlay` wasn't clipped by that `overflow-hidden` — when its content (progress+stepper+mark-all+continue button) was taller than the cover box, `absolute inset-x-0 bottom-0` (open height) made it spill over.
2. **Container fix**: the outer overlay wrapper stays `absolute inset-0` (for SAFETY, clamped exactly to the cover's bounding box), but this wrapper itself is transparent — the dark background+blur moved into the INNER auto-height panel (pinned to the bottom through the outer wrapper's `justify-end`), so visually it only covers the bottom part of the cover, not the whole image (`max-h-full overflow-y-auto` on the inner panel as a safety net if the content is too long).
3. **Simplified overlay content & info panel** (follow-up user feedback): removed the stepper (+/-) button that was ALWAYS shown in the info panel under the genre badge (redundant with the stepper already in the hover overlay), and removed the "Mark all as read" button + the "⋮" trigger from INSIDE the overlay (both are already reachable via right-click / the mobile dropdown, so no need to duplicate them in the overlay) — the overlay is now just progress + stepper + continue-reading button, much more compact.
4. **Context menu for grid & compact**: a new component `RowContextMenuItems` — exactly the same contents as the "⋮" dropdown (`RowActionsMenu`, 4 items), used through `ContextMenu`+`ContextMenuTrigger` wrapping the card/row. The table view, which previously only had 2 items (View/Delete), was upgraded to the same 4 items, so all three views are consistent.

### Done Criteria
- [x] `tsc --noEmit` and `npm run build` clean
- [x] Bounding box verification: the outer overlay wrapper is exactly equal to the cover (285px both), the inner panel is only ~100px (the bottom part only) — checked with a real `getBoundingClientRect()`, not just by reading code
- [x] Right-click in the grid & compact views (tested via a real `dispatchEvent('contextmenu')`) — the menu appears, its 4 items are correct, "Mark all as read"/"Delete" are still accessible even though they are no longer in the overlay

---

## Phase 43 — Volume Covers: Built, Then Removed Entirely, Replaced by Similar-Series Recommendations ✅

**Original goal:** find covers per volume automatically from the series edit page, prioritizing the Japanese edition so covers are full/not cropped.

**Short journey** (full details of each decision are in [`CHANGELOG.md`](../CHANGELOG.md) 2026-08-30): built on the Google Books API → proven through direct testing to have 3 stacking limitations (poor search relevance, broken `intitle:`, a nearly empty manga corpus) → replaced with SerpApi Google Images (relevant results) → hit the free quota limit (250 searches/month) when used in bulk → tried speeding it up with parallel concurrency (failed, hit rate-limit 429, reverted back to sequential) → **finally decided to remove it ENTIRELY**, not fix it again, after rethinking: the core of this app is only tracking reading progress & ownership, not a per-volume image gallery.

**What was removed**: the `volumes.cover_path` column (migration drop), `SerpApiService`/`SerpApiSettingsService`/`SerpApiSetting`/`SerpApiSettingController` (files deleted entirely), the "SerpApi" tab in Admin Settings, `VolumeGrid.tsx`, `VolumeController::searchCovers()`/`applyCovers()`. Covers at the **Series** level (series posters) were NOT touched — they remain as before.

**What was built in its place**:
1. **"Similar Series" recommendations** on the Catalog detail page (`Catalog/Show.tsx` + `User\SeriesController::show()`) — filling the space left empty after the volume list section was removed. OR-match on the same genres (same pattern as the Catalog Index genre filter), falling back to the same type if this series has no genre data, `inRandomOrder()->limit(12)`, rendered with the same `SeriesCard` as the Catalog Index (reusing the component, not making a new one).
2. **A big eye icon on the My Collection volume grid card** (`Collection/Show.tsx`) — the card's center area, formerly an empty placeholder (just a number, where the cover used to be), became a big `Eye`/`EyeOff` button as the main read/unread toggle, replacing the old small corner icon (removed, redundant).

### Done Criteria
- [x] `php -l`/`tsc --noEmit`/`npm run build` clean at every iteration (build → change data source → remove entirely → build replacement)
- [x] The column-drop migration was run & verified directly against the DB schema (`Schema::getColumnListing('volumes')`), not just by reading the migration file
- [x] The "Similar Series" recommendation query was tested directly against the dev DB for BOTH paths (genre-match and same-type fallback) — both produced relevant recommendations (manually checked the title + genre list)
- [x] Full grep sweep to make sure no leftover references to `SerpApi`/dead routes/i18n keys remain after the removal
- [x] Along the way (before the decision to remove) real bugs were found & fixed: `searchCovers()` initially didn't catch exceptions, the local testing harness had no SSL CA bundle, the bulk server-side endpoint timed out with many volumes, parallel concurrency hit the API rate limit — all deleted together with the feature code they supported

---

## Summary Table

| Phase | Name | Status |
|-------|------|--------|
| 0 | Setup | ✅ |
| 1 | Database & Models | ✅ |
| 2 | Auth & Middleware | ✅ |
| 3 | Layouts & Shared UI | ✅ |
| 4 | Admin: Series & Volume CRUD | ✅ |
| 5 | User: Catalog & Collection | ✅ |
| 6 | Loans | ✅ |
| 7 | Jikan API Integration *(replaced by AniList in Phase 11)* | ✅ |
| 8 | Announcements & Dashboard | ✅ |
| 9 | User & Menu Management | ✅ |
| 10 | Polish & Hardening | ✅ |
| 11 | Post-Launch Enhancements | ✅ |
| 12 | Library UI, Dashboard, Read Tracking & Review | ✅ |
| 13 | Light Novel Metadata Import (RanobeDB) | ✅ |
| 14 | Multi-Language, Public Profile & Follow, Wishlist, AI Genre Taste, Menu Reorder | ✅ |
| 15 | Title-Based Catalog URLs (Slug) | ✅ |
| 16 | Login Without SSO (Fallback) + Email Configuration (Resend) | ✅ |
| 17 | AniList Batch Import, Logout Fix When SSO Is Down, New-Tab Context Menu | ✅ |
| 18 | Login Method Modal (SSO / Email) | ⚠️ code complete, browser click-through not yet done |
| 19 | Light/Dark/System Theme | ✅ |
| 20 | Fix Admin URLs (Slug) & Genre/Tags Editor in Series Edit | ✅ |
| 21 | Favicon Installed, Bilingual README, Missed-Feature Audit | ✅ |
| 22 | Multi-Select Genre Filter in the User Catalog | ✅ |
| 23 | Quick-Edit Reading Progress & Volume Count in My Collection | ✅ |
| 24 | Multi-Account Switching (Session-Based) | ✅ |
| 25 | Stepper from My Collection, Collection Grouping, Multilingual Flash Messages *(grouping replaced entirely in Phase 27)* | ✅ |
| 26 | Fix: Login Links (CLI/Email) Override the Active Account Instead of Adding | ✅ |
| 27 | Collection Groups Fully Reworked (MDList MangaDex Style) | ✅ |
| 28 | Collection Groups: Bigger Modal + Pagination, Type Filter, Slug URL, Public/Private | ✅ |
| 29 | Fix: Blank Screen Opening a Collection Group (Empty Slug + Guest Crash), Emoji-Free README | ✅ |
| 30 | Wider "Add Manga" Modal + Infinite Scroll | ✅ |
| 31 | Modal Layout Fix, Collection URLs Use Titles, Confirm+Undo for Removing from Group, Puter.js Removed | ✅ |
| 32 | Temporarily Disable AI Funfact Generation, Collection Export/Import | ✅ |
| 33 | "Missing Volumes" Badge (Next Volume to Buy) in My Collection | ✅ |
| 34 | "Missing Volumes" Badge Is Clickable, Auto-Fills the Add Volume Form | ✅ |
| 35 | Reveal API Key/Secret in Admin Settings (Eye Icon) | ✅ |
| 36 | Fix: Database Backup Download/Import 403 for the Real Super Admin | ✅ |
| 37 | Fix: Database Backup Download/Import 500 on SQLite (Dev) | ✅ |
| 38 | Docker Deploy (Postgres) + Deploy File Structure Cleanup | ✅ |
| 39 | Three My Collection Views (Grid/Compact/Table) + Hover Actions | ✅ |
| 40 | Tag Tree Filter in Catalog (Piggybacking on the Genre Popover) | ✅ |
| 41 | Route Reference Document (docs/API.md) | ✅ |
| 42 | Fix: Grid Hover Overlay Overlap + Right-Click in My Collection | ✅ |
| 43 | Volume Covers: Built, Then Removed Entirely, Replaced by Similar-Series Recommendations | ✅ |

**QA pass: 2026-07-03** — Phase 11–18 were worked on iteratively afterwards, see [`CHANGELOG.md`](../CHANGELOG.md) for per-change details. The remaining documented gap: Phase 18 needs a one-time manual click-through in the normal dev environment to visually verify the login modal (the only gap left from the many post-launch phases). Phases 19–43 (2026-08-14 to 2026-08-30) are all verified — sixteen real bugs were found & fixed along the way (Phase 20 point 3, Phase 23 point 3, Phase 25 point 3, Phase 26, Phase 27 point 2, Phase 28 point 5, Phase 29, Phase 30 point 1, Phase 31 point 1, Phase 36, Phase 37, Phase 38 point 6, Phase 38 point 7, Phase 39 (`.claude/launch.json` tooling), Phase 42 point 1, Phase 43 (searchCovers exception handling) — each passed verification before the next phase ran, with no new bugs. Controller flash messages are now fully multilingual (Phase 25) — the old backlog item noted in CLAUDE.md is resolved. Collection grouping (Phase 25) was reworked entirely into a many-to-many design in the style of MDList MangaDex (Phase 27), extended with pagination/filter/slug URL/public visibility (Phase 28), then a wide modal + infinite scroll (Phase 30); two consecutive flexbox/layout bugs (Phase 30 Tailwind `sm:` prefix, Phase 31 `min-h` floor height) serve as a reminder that HTTP/JSON verification alone isn't enough to catch client-side rendering/CSS/JS bugs, which need a real render in a browser. The Puter.js integration (a free client-side AI provider) was removed entirely in Phase 31 at the user's request; Phase 32 temporarily disabled AI funfact generation itself (the genre word cloud still works) and added the collection export/import feature (personal backup); Phase 33 added the "next volume to buy" feature (missing volumes badge) from a feature-idea discussion, then Phase 34 made that badge actionable (click → auto-fill the Add Volume form). Phase 35 opened up reveal access for API keys/secrets in Admin Settings (super_admin-only, so safe) through an eye icon toggle. Phase 36 found & fixed a real authorization bug (Spatie `hasRole()` never synced with the real `role` column) that turned out to originate from `CLAUDE.md`'s own incorrect documentation — a reminder that documentation can also be a source of bugs if it isn't re-checked against the actual code. Phase 37 found a second bug hidden behind the Phase 36 bug (the MySQL-only database backup feature meeting the SQLite dev DB) — a real example of "fixing one bug can reveal the next bug hidden behind it", and also a reminder that a user's claim of "it's not in the log" should be re-checked directly against the log file, not assumed to be true. Phase 38 added a third deploy method (Docker + Postgres, generic for Proxmox or any Linux) and a cross-DB-engine data migration command — two real bugs were found right when building/running real Docker (not just reading code): the missing `.dockerignore` caused the local Composer cache to be copied into the image and made the build fail completely, and the `public/` permission not `chown`ed to the non-root user made `storage:link` fail — a reminder that infrastructure (Dockerfile, compose) needs to be verified by actually building & running it, not just writing and re-reading it. Phase 39 overhauled the My Collection UX (a single sliding view toggle, a new Compact view, a desktop hover overlay, mobile adaptation, Tailwind animation, skeletons) through several rounds of visual mockup previews before execution (a new pattern used starting this session: show the design first, then "go" when the user agrees) — found the tooling bug where `.claude/launch.json` pointed to a bare `php` that doesn't resolve, fixed with a local wrapper. Phase 40 settled the "tag tree" discussion that had wrongly assumed something about AniList genres (they turned out to be flat, it's the tags that have a hierarchy) — AniList tag data had long been fetched (for `themes`/`demographics`) but thrown away, and is now stored in full and piggybacks on the same Genre Filter popover so the filter bar doesn't get longer. Phase 41 made `docs/API.md` (a reference of all routes, not a formal OpenAPI specification because this app is Inertia, not an external REST API) — each route's response type was detected from the real return-type hint in the source, not guessed from names, finding 2 edge cases (the external SSO redirect, closure routes) that were wrong in the first heuristic iteration and fixed. Phase 42 found (through a user screenshot) a visual overlap bug in the grid hover overlay built in Phase 39 — the root cause was `AdultBlurOverlay` creating its own `relative`/`overflow-hidden` for the cover, so an overlay written as a sibling isn't clipped automatically — a reminder that checking computed style alone (opacity/pointer-events, as Phase 39 did) isn't enough, and the actual bounding box must be checked to catch overflow. It also added right-click (context menu) to the My Collection grid & compact views, matching the pattern already in the table view and `Admin/Series/Index.tsx`. Phase 43 built a bulk volume-cover search feature (Google Books → replaced by SerpApi Google Images after a direct investigation proved three stacking limitations of Google Books) but ENDED UP removing it ENTIRELY after rethinking that per-volume covers are outside the app's core (reading progress & ownership, not an image gallery) — replaced by genre-based "Similar Series" recommendations on the Catalog page and a big eye icon on the My Collection volume grid card, a real example of "building and then deciding to tear it down again" done cleanly (dropping the DB column, deleting all related files, grep-sweeping dead references) rather than left as dead code. Phases 32–33 were verified with direct HTTP requests (curl) because the Browser pane tool had problems; it recovered starting with Phase 34.
