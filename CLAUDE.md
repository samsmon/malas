# Malas — Claude Code Rules

## Meta Rules (READ FIRST, BEFORE ANYTHING ELSE)

| Signal | Meaning |
|--------|---------|
| Message ends with **"gimana?"** | This is a discussion. **Do not touch code.** Discuss the plan first. |
| User writes **"lanjut" / "gas" / "oke"** | Only then may you start implementing. |
| One phase is done | Remind the user to open the QA chat (`see QA.md`). |

For every planned change that has not been confirmed → **write the plan first, wait for "gas".**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Laravel 12 |
| Frontend bridge | Inertia.js v2 |
| Frontend UI | React 19 + TypeScript 5 |
| UI components | shadcn/ui (copy-paste via Base UI — use the `render` prop, not `asChild`) |
| Styling | Tailwind CSS v4 |
| Bundler | Vite |
| Database (dev) | SQLite |
| Database (prod, native deploy) | MySQL 8+ — `deploy/deploy.sh`, see `docs/DEPLOYMENT.md` |
| Database (prod, Docker deploy) | PostgreSQL 16 — `deploy/deploy-docker.sh`, see `docs/DOCKER.md` |
| Auth/Role | Spatie Laravel Permission |
| File storage | Local (dev) or S3-compatible/Cloudflare R2 (prod) — configured via the admin UI, not `.env` |
| External API | AniList GraphQL (`https://graphql.anilist.co`) — for importing manga/manhwa/manhua metadata |
| Auth SSO | Yado — PKCE-based OAuth2, all users are managed via SSO |

---

## Folder Structure

```
app/
  Http/
    Controllers/
      Admin/
        AniListController.php         — search & import from AniList GraphQL
        DatabaseBackupController.php  — download/import DB backup (super_admin)
        SeriesController.php
        VolumeController.php
        TicketController.php          — admin views & responds to user tickets
        StorageSettingController.php  — storage driver configuration via UI
        ActivityLogController.php     — admin activity log viewer
        SiteSettingController.php     — 18+ content blur settings
        SeriesMediaController.php     — extra media gallery per series
        CommandSearchController.php   — search Series/Users/Tickets for the Command Palette (⌘K)
        [other resource controllers]
      User/
        SeriesController.php          — catalog (read-only)
        CollectionController.php      — personal collection, bulk delete volumes, per-volume read toggle/mark-all,
                                         update review & rating
        TicketController.php          — users create & view tickets
        LoanController.php
        SearchController.php          — search Series/Collection for Global Search (⌘K)
    Middleware/
      CheckMenuAccess.php   — checks maintenance mode & role_access per menu
      EnsureNotBanned.php
  Models/
    Series.php              — has AniList fields: genres, authors, themes, demographics (json)
    Collection.php           — condition, personal_rating (-10..10), personal_review
    CollectionVolume.php     — read_at (datetime, null = not read yet)
    StorageSetting.php      — encrypted secret_access_key cast
    Ticket.php
    [other models]
  Policies/
  Services/
    AniListService.php          — AniList GraphQL client (injects StorageSettingsService to download covers)
    StorageSettingsService.php  — single entry point for all file storage operations (disk(), url(), store*, delete)

resources/js/
  Pages/
    Admin/
      Dashboard.tsx   — stat cards + charts (Recharts): Series per Status, Collection per Type,
                        Loan Status
      AniList/
        Index.tsx     — search & import (card overlay, not a Popover)
        Status.tsx    — pings AniList + recent imports
      Series/
        Index.tsx     — bulk delete, hover card preview, context menu (right-click)
        Edit.tsx      — includes the "Sync AniList" Popover anchored to the button
      ActivityLog/
        Index.tsx     — admin activity log viewer
      Settings/
        Index.tsx     — single tabbed page: Storage, Database, Content (18+ blur)
      Tickets/
        Index.tsx
        Show.tsx      — admin can respond
    User/
      Dashboard.tsx   — stat cards, Collection per Status chart, recommendations Carousel + Surprise Me
      Catalog/
        Index.tsx
        Show.tsx      — full detail: genre, author, theme, demographic, score, collector avatars
      Collection/
        Index.tsx     — auto-fill poster grid (wide covers), reading progress datatable, client-side search
        Show.tsx      — per-volume read toggle (eye icon), delete mode (eye→checkbox),
                        personal review & rating, loan management
      Tickets/
        Index.tsx
        Create.tsx    — accessible from the catalog (series pre-filled)
        Show.tsx
      Loans/
        Index.tsx
    Auth/
      Banned.tsx
    Landing.tsx
    Settings/
      Index.tsx       — read-only profile from SSO
  Layouts/
    AdminLayout.tsx   — ScrollArea wrapping, mounts <CommandPalette /> (⌘K)
    UserLayout.tsx    — search bar in the header (desktop) + search icon (mobile), mounts <GlobalSearch />
  Components/
    ui/               — shadcn/ui components (DO NOT MODIFY). Includes empty.tsx, hover-card.tsx,
                        context-menu.tsx, command.tsx (cmdk), chart.tsx (Recharts), carousel.tsx
                        (embla-carousel-react)
    app/
      PageHeader.tsx  — responsive (stacks columns on mobile)
      Pagination.tsx  — responsive (flex-wrap on mobile); optional props routeName+filters
                        for the per-page selector (5/10/25/50/100)
      VolumeGrid.tsx
      StatusBadge.tsx — SeriesStatusBadge, SeriesTypeBadge, VolumeTypeBadge,
                        TicketStatusBadge, TicketTypeBadge, VolumeFormatBadge
      EmptyState.tsx  — used on pages not yet migrated to ui/empty.tsx
      AnnouncementBanner.tsx
      SeriesCard.tsx          — catalog poster card
      SeriesMediaGallery.tsx  — extra media gallery per series (admin)
      CommandPalette.tsx      — admin ⌘K, quick nav + search
      GlobalSearch.tsx        — user ⌘K, quick nav + search
  hooks/
    useFlash.ts       — sonner toast from the flash session; supports an "Undo" button via
                        flash.undo_url/undo_payload
  lib/
    utils.ts
    types.ts          — shared TypeScript types (TicketType, TicketStatus, etc.)
```

---

## Coding Rules

### TypeScript
- **No `any` allowed**; use `unknown` + a type guard if unavoidable
- All Inertia page props must have an explicit interface
- All components must have typed props
- Use `type` for object shapes, `interface` for things that can be extended

```typescript
// CORRECT
interface SeriesPageProps {
  series: Series[]
  filters: { status: string | null }
}

// WRONG
const handleData = (data: any) => { ... }
```

### React Components
- All UI components must use **shadcn/ui**; don't build custom ones from scratch
- shadcn/ui in this project is based on **Base UI**; use the `render` prop, not `asChild`
- Forms use **React Hook Form** + **Zod** for validation
- No inline styles; use Tailwind utility classes for everything
- Component files: `PascalCase.tsx`
- Hook/util files: `camelCase.ts`
- Mobile-first: use `flex-col sm:flex-row`, `flex-wrap` for action buttons, `min-h-0` on scrolling flex children
- **The base style of `DialogContent` (`ui/dialog.tsx`) already has `sm:max-w-sm`**, so a width override MUST also use the `sm:` prefix (e.g. `sm:max-w-3xl`), not a bare `max-w-3xl`. Without the `sm:` prefix, the custom class LOSES in the Tailwind cascade once the viewport is ≥640px (the `sm:max-w-sm` media query sits later in the generated stylesheet and beats the unprefixed base utility), so the dialog silently stays 384px even though a larger `max-w-*` looks applied in the code. A real bug found in `CollectionGroups/Show.tsx` (`Admin/Series/Edit.tsx` and `User/Collection/Index.tsx` are probably affected too, not yet checked/fixed; see `docs/PHASES.md` Phase 30).

```typescript
// CORRECT — use shadcn/ui
import { Button } from "@/components/ui/button"
<Button variant="outline" onClick={handleSave}>Simpan</Button>

// WRONG — custom HTML
<button className="bg-blue-500 px-4 py-2">Simpan</button>
```

### Inertia Controller
- Every controller method returns `Inertia::render()` or `redirect()`
- Use `Route::middleware(['auth', 'not_banned', 'check.menu'])` for all routes
- Data sent to the frontend must be minimal (don't send the whole model)

```php
// CORRECT
public function index(): Response
{
    return Inertia::render('Admin/Series/Index', [
        'series' => SeriesResource::collection(Series::paginate(20)),
        'filters' => request()->only(['status', 'search']),
    ]);
}
```

### Laravel Backend
- All queries use **Eloquent**; raw SQL only when unavoidable, with a comment explaining why
- All models have an explicit `$fillable` (no `$guarded = []`)
- Every action that changes data must go through a **Policy** first
- Validate in a **FormRequest**, not directly in the controller
- **All file storage operations** (upload, delete, URL) must go through `StorageSettingsService`, not the `Storage::` facade directly
- **Adding a `slug` column (or any other column that must be filled but is added as `nullable()` so the migration doesn't fail) to a table that already has data MUST backfill in the same migration**, not just rely on a model event (`creating`/`updating`) to fill new rows. Old rows stay NULL forever if not backfilled, and once the frontend starts generating URLs/links from that column, the old rows break (`null` links) down to a blank screen. The correct pattern: add nullable column → backfill with `Model::whereNull('column')->each(fn ($m) => ...->saveQuietly())` → (optionally) only then add the `unique()` constraint. See `2026_08_02_090000_add_slug_to_series_table.php` (Series, done right from the start) vs `2026_08_15_090000_backfill_collection_groups_slug.php` (CollectionGroup, where the original Phase 28 migration forgot this step; found as a real "blank screen" bug when a user tried to open an old group created before the slug migration ran)

---

## Storage System

Storage is configured **via the admin UI** (`/admin/settings/storage`), not `.env`. Data is stored in the `storage_settings` table with an encrypted `secret_access_key`.

```php
// CORRECT — inject StorageSettingsService
public function __construct(private StorageSettingsService $storage) {}
$url = $this->storage->url($model->cover_path);
$path = $this->storage->storeUploadedFile($file, 'covers');
$this->storage->delete($model->cover_path);

// WRONG — using the Storage facade directly
Storage::disk('public')->url($path);
Storage::put('covers/' . $filename, $content);
```

---

## Authorization System

```
Role: super_admin > admin > user

Access is controlled by:
1. The `users.role` column (plain string, NOT a Spatie Role) — via `User::isAdmin()`/`isSuperAdmin()`, used in all Policies
2. MenuMiddleware    — for route-level access (is_maintenance, role_access), reads the same `role` column
```

**Spatie Laravel Permission is in composer.json/migrations (`roles`, `model_has_roles` tables, etc.) but is NOT used for any authorization decision in this app.** `assignRole()` is never called anywhere in the codebase, so `model_has_roles` is always empty. All Policies and middleware read the plain `users.role` column, not Spatie.

**Never use `auth()->user()->hasRole(...)` (the Spatie method)**; it always returns `false` because Spatie roles are never assigned, even when the user's `role` column is correct. This was a real bug: `DatabaseBackupController::download()`/`import()` used `hasRole('super_admin')`, so a genuine super_admin got a 403. The fix was switching to `isSuperAdmin()` (see the relevant date in CHANGELOG.md). Always use `$user->isAdmin()` / `$user->isSuperAdmin()`, or `abort_unless($user->isSuperAdmin(), 403)` directly in the controller for features with no relevant model for a Policy (Storage Settings, Database Backup).

**Never hardcode role checks in React components.** Send permissions from the backend:

```typescript
// CORRECT — send from the controller
'can' => [
    'create_series' => $request->user()->can('create', Series::class),
]

// WRONG — check in the frontend
if (user.role === 'admin') { ... }
```

---

## Menu Management

Menus are stored in the database (`menus` table). Every navigation route must have an entry in the menu table.

The `CheckMenuAccess` middleware runs on every request:
1. Fetch the menu by the current route name
2. If `is_maintenance = true` AND the user is not admin/super_admin → return the maintenance page
3. If the user's role is not in `role_access` → abort 403

Every new menu must be added to `MenuSeeder.php` with `updateOrCreate`.

---

## UX — Required

- All buttons that trigger a server request must have a **loading state** (disable + spinner)
- Use `router.visit()` with `onStart`/`onFinish` to control loading state
- Form errors must be shown inline below the field, not only as a toast
- Toast/notification for successful actions (use `sonner` from shadcn)
- Skeleton loading for fetched data (no blank page)
- **Mobile-first**: all user pages must be responsive; test at 375px width
- **Every reversible action (delete, toggle status, etc.) MUST have an Undo option** in its toast.
  Send `undo_url` (+ `undo_payload` if extra data is needed) through the flash session, and `useFlash.ts`
  automatically shows an "Undo" button that calls `router.patch(undo_url, undo_payload)`. See examples
  in `SeriesController::destroy()`/`restore()` (admin, soft-delete) or `CollectionController::destroy()`/
  `undoDestroy()` (hard-delete, re-created from the payload). **Exception**: actions that delete
  files from storage directly (e.g. `SeriesMediaController::destroy()`) don't need undo because the file is already
  permanently gone; if this applies, document the reason in a code comment.
- **Every page that shows a list/grid of series or collections (more than one item) MUST
  have a type filter**: use `ToggleGroup`/`ToggleGroupItem` (Segmented Control, not a `Select`
  dropdown), with the buttons always in this order: **All Types, Manga, Light Novel, One Shot, Doujinshi, Manhwa,
  Manhua**. Base UI `Toggle` does not handle the value `""` cleanly (it falls back to an auto-generated id), so
  use the sentinel `'all'`, not an empty string. See examples in `Admin/Series/Index.tsx`,
  `User/Catalog/Index.tsx`, `User/Collection/Index.tsx`, `User/Wishlist/Index.tsx`,
  `User/Profile/Show.tsx`, `Admin/Collections/Show.tsx`. **Exception**: pages whose content is
  inherently a single type (e.g. `Admin/RanobeDb/Index.tsx`, since RanobeDB only has light novels)
  or detail pages for a single series/volume (not a list) don't need this filter.
- **Multi-language is REQUIRED, no exceptions.** This app supports id/en/ja (see the section
  "Multi-Language System" below). Every new feature or code that shows text to the user
  **must** have its translations prepared right away; no hardcoded strings deferred to "later".
  This applies to ALL user-facing strings: labels, buttons, placeholders, toasts, error messages,
  empty states, page titles, with no exceptions. Make sure no string is
  missed before considering a feature done.

---

## Multi-Language System

Supported: **id** (default), **en**, **ja**. The language preference is stored per user in the
`users.locale` column, changed from the Settings page (`Select` in the "Bahasa"/"Language"/"言語" card).

**Frontend** (`react-i18next`):
- Translation files: `resources/js/lang/{id,en,ja}/{namespace}.json`, split per namespace
  (`common.json` for Layouts/SidebarNav/CommandPalette/GlobalSearch/menu labels, `dashboard.json`
  for the Dashboard pages, etc.). Add a new namespace for new pages; don't pile everything into
  `common.json`.
- Register new JSON resources in `resources/js/lib/i18n.ts` (static import + add to the `resources`
  object and the `ns` array).
- Use `const { t } = useTranslation('namespace')` then `t('key')`, not string literals.
  Interpolate with `{{variable}}` in the JSON, then `t('key', { variable: value })`.
- The locale reaches the browser automatically through the shared Inertia prop `locale` (applied with `i18n.changeLanguage()`
  in a `useEffect` in `AdminLayout`/`UserLayout`; other pages follow automatically since they are all
  wrapped by one of these Layouts).
- **Sidebar menu labels** (from the `menus` table, seeded) **must not** be rendered directly from
  `item.label` (that is just raw Indonesian in the DB). Map them first through `menuTranslationKey(item.key)`
  in `resources/js/lib/menu.ts` to a `menu.*` translation key, falling back to `item.label` if the key
  is unknown (e.g. an admin renamed it manually). Every newly seeded menu MUST be added to
  `MENU_KEY_TRANSLATIONS` + a `menu.*` key in all three `common.json` files.

**Backend**:
- The middleware `App\Http\Middleware\SetLocale` sets `App::setLocale()` from `user->locale` on every
  request (default `id` for guests/users without a preference).
- Laravel validation messages are already translated automatically via `lang/{id,en,ja}/validation.php`; no
  custom messages needed in a FormRequest unless you need text outside Laravel's built-in rules.
- Controller flash messages are already multi-language via `lang/{id,en,ja}/flash.php`; controllers call
  `__('flash.namespace.key', ['param' => $value])`, not hardcoded strings. All ~70 calls to
  `->with('success'/'error'/'info', ...)` across 24 controllers have been converted. **This pattern is REQUIRED
  for new flash messages**; no more hardcoded strings. Placeholders use `:key` (e.g. `:count`,
  `:name`, `:number`) per the Laravel `__()` convention. Exceptions that are INTENTIONALLY not translated:
  raw exception messages (`$e->getMessage()`, usually from external APIs/AWS SDK) and text inside
  `ActivityLog::record()` (the admin activity log, not a flash toast; it stays Indonesian because it is read by
  admins, not user-facing per locale).

**Fully translated** (all namespaces: `common.json`, `dashboard.json`, `user.json`,
`catalog.json`, `collection.json`, `admin.json`; see `resources/js/lang/{id,en,ja}/`):

- Layouts & shared components: `AdminLayout.tsx`, `UserLayout.tsx`, `SidebarNav.tsx`,
  `CommandPalette.tsx`, `GlobalSearch.tsx`, `StatusBadge.tsx`, `Pagination.tsx`, `LanguageSwitcher.tsx`.
- All `User/**` pages: `Dashboard.tsx`, `Catalog/Index.tsx`, `Catalog/Show.tsx`,
  `Collection/Index.tsx`, `Collection/Show.tsx` (the largest file in the app, ~1200 lines; full),
  `Wishlist/Index.tsx`, `Tickets/Index.tsx`, `Tickets/Create.tsx`, `Tickets/Show.tsx`,
  `Loans/Index.tsx`, `Directory/Index.tsx`, `Profile/Show.tsx`.
- `Settings/Index.tsx` — full (Language, Profile, Public Profile cards).
- All `Admin/**` pages: `Dashboard.tsx`, `ActivityLog/Index.tsx`, `Series/Edit.tsx`,
  `Series/Show.tsx`, `Series/Create.tsx`, `Series/Index.tsx`, `Series/EditVolume.tsx`,
  `Settings/Index.tsx`, `Users/Index.tsx`, `Users/Show.tsx`, `Announcements/Create.tsx`,
  `Announcements/Edit.tsx`, `Announcements/Index.tsx`, `Tickets/Index.tsx`, `Tickets/Show.tsx`,
  `Loans/Index.tsx`, `Menus/Edit.tsx`, `Menus/Index.tsx`, `Menus/UserSidebar.tsx`,
  `GenreFunfacts/Index.tsx`, `AniList/Index.tsx`, `AniList/Status.tsx`, `Collections/Index.tsx`,
  `Collections/Show.tsx`, `RanobeDb/Index.tsx`, `Search/Index.tsx`.
- Root `Pages/` pages: `Landing.tsx`, `Error.tsx`, `Auth/Banned.tsx`, `Maintenance.tsx`.
- `Components/app/**` (outside `ui/`): `SeriesMediaGallery.tsx`, `SortableMenuList.tsx`,
  `AdultBlurOverlay.tsx`, `AnnouncementBanner.tsx`, `SeriesCard.tsx`, `VolumeGrid.tsx`.

**Incomplete (backlog, do not treat as done; update this list every time a file gets
translated, and do NOT remove a line if it was only partially translated)**:

- `User/Dashboard.tsx` — 1 chart label left (`statusChartConfig.total.label`), low priority
  because the word "Series" is the same in ID/EN.
- `Pages/Dashboard.tsx` (root, outside `User/` and `Admin/`) — checked, not referenced by any
  controller (`grep Inertia::render('Dashboard'` returns nothing), so this is a dead file.
  Intentionally **not** translated; consider deleting it at some point instead of
  translating it.

**Established patterns, follow them when continuing the backlog above**:
- Series type/status/format strings that repeat across many files → use `common.json` keys
  (`badge.status.*`, `badge.type.*`, `badge.format.*`, etc.); don't create new per-page keys.
- Repeated segmented-control type filters (see the required rule above) → use the hook
  `useTypeFilterOptions()` from `resources/js/lib/typeFilters.ts`; don't duplicate the array literal.
- Cross-namespace lookups use the syntax `t('namespace:key')`, e.g. `t('common:badge.status.finished')`
  from a component whose default namespace isn't `common`.

---

## Existing Features

Do not duplicate or rebuild these features:

| Feature | Location |
|---------|----------|
| Import manga from AniList | `Admin/AniList/Index.tsx` + `AniListController` |
| AniList batch import (genre/year/popularity filters, multi-select) | `Admin/AniList/Index.tsx` + `AniListController::bulkImport()` + `AniListService::getMangaBatch()` (a single GraphQL `id_in` request, not N separate requests) |
| Open a series in a new tab from the context menu (right-click) | `Admin/Series/Index.tsx` — `window.open()`, separate from normal Inertia SPA navigation |
| Sync AniList metadata to an existing series | Edit Series page ("Sync AniList" Popover) |
| Personal collection + volume tracking | `User/Collection/*` |
| Bulk delete volumes | `Collection/Show.tsx` + `CollectionController::destroyVolumes()` |
| Bulk delete series (admin) | `Admin/Series/Index.tsx` + `SeriesController::bulkDestroy()` |
| Volume input with ranges (`1-5,7,9-12`) | `CollectionController::storeVolumes()` |
| Per-volume read toggle + mark all at once | `Collection/Show.tsx` + `CollectionController::toggleVolumeRead()`/`markAllVolumesRead()` |
| Read progress stepper (+/-): shifts the read-volume boundary without clicking each eye icon | `Collection/Show.tsx` + `CollectionController::advanceReadProgress()` |
| Quick-edit owned volume count per format (+/-) | `Collection/Show.tsx` + `CollectionController::quickAdjustCount()` — skips volumes currently on loan (disabled + tooltip in the frontend, also rejected on the server) |
| Volume delete mode (eye icon → checkbox) | `Collection/Show.tsx` |
| Personal review & rating (-10..10) | `Collection/Show.tsx` + `CollectionController::updateReview()` |
| Genre recommendations + Surprise Me | `User/Dashboard.tsx` + `DashboardController::genreRecommendations()`/`surpriseMe()` |
| Dashboard charts (Recharts) | `Admin/Dashboard.tsx`, `User/Dashboard.tsx` + `ui/chart.tsx` |
| Admin Command Palette (⌘K) | `CommandPalette.tsx` + `Admin/CommandSearchController` |
| User Global Search (⌘K) | `GlobalSearch.tsx` + `User/SearchController` |
| Per-page item count selector (5/10/25/50/100) | `Pagination.tsx` + `Controller::perPage()` |
| Undo on toast (reversible actions) | `useFlash.ts` (flash `undo_url`/`undo_payload`) |
| User → admin ticket system | `User/Tickets/*`, `Admin/Tickets/*` |
| Volume loans | `User/Loans/*` + `Admin/Loans` |
| Database backup & import | `Admin/Settings/Index.tsx` (Database tab) + `DatabaseBackupController` — driver-aware for SQLite/MySQL/Postgres (identifier quoting differs: backtick vs `"`, and the FK-check toggle differs: `PRAGMA foreign_keys`/`SET FOREIGN_KEY_CHECKS`/`SET session_replication_role`), see `fkChecksStatement()`/`getBackupTables()` |
| Cross-engine DB data migration (e.g. old SQLite/MySQL → new Docker Postgres) | `php artisan malas:migrate-data --from= --to=` (`MigrateDatabaseData.php`) — copies row by row through the query builder (not SQL text), so it is driver-agnostic; used once at cutover, called automatically from `deploy/deploy-docker.sh` if the user chooses to migrate old data, see `docs/DOCKER.md` |
| Storage configuration (Local/S3) | `Admin/Settings/Index.tsx` (Storage tab) + `StorageSettingController` — `secret_access_key` (and AI/Mail API keys) are encrypted in the DB but sent to the frontend and can be revealed via `SecretInput` (Eye/EyeOff toggle icon). Safe because this page is `super_admin`-only (`StorageSettingPolicy`), so it adds no exposure to a new audience |
| 18+ content blur | `Admin/Settings/Index.tsx` (Content tab) + `SiteSettingController` |
| Admin activity log | `Admin/ActivityLog/Index.tsx` + `ActivityLogController` |
| Extra media gallery per series | `SeriesMediaGallery.tsx` + `Admin/SeriesMediaController` |
| SSO login via Yado | `SsoController` (PKCE OAuth2) |
| Light novel metadata import from RanobeDB | `Admin/RanobeDb/Index.tsx` + `RanobeDbController` + `RanobeDbService`, see [`docs/RANOBEDB_INTEGRATION.md`](docs/RANOBEDB_INTEGRATION.md) |
| Sync RanobeDB metadata to an existing series | Edit Series page ("Sync RanobeDB" Popover) |
| Genre Taste: genre word cloud (active) + AI funfact (**intentionally disabled for now**, see `DashboardController::FUNFACT_GENERATION_ENABLED = false`) | `User/Dashboard.tsx` (`GenreFunfactCard`) + `DashboardController::regenerateFunfact()` + `AiFunfactService`, provider config in `Admin/Settings/Index.tsx` (AI tab, Gemini/OpenAI/Claude — **no longer** Puter.js, removed in Phase 31). The genre word cloud still displays normally (not AI, purely the genre distribution of the collection); only the auto-generate + "Regenerate" button + the AI funfact text are skipped. Set the constant back to `true` to re-enable; no data needs restoring |
| Genre Taste regenerate quota (admin) | `Admin/GenreFunfacts/Index.tsx` + `GenreFunfactController` |
| Wishlist (series not yet collected) | `User/Wishlist/Index.tsx` + `WishlistController` |
| Public profile (opt-in, accessible without login) + follow | `User/Profile/Show.tsx` (`PublicShell` for guests) + `ProfileController`, toggle in `Settings/Index.tsx` |
| User directory | `User/Directory/Index.tsx` + `ProfileController::directory()` |
| Combined AniList + RanobeDB search (admin) | `Admin/Search/Index.tsx` + `ExternalSearchController` |
| Sidebar menu reorder (drag & drop) | `Admin/Menus/Index.tsx` (`SortableMenuList.tsx`, `@dnd-kit`) + `AdminMenuController::reorder()`, preview in `Admin/Menus/UserSidebar.tsx` |
| Title-based catalog URLs (slug, not UUID) | `Series::generateUniqueSlug()`/`resolveRouteBinding()` — falls back to `id` for old links |
| Login method modal (SSO / Email) | `LoginMethodDialog.tsx` — used from the Login button on the Landing page; email login does not re-sync the profile (only SSO syncs) |
| Email login (magic link, a peer method, not just a fallback) | `Auth/SsoFallback.tsx` + `Auth\SsoFallbackController` — single-use magic link via email, `throttle:5,10`, generic response (anti email-enumeration) |
| Emergency login via CLI (without waiting for email) | `php artisan sso:emergency-login {identifier=super_admin}` (`IssueEmergencyLoginLink.php`) — reuses `SsoFallbackToken`, needs SSH access to the server, see `docs/DEPLOYMENT.md` |
| Email configuration (Resend) | `Admin/Settings/Index.tsx` Email tab + `Admin\MailSettingController` + `MailSettingsService` — encrypted API key, same reveal-via-`SecretInput` pattern as Storage/AI |
| Genre/authors/illustrators/themes/demographics editor in Admin Series Edit | `Admin/Series/Edit.tsx` (`TagListInput.tsx`) — AniList/RanobeDB sync also fills tags; an empty-string sentinel clears all tags via `SeriesController::update()` |
| Title-based admin series URLs (slug, not UUID) | Same mechanism as the user catalog — every `route('admin.series.show'/'edit', ...)` (Index, Show, EditVolume, AniList/RanobeDB/Search results, Tickets, Command Palette) uses `slug` |
| Searchable multi-select genre filter in the user Catalog | `User/Catalog/Index.tsx` (`GenreMultiSelect.tsx`, Popover+Command/cmdk) + `User\SeriesController::index()` — OR-match (`orWhereJsonContains`), genres sent as an array (`genre[]=...`) |
| Tag filter (tree per AniList category) riding on the same Genre Filter popover | `GenreMultiSelect.tsx` ("Tag" section below the genre section; categories are collapsible but still fully rendered in the DOM so the search box at the top can still filter tags in collapsed categories) + `User\SeriesController::tagOptions()` (OR-match `whereJsonContains('tags', ...)`, same pattern as genre, separate column). Tag data (name + category, e.g. "Isekai" -> "Theme-Reincarnation") comes from the AniList `tags` field that was **already** being fetched from the start (used for `themes`/`demographics`) but used to be discarded. Now it is stored in full (minimum rank 60, non-spoiler) in the new column `series.tags` (flat array of names, for filtering) and `series.tag_categories` (name->category map, only for building the tree, NEVER queried) via `AniListController::extractAllTagNames()`/`extractTagCategoryMap()`. Single data source (AniList); old series need a re-sync ("Sync AniList") to fill these fields |
| Multi-account switching (session-based, available to all users) | `AccountSwitcher.tsx` (avatar dropdown in the Admin/User sidebar footer) + `AccountLinkService`/`Auth\AccountController` — the linked accounts list lives only in the session (`linked_account_ids`), there is **no** permanent link in the DB (switching always requires proof of a real login to the target account once). "Add Account" reuses `LoginMethodDialog` (`mode="link"`, only the copy text changes). The link-or-replace decision in `AccountLinkService::loginAs()` is **based on the login status AT THE TIME the link is consumed** (`auth()->check()`), not a flag from the UI, so that magic links issued through the CLI (`sso:emergency-login`) or clicked from an email (which never went through the "Add Account" modal at all) still add to the linked list instead of overriding the active account. Logout `POST /accounts/logout-current` only signs out the active account (auto-switching to another linked account if there is one; if it is the last account, delegating to `SsoController::logout()`); `POST /logout` still logs out all accounts at once. |
| Custom collection groups in the style of MangaDex MDList (e.g. "RomCom") | `CollectionGroup`/`CollectionGroupController` — many-to-many (`collection_group_items` pivot, one manga can be in several groups), separate pages `User/CollectionGroups/Index.tsx` (group list + cover collage) and `Show.tsx` (group contents + add-manga-from-collection dialog, width `sm:max-w-7xl`, `onScroll`-based infinite scroll instead of `<Pagination>` for browsing large collections, plus a type filter). Group URLs use a slug (`{username}-{group-name}`, see `CollectionGroup::generateUniqueSlug()`), not a UUID. A group can be toggled public/private (`Switch` on the detail page); public groups appear on the owner's public profile and are accessible to guests through `PublicShell` (a shared component, also used by `Profile/Show.tsx`). **Not** a single string column per collection (the original design was wrong, replaced entirely) |
| Read progress stepper from the My Collection page (without opening the collection detail) | `Collection/Index.tsx` (`ReadStepper`) — reuses the same `collection.volumes.readProgress` endpoint as the detail page, per-row loading state so rows don't block each other |
| Three My Collection views: Grid, Compact (new), Table | `Collection/Index.tsx` — a single segmented toggle (`ViewToggle`, icon + CSS transform sliding indicator) replaces the two separate grid/table buttons. Grid cards are larger (190x260) + a desktop hover overlay (progress, stepper, mark-all, "Continue to Vol X") that only shows from `md:` up (`opacity-0`/`group-hover:opacity-100`, `pointer-events-none` when collapsed). Compact = dense text-only rows, on desktop hover swaps the badge→stepper+info+options, on mobile 2 always-visible lines (hover has no meaning on touch). `RowActionsMenu` (4 items: View/Continue to Vol X/Mark all as read/Delete, a dropdown not a context-menu) is used in grid+compact to cover the actions that would be skipped when mobile gets no hover. Animations use the existing Tailwind/`tw-animate-css` (not Anime.js; there is no orchestration need that CSS transition/transform alone can't handle). Skeletons (`GridSkeleton`/`CompactSkeleton`/`TableSkeleton`) are shown for the `refreshing` state |
| Multi-language flash messages | `lang/{id,en,ja}/flash.php` — all `->with('success'/'error'/'info', ...)` across every controller (~70 calls, 24 files) use `__('flash.xxx', [...])`, not hardcoded strings |
| Collection export/import (personal backup) | `CollectionController::export()`/`import()` — exports to JSON (`response()->streamDownload()`, same pattern as `DatabaseBackupController`), containing series identifiers (`anilist_id`/`ranobedb_id`/`mal_id`/`slug`, all sent for robustness) + condition/rating/review + the full volume list. Import matches in order (`anilist_id` → `ranobedb_id` → `mal_id` → `slug`) against the **local** catalog; it does **not** auto-fetch from AniList if a series isn't in the catalog yet (skipped + the count is reported, not triggering an AniList import; avoids duplicating `AniListController` logic). Series already in the user's collection are also skipped (append-only, not overwrite/replace). All fields are whitelisted/sanitized (`sanitizeEnum()`) before entering the DB; never trust an uploaded file as-is. UI: Export/Import buttons in the `Collection/Index.tsx` header, same file-input dialog pattern as `DatabaseTab` in `Admin/Settings/Index.tsx` |
| "Missing volumes" badge (next volume to buy) in My Collection, click to jump straight into the Add Volume form | `CollectionController::missingVolumes()` — `range(1, series.total_volumes)` minus the owned volume numbers (`CollectionVolume.volume_number`); `total_volumes` from AniList/RanobeDB already represents volumes that HAVE been released (not a projected total), so no separate release date filter is needed. Series with null `total_volumes` are skipped (can't be computed). Shown as an amber badge `{{count}} kurang` on grid cards & table rows (`MissingVolumesBadge` in `Collection/Index.tsx`); hover opens a `HoverCard` showing the full numbers compressed with the same range syntax as the "Add Volume" input (e.g. `4, 6-7, 9-12`, function `compressRanges()`). The badge is a `<Link>` to `collection.show` with the query param `?addVolumes={numbers}`; `Collection/Show.tsx` reads that param in a `useEffect` once on mount, prefills the `volumes` field of the "Add Volume" form + auto-opens its dialog, then clears the query param from the URL bar via `window.history.replaceState` (so refresh/back doesn't re-trigger it) |
| "Similar Series" recommendations on the Catalog detail page | `User\SeriesController::show()` + `Catalog/Show.tsx` — OR-match on shared genres (`orWhereJsonContains('genres', ...)`, same pattern as the Catalog Index genre filter), falling back to series of the same type if this series has no genres at all, `inRandomOrder()->limit(12)`, displayed with the same `SeriesCard` as Catalog Index. **Replaces the volume list section that was removed** (see the row below) |
| Big eye icon as the main control on My Collection volume grid cards | `Collection/Show.tsx` — since the per-volume cover was removed (see the row above), the center area of the volume grid card, formerly an empty placeholder (just the volume number), became a big `Eye`/`EyeOff` button to toggle read/unread (`toggleRead()`), plus a small "Vol. X" label under the icon. The small icon that used to sit in the top-left corner was removed (redundant) |

**Removed (not backlog; intentionally reverted entirely, documentation kept for historical context):**
- **Per-volume cover (manual upload, AniList single-pick, SerpApi auto-search/bulk)** — originally built in this session (Google Books → abandoned because testing proved the results were random → SerpApi Google Images), but decided to be removed ENTIRELY after reflection: the core of this app is only tracking reading progress & ownership (physical/digital), not a per-volume image gallery. The series cover (`Series` level, not `Volume`) remains and is still used. The column `volumes.cover_path` was dropped via migration (`2026_08_30_222726_drop_cover_path_from_volumes_table.php`), the files `SerpApiService`/`SerpApiSettingsService`/`SerpApiSetting`/`SerpApiSettingController` were deleted, the "SerpApi" tab in Admin Settings was removed, and `VolumeGrid.tsx` (used to show per-volume covers in the Catalog) was removed entirely. `VolumeController::searchCovers()`/`applyCovers()` were also removed; the remaining methods are only `generate`/`store`/`edit`/`update`/`destroy`/`restore`, all without cover file handling.

**Not yet done (backlog):**
- Activity feed on public profiles (community hub, Steam-style): public profiles + follow exist, the activity feed is still deferred.
- Genre taste badges/labels ("Genre Explorer" vs "Genre Loyalist") based on the collection's genre distribution: deferred, rides on the same data as the Genre Taste feature (word cloud + AI funfact).
- Advanced filters for AniList batch import: multi-select genre (currently still single-select), tag filter (`tag_in`; AniList has ~470 tags, needs a searchable combobox, not a static dropdown), and status filter (`status_in`, publishing/finished/hiatus/etc.). Already discussed and verified directly via the API (`tag_in`/`status_in` both work for manga), but not yet given the "gas".
- Manual visual verification of the `LoginMethodDialog` modal: the code is `tsc`-clean and reviewed, but has not been clicked through in a browser (see PHASES.md Phase 18 for details on why).
- **Cover image loading performance after a long idle period** (discussed 2026-08-16, not yet given the "gas"): two complementary fixes:
  1. `loading="lazy"` on all cover `<img>` in the Catalog/Collection/Dashboard grids; right now every rendered image is fetched at once, not just those visible in the viewport.
  2. `Cache-Control` for image assets; the approach depends on the storage driver: for `local`, add a `location` block in the nginx config (`docs/DEPLOYMENT.md`) for the paths `/storage/` & `/build/assets/` (`expires 1y; add_header Cache-Control "public, immutable";`); for `s3` (including self-hosted S3-compatible like MinIO in the homelab), nginx isn't used at all because the browser fetches directly from S3/MinIO, so you need to set `'options' => ['CacheControl' => 'public, max-age=31536000, immutable']` in `StorageSettingsService::buildS3Disk()` (`app/Services/StorageSettingsService.php:46`), which is applied automatically to all new uploads. **Note**: the S3 option only applies to files uploaded AFTER the change; old covers in the bucket don't get their headers updated automatically unless re-uploaded/copy-metadata'd manually.
  - Homelab context: the user plans to keep media on a separate physical disk through MinIO (S3-compatible) instead of a local folder. This app has supported custom S3-compatible endpoints from the start (`buildS3Disk()` accepts a custom `endpoint`), so no code change is needed for that; just fill in the MinIO endpoint at `/admin/settings/storage`.

---

## Prohibited

- `any` in TypeScript
- Inline CSS style (`style={{ color: 'red' }}`)
- Custom HTML components when one already exists in shadcn/ui
- Hardcoding roles/permissions in the frontend
- Sending unnecessary sensitive data to Inertia props
- Committing `.env` or files containing secrets
- Skipping middleware or bypassing policies
- `dd()` or `var_dump()` in production code
- Accessing the `Storage::` facade directly outside `StorageSettingsService`
- Importing from `JikanService` (already removed; use `AniListService` instead)
- Rendering a page that guests can access (a route outside the `auth` middleware, e.g. a public profile or public collection group) directly with `UserLayout`/`AdminLayout`. Both assume a login session (`AccountSwitcher.tsx` accesses `auth.user!`, a non-null assertion) and **crash completely into a blank screen** if `auth.user` is null. Send an `is_guest`/`is_owner` flag from the controller, then `const Layout = is_guest ? PublicShell : UserLayout` (see `Profile/Show.tsx`, `CollectionGroups/Show.tsx`). This was found as a real bug in Phase 29 because earlier verification only checked the Inertia JSON response via curl, not an actual React render in a browser.
