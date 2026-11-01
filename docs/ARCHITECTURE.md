# ARCHITECTURE — Malas

**Version:** 3.5
**Updated:** 2026-08-03

> This document describes the **actual** current architecture of the app. For change history, see [`CHANGELOG.md`](../CHANGELOG.md). For the development phase log, see [`PHASES.md`](PHASES.md).

---

## 1. Tech Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Backend | Laravel | 12 | Mature, large ecosystem, built-in auth/policy |
| Frontend bridge | Inertia.js | v2 | SPA feel without a separate API layer |
| Frontend | React | 19 | Largest ecosystem, future-proof |
| Language | TypeScript | 5 | Type safety, maintainable without AI |
| UI Components | shadcn/ui (Base UI) | latest | Copy-paste, not a black-box dependency; uses the `render` prop, not `asChild` |
| Styling | Tailwind CSS | v4 | Utility-first, consistent with shadcn |
| Bundler | Vite | latest | Fast HMR, built into Laravel |
| Auth/Role | Spatie Permission | latest | Industry standard for Laravel RBAC |
| Auth SSO | Yado | — | PKCE-based OAuth2; all user accounts are managed via SSO, no local registration |
| DB (dev) | SQLite | 3 | Zero config for development |
| DB (prod) | MySQL | 8+ | Proven for production |
| Storage | Local disk or S3-compatible (Cloudflare R2, etc.) | — | Configured via the admin UI (`storage_settings` table), not `.env` |
| External API | AniList GraphQL | — | Imports manga/manhwa/manhua/novel metadata; replaces Jikan/MAL |
| HTTP Client | Axios (via Inertia) | — | Already bundled |
| Charts | Recharts + `ui/chart.tsx` | latest | Admin & user dashboards |
| Carousel | embla-carousel-react + `ui/carousel.tsx` | latest | User dashboard recommendations |
| Command menu | cmdk + `ui/command.tsx` | latest | Admin Command Palette & user Global Search |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | latest | Admin sidebar menu reorder (`SortableMenuList.tsx`) |
| Multi-language | react-i18next | latest | id/en/ja UI, JSON namespace per page, see §9 |
| AI (client-side) | Puter.js | v2 | Default provider for the Genre Taste feature; runs in the user's browser, free, no server API key |
| External API | RanobeDB REST API | — | Light novel metadata import, parallel to AniList; see [`RANOBEDB_INTEGRATION.md`](RANOBEDB_INTEGRATION.md) |
| Email | Resend (`resend/resend-php`) | v1 | Magic link login without SSO; configured via the admin UI (`mail_settings`), not `.env` |

---

## 2. Database Schema

### `users`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| sso_id | string unique | nullable — account ID from Yado |
| name | string | |
| username | string | nullable |
| email | string unique | |
| avatar | string | nullable |
| is_profile_public | boolean | default false — opt-in to show the profile at `/u/{user}` (accessible to guests) |
| locale | string(5) | default `id` — UI language preference (`id`/`en`/`ja`) |
| theme | string(10) | default `system` — `light`/`dark`/`system`, same sync pattern as `locale` (`PATCH /settings/theme`) |
| password | string | nullable (SSO accounts don't always have a local password) |
| role | enum | `super_admin`, `admin`, `user` |
| is_banned | boolean | default false |
| ban_reason | text | nullable |
| banned_at | timestamp | nullable |
| deleted_at | timestamp | soft delete |
| created_at / updated_at | timestamp | |

### `series`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| mal_id | bigint unique | nullable — legacy, left over from the Jikan era |
| anilist_id | bigint unique | nullable |
| ranobedb_id | bigint unique | nullable — from RanobeDB, light novels only |
| slug | string unique | auto-generated from `title_romaji` (`Str::slug()` with an empty dictionary: symbols like `@`/`!`/comma/colon are dropped outright, not converted into words; the full title is used without truncation however long) — used for user catalog URLs (`/catalog/{slug}`) **and** admin series URLs (`/admin/series/{slug}`, including links from AniList/RanobeDB/Search results and the Command Palette), regenerated automatically when `title_romaji` changes, with a `-2`/`-3` suffix added on collision. Route model binding tries the slug first, falling back to id (old links keep working). |
| title_romaji | string | required |
| title_english | string | nullable |
| title_japanese | string | nullable |
| synopsis | text | nullable |
| cover_path | string | nullable — relative path, resolved via `StorageSettingsService` |
| status | enum | `publishing`, `finished`, `on_hiatus`, `discontinued`, `not_yet_published` |
| type | enum | `manga`, `manhwa`, `manhua`, `novel`, `one_shot`, `doujinshi` |
| published_from | date | nullable |
| published_to | date | nullable |
| total_volumes | int | nullable |
| score | decimal(4,2) | nullable |
| rank | int | nullable |
| genres | json | nullable — from AniList/RanobeDB |
| authors | json | nullable — from AniList/RanobeDB |
| illustrators | json | nullable — from RanobeDB (`staff[].role = illustrator`), AniList doesn't split this out |
| themes | json | nullable — from AniList/RanobeDB |
| demographics | json | nullable — from AniList/RanobeDB |
| is_adult | boolean | default false — used for the 18+ content blur |
| deleted_at | timestamp | soft delete |
| created_at / updated_at | timestamp | |

### `volumes`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| series_id | uuid FK | |
| volume_number | int | |
| cover_path | string | nullable |
| type | enum | `regular`, `digital`, `bind_up` |
| digital_source | string | nullable |
| isbn | string | nullable |
| published_at | date | nullable |
| deleted_at | timestamp | soft delete |
| created_at / updated_at | timestamp | |
| **UNIQUE** | (series_id, volume_number) | |

### `collections`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| user_id | uuid FK | |
| series_id | uuid FK | |
| condition | enum | `mint`, `good`, `fair`, `poor` |
| group_name | string(100) | nullable — free-form per-user label (e.g. "Rak Kamar"), not a separate table |
| acquired_at | date | nullable |
| notes | text | nullable |
| personal_rating | smallint | nullable, -10 to 10 (MyAnimeList style: negative = not recommended) |
| personal_review | text | nullable — the user's personal comment on this series |
| created_at / updated_at | timestamp | |
| **UNIQUE** | (user_id, series_id) | one collection per series per user |

### `collection_volumes`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| collection_id | uuid FK | cascade delete |
| volume_number | int | volume number owned by the user |
| format | enum | `physical`, `ebook`, `online`, `webtoon` |
| ebook_source | string | nullable — ebook source (e.g. `mangaplus`, `k_manga`), relevant when format is `ebook`/`online` |
| language | string | nullable — release language of the volume the user owns |
| read_at | timestamp | nullable — set when the volume is marked as read, null = not read yet |
| created_at / updated_at | timestamp | |
| **UNIQUE** | (collection_id, volume_number) | |

Note: not tied to the `volumes` table (admin-defined). Users enter the volume numbers they own themselves; the range syntax (`1-5,7,9-12`) is supported and parsed in `CollectionController::storeVolumes()`.

### `loans`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| collection_id | uuid FK | owner's collection |
| collection_volume_id | uuid FK | the user's volume being loaned (cascade delete) |
| borrower_name | string | borrower's name (free text) |
| loaned_at | date | required |
| due_at | date | nullable |
| returned_at | date | nullable — if set = returned |
| notes | text | nullable |
| created_at / updated_at | timestamp | |

### `tickets`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| user_id | uuid FK | cascade delete |
| series_id | uuid FK | nullable, null on delete — related series (optional, can be pre-filled from the catalog) |
| subject | string | |
| type | enum | `catalog_request`, `title_revision`, `other` |
| message | text | |
| status | enum | `open`, `in_progress`, `resolved`, `closed` |
| admin_response | text | nullable |
| responded_by | uuid FK | nullable, null on delete — the admin who responded |
| responded_at | timestamp | nullable |
| created_at / updated_at | timestamp | |

### `storage_settings`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| driver | enum | `local`, `s3` |
| access_key_id | string | nullable |
| secret_access_key | text | nullable — **encrypted** via Eloquent cast |
| bucket | string | nullable |
| endpoint | string | nullable — for non-AWS S3-compatible services (R2, etc.) |
| region | string | nullable |
| url | string | nullable — custom public URL/CDN |
| created_at / updated_at | timestamp | |

Single-row table (one active configuration). Read by `StorageSettingsService`, never accessed directly via the `Storage::` facade in other controllers.

### `menus`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| key | string unique | slug, e.g. `series.index` |
| label | string | shown in the sidebar |
| icon | string | Lucide icon name, nullable |
| route_name | string | Laravel route name, nullable |
| parent_key | string | FK to `menus.key`, nullable (submenu) |
| sort_order | int | display order |
| is_visible | boolean | default true |
| is_maintenance | boolean | default false |
| maintenance_message | text | nullable, has a default |
| role_access | json | array of roles, e.g. `["admin","user"]` |
| created_at / updated_at | timestamp | |

### `announcements`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| title | string | |
| body | text | markdown |
| type | enum | `info`, `warning`, `danger`, `success` |
| is_active | boolean | default true |
| starts_at | datetime | nullable |
| expires_at | datetime | nullable |
| created_at / updated_at | timestamp | |

### `announcement_user` *(pivot)*
| Column | Type | Notes |
|-------|------|-----------|
| announcement_id | uuid FK | |
| user_id | uuid FK | |
| dismissed_at | timestamp | |

### `wishlist_items`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| user_id | uuid FK | cascade delete |
| series_id | uuid FK | cascade delete |
| created_at / updated_at | timestamp | |
| **UNIQUE** | (user_id, series_id) | one wishlist entry per series per user |

Series the user hasn't collected yet but wants to read. Separate from `collections`; no volume/format tracking involved.

### `follows`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| follower_id | uuid FK to `users` | cascade delete — the user who follows |
| following_id | uuid FK to `users` | cascade delete — the user being followed |
| created_at / updated_at | timestamp | |
| **UNIQUE** | (follower_id, following_id) | |

Used for the follow feature on public profiles (`/u/{user}`) and the user directory (`/directory`, requires login).

### `ai_settings`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| provider | string | default `gemini` — `puter` / `gemini` / `openai` / `claude` |
| api_key | text | nullable — **encrypted** via Eloquent cast, not used for the `puter` provider (client-side, no key) |
| created_at / updated_at | timestamp | |

Single-row table, managed from the `/admin/settings` AI tab. If there is no row at all, the app defaults to the `puter` provider.

### `genre_funfacts`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| user_id | uuid FK unique | cascade delete — one funfact per user |
| provider | string | nullable — the provider used in the last generation |
| content | text | nullable — AI-generated funfact text |
| generated_at | timestamp | nullable |
| collections_count_at_generation | int unsigned | nullable — snapshot of the collection count at generation time, used to trigger auto-regenerate when the collection grows significantly |
| manual_regenerate_count | tinyint unsigned | default 0 — number of manual regenerations within the current window |
| manual_regenerate_window_started_at | timestamp | nullable |
| quota_override | int unsigned | nullable — overrides the per-user quota limit (default quota: `GenreFunfact::DEFAULT_MANUAL_QUOTA` = 5/week), set by admin at `/admin/funfact-quota` |
| created_at / updated_at | timestamp | |

Part of the "Genre Taste" feature (word cloud + AI funfact) on the user dashboard; see §9.

### `mail_settings`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| provider | string | default `resend` — the only provider supported right now |
| api_key | text | nullable — **encrypted** via Eloquent cast |
| from_address | string | nullable — sender address, falls back to a placeholder if empty |
| from_name | string | nullable — sender name, falls back to `config('app.name')` if empty |
| created_at / updated_at | timestamp | |

Single-row table, managed from the `/admin/settings` Email tab. Used by `MailSettingsService::send()`, which sets the config `services.resend.key`/`mail.from.*` at runtime before sending, the same pattern as `StorageSettingsService::disk()`. If `api_key` is empty, `isConfigured()` returns false and features that depend on email (login without SSO) silently skip sending without an error to the user.

### `sso_fallback_tokens`
| Column | Type | Notes |
|-------|------|-----------|
| id | uuid PK | |
| user_id | uuid FK | cascade delete |
| token_hash | string unique | SHA-256 hash of the raw token; the real token only exists in the email link, same pattern as Laravel's built-in `password_reset_tokens` |
| expires_at | timestamp | 15 minutes from issuance (`SsoFallbackToken::issueFor()`) |
| used_at | timestamp | nullable — set as soon as the token is used, preventing reuse |
| created_at / updated_at | timestamp | |

Used by the "Login with Email" feature; see §8.

---

## 3. Folder Structure

```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Admin/
│   │   │   ├── DashboardController.php
│   │   │   ├── MenuController.php
│   │   │   ├── SeriesController.php        (includes bulkDestroy; edit()/update() send & receive
│   │   │   │                                genres/authors/illustrators/themes/demographics)
│   │   │   ├── VolumeController.php
│   │   │   ├── CollectionController.php
│   │   │   ├── LoanController.php
│   │   │   ├── UserController.php
│   │   │   ├── AnnouncementController.php
│   │   │   ├── AniListController.php       (search & import from AniList GraphQL)
│   │   │   ├── ImageSearchController.php
│   │   │   ├── TicketController.php        (admin view & respond)
│   │   │   ├── StorageSettingController.php
│   │   │   ├── DatabaseBackupController.php (download/import backup, super_admin)
│   │   │   ├── ActivityLogController.php   (admin activity log viewer)
│   │   │   ├── SiteSettingController.php   (18+ content blur)
│   │   │   ├── SeriesMediaController.php   (extra media gallery per series)
│   │   │   ├── CommandSearchController.php (search Series/Users/Tickets for the Command Palette)
│   │   │   ├── ExternalSearchController.php (combined AniList+RanobeDB search for admin, /admin/search-external)
│   │   │   ├── RanobeDbController.php      (search & import light novel metadata from RanobeDB)
│   │   │   ├── AiSettingController.php     (AI provider configuration: puter/gemini/openai/claude + api_key)
│   │   │   ├── GenreFunfactController.php  (manage per-user funfact regenerate quota, /admin/funfact-quota)
│   │   │   └── MailSettingController.php   (Email provider configuration: Resend + api_key/from_address/from_name)
│   │   ├── User/
│   │   │   ├── DashboardController.php     (genre recommendations + Surprise Me + AI funfact: regenerate/
│   │   │   │                                auto-save/report-error/genre-detail)
│   │   │   ├── SeriesController.php        (catalog, read-only + search endpoint; multi-select genre
│   │   │   │                                filter OR-match via chained whereJsonContains)
│   │   │   ├── CollectionController.php    (bulk destroyVolumes, range parsing, toggle/mark-all
│   │   │   │                                read, update review/rating, per-volume/bulk format,
│   │   │   │                                advanceReadProgress stepper, per-format quickAdjustCount)
│   │   │   ├── TicketController.php        (users create & view tickets)
│   │   │   ├── LoanController.php
│   │   │   ├── SearchController.php        (search Series + Collection for Global Search)
│   │   │   ├── ProfileController.php       (public profile /u/{user}, guest-accessible, follow/unfollow,
│   │   │   │                                user directory)
│   │   │   └── WishlistController.php      (series the user wants to read, not yet collected)
│   │   └── Auth/
│   │       ├── SsoController.php           (PKCE OAuth2 redirect/callback/logout)
│   │       └── SsoFallbackController.php   (login without SSO: single-use email magic link,
│   │                                        used when Yado is unreachable)
│   ├── Middleware/
│   │   ├── CheckMenuAccess.php
│   │   ├── EnsureNotBanned.php
│   │   └── SetLocale.php        (sets App::setLocale() from users.locale, default 'id')
│   └── Requests/
│       ├── Admin/
│       └── User/
├── Models/
│   ├── User.php             (is_profile_public, locale; relations followers/following, wishlistItems, genreFunfact;
│   │                          resolveRouteBinding by username then id)
│   ├── Series.php           (genres/authors/illustrators/themes/demographics json, ranobedb_id, is_adult)
│   ├── Volume.php
│   ├── Collection.php       (condition, personal_rating -10..10, personal_review)
│   ├── CollectionVolume.php (format, ebook_source, language, read_at datetime cast)
│   ├── Loan.php
│   ├── Menu.php
│   ├── Announcement.php
│   ├── Ticket.php
│   ├── StorageSetting.php   (encrypted secret_access_key cast)
│   ├── ActivityLog.php      (audit log of sensitive admin actions)
│   ├── SiteSetting.php      (blur_adult_content, single-row)
│   ├── WishlistItem.php
│   ├── Follow.php           (follower_id / following_id, both FKs to users)
│   ├── AiSetting.php        (encrypted api_key cast, single-row)
│   ├── GenreFunfact.php     (DEFAULT_MANUAL_QUOTA = 5, per-user quota_override)
│   ├── MailSetting.php      (encrypted api_key cast, single-row)
│   └── SsoFallbackToken.php (token_hash SHA-256, single-use, TTL 15 minutes)
├── Policies/
│   ├── SeriesPolicy.php
│   ├── VolumePolicy.php
│   ├── CollectionPolicy.php
│   ├── LoanPolicy.php
│   ├── MenuPolicy.php
│   ├── UserPolicy.php
│   ├── AnnouncementPolicy.php
│   ├── TicketPolicy.php
│   └── StorageSettingPolicy.php
└── Services/
    ├── AniListService.php         (GraphQL client, injects StorageSettingsService for covers)
    ├── RanobeDbService.php        (RanobeDB REST client, light novels only, parallel to AniListService)
    ├── AiFunfactService.php       (builds the prompt from the user's collection data, calls the Gemini/OpenAI/
    │                                Claude provider via HTTP; the `puter` provider is generated in the browser, see lib/puter.ts)
    ├── AiRateLimitException.php   (thrown by AiFunfactService when the provider replies HTTP 429, caught by
    │                                DashboardController to fall back to default text without consuming the manual quota)
    ├── MailSettingsService.php    (sets the Resend config at runtime from mail_settings, single entry point for sending email —
    │                                same pattern as StorageSettingsService::disk())
    ├── StorageSettingsService.php (single entry point for all file storage operations)

app/Mail/
└── SsoFallbackLoginMail.php   (magic link login without SSO, view: resources/views/emails/sso-fallback-login.blade.php)

app/Console/Commands/
└── IssueEmergencyLoginLink.php (`sso:emergency-login` — issues an SsoFallbackToken from the CLI, for admins
    who need quick access over SSH without waiting for email; see docs/DEPLOYMENT.md)

resources/js/
├── Pages/
│   ├── Admin/
│   │   ├── Dashboard.tsx   (stat cards + charts: Series per Status, Collection per Type, Loan Status)
│   │   ├── Menus/          Index.tsx (drag-drop reorder), Edit.tsx, UserSidebar.tsx (user sidebar preview)
│   │   ├── Series/         Index.tsx (bulk delete, hover card, context menu), Create.tsx, Edit.tsx,
│   │   │                   Show.tsx, EditVolume.tsx
│   │   ├── Collections/    Index.tsx, Show.tsx
│   │   ├── Loans/          Index.tsx
│   │   ├── Users/          Index.tsx, Show.tsx
│   │   ├── Announcements/  Index.tsx, Create.tsx, Edit.tsx
│   │   ├── AniList/        Index.tsx (search & import — card overlay), Status.tsx
│   │   ├── RanobeDb/       Index.tsx (search & import light novels from RanobeDB — card overlay,
│   │   │                   parallel to AniList/Index.tsx)
│   │   ├── Search/         Index.tsx (combined AniList+RanobeDB search, /admin/search-external)
│   │   ├── GenreFunfacts/  Index.tsx (per-user funfact regenerate quota — view/reset/override)
│   │   ├── Tickets/        Index.tsx, Show.tsx
│   │   ├── ActivityLog/    Index.tsx
│   │   └── Settings/       Index.tsx (Storage/Database/Content/AI/Email tabs)
│   ├── User/
│   │   ├── Dashboard.tsx   (stat cards, Collection per Status chart, recommendations Carousel + Surprise Me,
│   │   │                   Genre Taste card — word cloud + AI funfact)
│   │   ├── Catalog/        Index.tsx, Show.tsx (collector avatars)
│   │   ├── Collection/     Index.tsx (auto-fill poster grid, reading progress datatable),
│   │   │                   Show.tsx (read toggle, delete mode, review & rating, per-volume/bulk format)
│   │   ├── Wishlist/       Index.tsx (series the user wants to read, not yet collected)
│   │   ├── Profile/        Show.tsx (public profile /u/{user} — guest-accessible via PublicShell,
│   │   │                   follow/unfollow, public collection non-clickable for guests)
│   │   ├── Directory/      Index.tsx (user directory, requires login, for following)
│   │   ├── Tickets/        Index.tsx, Create.tsx, Show.tsx
│   │   └── Loans/          Index.tsx
│   ├── Auth/               Banned.tsx, SsoFallback.tsx (login without SSO — email form + send status)
│   ├── Settings/           Index.tsx (read-only profile from SSO + Language card + public profile toggle)
│   ├── Error.tsx           (handles 403, 404, 500, 503)
│   ├── Maintenance.tsx
│   └── Landing.tsx
├── Layouts/
│   ├── AdminLayout.tsx     (admin sidebar + topbar, ScrollArea wrapping, mounts CommandPalette,
│   │                         LanguageSwitcher in the footer)
│   └── UserLayout.tsx      (user sidebar + topbar search bar, mounts GlobalSearch,
│                             LanguageSwitcher in the footer)
├── Components/
│   ├── ui/                 (shadcn/ui — DO NOT MODIFY. Includes empty.tsx, hover-card.tsx,
│   │                        context-menu.tsx, command.tsx, chart.tsx, carousel.tsx)
│   └── app/
│       ├── VolumeGrid.tsx          (pure display, no toggle)
│       ├── AnnouncementBanner.tsx
│       ├── StatusBadge.tsx         (SeriesStatusBadge, SeriesTypeBadge, VolumeTypeBadge,
│       │                            TicketStatusBadge, TicketTypeBadge, VolumeFormatBadge — all
│       │                            translated via t('badge.*'), falling back to the raw value)
│       ├── PageHeader.tsx          (responsive — stacks columns on mobile)
│       ├── EmptyState.tsx          (used on pages not yet migrated to ui/empty.tsx)
│       ├── Pagination.tsx          (responsive; optional per-page selector via props routeName+filters)
│       ├── SeriesCard.tsx          (catalog poster card — cover, title, badge)
│       ├── SeriesMediaGallery.tsx  (extra media gallery per series, admin)
│       ├── CommandPalette.tsx      (admin ⌘K — quick nav + search Series/Users/Tickets)
│       ├── GlobalSearch.tsx        (user ⌘K — quick nav + search Catalog/My Collection)
│       ├── SortableMenuList.tsx    (drag-drop menu reorder, @dnd-kit, used by Admin/Menus/Index.tsx)
│       ├── LanguageSwitcher.tsx    (Popover to switch language id/en/ja, in the sidebar footer + Settings;
│       │                            guest-safe — skips persisting if not logged in)
│       ├── ThemeSwitcher.tsx       (Light/Dark/System Popover, identical pattern to LanguageSwitcher;
│       │                            resolvedTheme via matchMedia, live-updates when the OS changes theme)
│       ├── TagListInput.tsx        (free-form tag editor — Enter/comma adds, click-X removes; used for
│       │                            genres/authors/illustrators/themes/demographics in Series Edit)
│       ├── GenreMultiSelect.tsx    (searchable multi-select genre filter, Popover+Command/cmdk,
│       │                            grouped manga/novel; used in Catalog/Index.tsx)
│       └── LoginMethodDialog.tsx   (SSO/Email choice modal — mounted on the Landing page and
│                                    PublicShell/follow CTA in Profile/Show.tsx for guests)
├── hooks/
│   └── useFlash.ts         (sonner toast from the flash session, supports an "Undo" action via
│                             flash.undo_url/undo_payload)
└── lib/
    ├── utils.ts
    ├── types.ts            (shared TypeScript interfaces, including TicketType/TicketStatus)
    ├── i18n.ts             (react-i18next init — static import of all id/en/ja namespace JSON,
    │                         lng from the shared Inertia prop `locale`)
    ├── menu.ts             (menuTranslationKey() — maps DB menu keys to `menu.*` translation keys)
    ├── typeFilters.ts      (useTypeFilterOptions() — translated series type filter options, used
    │                         on all series/collection list pages)
    └── puter.ts            (window.puter.ai.chat() wrapper — client-side AI generation for the Puter provider)

resources/js/lang/{id,en,ja}/
    common.json, dashboard.json, user.json, catalog.json, collection.json, admin.json
    (per-namespace JSON resources for react-i18next, see §9)

lang/{id,en,ja}/
    validation.php, pagination.php
    (stock Laravel translations — validation & paginator messages automatically follow App::getLocale())
    flash.php
    (~70 flash messages from all controllers, keys nested per feature — called via
    __('flash.xxx', [...]), see §9)
```

---

## 4. Request Lifecycle

```
Browser → Laravel Router
       → auth middleware       (checks login via SSO session)
       → not_banned            (checks is_banned)
       → check.menu            (checks is_maintenance + role_access from the menus table)
       → Controller            (authorize via Policy, or abort_unless(hasRole) for super_admin-only)
       → Inertia::render()     (returns the React page + minimal props)
       → React renders in the browser
```

---

## 5. Authorization Flow

```
1. Route middleware: auth + not_banned + check.menu
2. Controller: $this->authorize('action', $model)  ← via Laravel Policy
3. Policy: $user->role === 'admin' || $user->isOwner($resource)
```

Policy example:
```php
// CollectionPolicy.php
public function update(User $user, Collection $collection): bool
{
    return $user->isAdmin() || $collection->user_id === $user->id;
}
```

Exception: features that are purely `super_admin`-only with no relevant model (Storage Settings, Database Backup) use `abort_unless(auth()->user()->hasRole('super_admin'), 403)` directly in the controller instead of a Policy.

---

## 6. Menu System

The `menus` table is the source of truth for navigation:

```
Every request → CheckMenuAccess middleware:
1. Get the current route name
2. Look it up in the menus table WHERE route_name = current_route
3. If not found → skip (the route isn't in the menu system)
4. If is_maintenance = true AND user is not admin/super_admin → return the Maintenance page
5. If the user's role is not in role_access → abort(403)
6. Pass → continue to the controller
```

The frontend sidebar is built from the menus data sent via shared Inertia data (`HandleInertiaRequests` middleware). Every new menu must be added to `MenuSeeder.php` with `updateOrCreate`.

---

## 7. File Storage

All files (series covers, volume covers) are accessed through **`StorageSettingsService`**; no other code may call the `Storage::` facade directly.

- Configuration (`local` or `s3` driver, credentials, bucket, endpoint, region, custom URL) is stored in the `storage_settings` table and managed via `/admin/settings/storage`, **not** `.env`.
- `secret_access_key` is encrypted automatically through an Eloquent cast on the `StorageSetting` model.
- The `s3` driver supports a custom endpoint, so it is compatible with real AWS S3 as well as S3-compatible services (Cloudflare R2, Backblaze B2, MinIO, etc.).
- `StorageSettingsService` provides the methods: `disk()`, `url($path)`, `storeUploadedFile($file, $dir)`, `storeContents($dir, $filename, $contents)`, `delete($path)`.
- Path convention: `covers/{uuid}.{ext}` for manually uploaded series/volume covers; `covers/url_{uniqid}.{ext}` for covers fetched from an AniList URL.

---

## 8. External Integrations

### AniList GraphQL
- Endpoint: `https://graphql.anilist.co`
- Used to search & import series metadata (title, synopsis, genre, author, theme, demographic, score, cover) from `Admin/AniList/Index.tsx`.
- Re-syncing metadata to an existing series is available from the "Sync AniList" Popover on the Edit Series page.
- Replaces the previous generation's Jikan/MyAnimeList integration (`JikanService` has been removed entirely).
- **Batch import** (`AniListController::bulkImport()`): the genre filter (`genre_in`) + release year + popularity sort are passed to `AniListService::searchManga()`. **Important**: `seasonYear` in the AniList schema is an anime airing-season concept and always returns an empty array for `type: MANGA`; verified directly against the API before use. The year filter for manga must go through the `startDate_greater`/`startDate_lesser` range (`FuzzyDateInt`, format `YYYYMMDD`: `gt = {year}0000`, `lt = {year+1}0000`). `AniListService::getMangaBatch()` fetches up to 50 series at once in a single GraphQL request (`media(id_in: [...])`), not N separate requests, which matters for saving AniList's rate-limit quota (~90 req/minute).

### Yado SSO
- PKCE-based OAuth2. All users (including admins) log in through SSO; there is no local register/login form.
- Flow: `/auth/redirect` → Yado → `/auth/callback` (`SsoController`) → the user is created/updated from SSO claims (`sso_id`, `name`, `username`, `email`, `avatar`) → session created.
- The `Settings/Index.tsx` page shows the profile read-only (profile data is managed on the SSO side, not in Malas).
- `SsoController::curlRequest()` uses curl directly (not Laravel's `Http::` facade/Guzzle); in this environment Guzzle's `curl_multi` intermittently hangs under PHP-FPM, and a blocking `curl_exec` is more reliable.

### Login with Email (magic link)
- Originally built as an emergency fallback when Yado is unreachable, now promoted to a **login option equal to SSO**, chosen from `LoginMethodDialog.tsx` (the "Masuk ke Malas" modal that appears when clicking the Login button on the Landing page), not just a small hidden link. The backend mechanism is unchanged from the fallback version.
- Flow: `LoginMethodDialog` (or directly `/auth/fallback`) → user enters email → `POST /auth/fallback` (`throttle:5,10`, raised from `3,15` after being promoted to an everyday option) → if the email matches an existing user AND `mail_settings` is configured, issue an `SsoFallbackToken` (TTL 15 minutes, single-use) and send the magic link by email (`SsoFallbackLoginMail`) → user clicks the link → `GET /auth/fallback/{token}` (`SsoFallbackController::consume`) → `Auth::login()` directly, redirect by role.
- **Deliberate trade-off**: the profile (name/avatar/username) is only re-synced from SSO when logging in via SSO; users who always log in by email don't get automatic profile updates.
- **Anti email-enumeration**: the `POST /auth/fallback` response is ALWAYS the same generic message ("if the email is registered, the link has been sent") whether the email is valid, invalid, or the user is banned; it never leaks account status through the response.
- Email sending failures (e.g. Resend down, wrong API key) are caught with try/catch and don't cause a 500; they are recorded to `ActivityLog` (action `auth.fallback_mail_error`) and the normal Laravel log, and the user still gets the same generic response.
- `ActivityLog::record()` falls back to the subject user's ID if no user is logged in (`auth()->id()` is null); this is needed specifically for this flow because the request comes from a guest, not an already-authenticated user/admin like the other actions recorded in the activity log.
- The token is stored **hashed** (SHA-256) in `sso_fallback_tokens`; the raw token only exists in the email link, the same pattern as Laravel's built-in `password_reset_tokens`.
- **Second path (CLI)**: `php artisan sso:emergency-login {identifier=super_admin}` (`app/Console/Commands/IssueEmergencyLoginLink.php`) reuses the same `SsoFallbackToken::issueFor()`, just issued from a terminal (requires SSH access to the server) instead of a form. Useful when the mail service isn't configured yet or you need instant access without waiting for email. Full usage guide: [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

### Resend (Email)
- The only email provider supported right now, configured from the `/admin/settings` Email tab (`mail_settings` table, encrypted api_key), not `.env`.
- `MailSettingsService::send()` sets the config `services.resend.key`/`mail.from.*` at runtime before sending (the same pattern as `StorageSettingsService::disk()`, which builds an ad-hoc S3 disk from DB credentials), then `Mail::mailer('resend')->send(...)`.
- The `resend/resend-php` package (Laravel's native `resend` mail transport; `config/mail.php` already has its stub out of the box in Laravel 12).
- If `api_key` hasn't been filled in, `MailSettingsService::isConfigured()` returns false, and features that depend on email (login without SSO) silently skip sending without an error to the user.

### RanobeDB REST API
- Endpoint: see [`docs/RANOBEDB_INTEGRATION.md`](RANOBEDB_INTEGRATION.md) for full details (no auth, three-level model Series → Books → Releases).
- Used specifically for **light novel** metadata, parallel to AniList (which is still used for manga/manhwa/manhua), accessed from `Admin/RanobeDb/Index.tsx` + `RanobeDbController` + `RanobeDbService`.
- Staff is split natively into `authors` and `illustrators` (separate columns on `series`), unlike AniList, which merges all staff into one list.
- Re-syncing metadata to an existing series is available from the "Sync RanobeDB" Popover on the Edit Series page (same pattern as "Sync AniList").
- Handles RanobeDB's date sentinel `99999999` (meaning "ongoing/undetermined") explicitly in `RanobeDbService`, not parsed as a literal date.

### Puter.js (client-side AI)
- The default provider for the "Genre Taste" feature (AI funfact on the user dashboard); the script `https://js.puter.com/v2/` is loaded globally through `resources/views/app.blade.php` and called from `resources/js/lib/puter.ts` (`window.puter.ai.chat()`).
- Runs entirely in the user's browser, free, with no server-side API key; unlike the Gemini/OpenAI/Claude providers, which need an `api_key` stored in the `ai_settings` table and generate server-side through `AiFunfactService`.
- If the `ai_settings` table has no row at all, the app defaults to the `puter` provider. Admins can switch providers from the `/admin/settings` AI tab.
- Auto-generate (when the user's collection grows significantly) and manual generate (a button on the dashboard, limited by the quota `GenreFunfact::DEFAULT_MANUAL_QUOTA` = 5/week, overridable per user by admin at `/admin/funfact-quota`) are both supported for the Puter provider; the result generated in the browser is sent back to the server via `dashboard.funfact.auto-save`/`dashboard.funfact.regenerate` to be saved in `genre_funfacts`.
- Server-side providers (Gemini/OpenAI/Claude) that reply HTTP 429 (rate limit) are thrown as `AiRateLimitException`, caught specifically in `DashboardController` so the funfact falls back to default text without consuming the user's manual regenerate quota.

---

## 9. Multi-Language System (id/en/ja)

- **Frontend:** `react-i18next`, per-namespace JSON resources in `resources/js/lang/{id,en,ja}/` (`common`, `dashboard`, `user`, `catalog`, `collection`, `admin`). Registered in `resources/js/lib/i18n.ts`. Used via `useTranslation(namespace)` → `t('key')`, or cross-namespace via `t('namespace:key')`.
- **Locale is stored per user:** column `users.locale` (default `id`), changed from the "Bahasa" card on the Settings page or directly from `LanguageSwitcher.tsx` in the sidebar footer (Admin & User Layout), with no need to open Settings.
- **Propagation to the frontend:** the `SetLocale` middleware sets `App::setLocale()` server-side on every request, `HandleInertiaRequests` shares it as the `locale` prop; `resources/js/app.tsx` reads this prop before the first render (avoiding a flash of the wrong language), and `AdminLayout`/`UserLayout` each have a `useEffect` watching `locale` changes for subsequent navigation.
- **Backend:** `lang/{id,en,ja}/validation.php` and `lang/{id,en,ja}/pagination.php`, published manually from stock Laravel so validation/paginator messages follow the active language (previously always English because `lang/` had never been published). `config/app.php` locale/fallback_locale default to `id`.
- **Flash messages:** `lang/{id,en,ja}/flash.php`; all `->with('success'/'error'/'info', ...)` across every controller (~70 calls, 24 files) call `__('flash.namespace.key', ['param' => $value])`, not hardcoded strings. Laravel `:key` placeholders (`:count`, `:name`, `:number`, etc.); confirmed that `:count` is safe to use as a normal placeholder in `__()` (not `trans_choice()`, so it doesn't trigger pluralization logic). Exceptions that are intentionally not translated: raw exception messages (`$e->getMessage()`, usually from external APIs) and text in `ActivityLog::record()` (the admin activity log, stays Indonesian; not a per-locale flash toast).
- **Sidebar menu labels** (from the `menus` table, raw Indonesian text in the DB) are mapped to translation keys via `menuTranslationKey()` (`resources/js/lib/menu.ts`), falling back to the DB label if the key is unknown (e.g. an admin renamed it manually).
- **Series type filter** (a Segmented Control repeated across many pages) uses `useTypeFilterOptions()` (`resources/js/lib/typeFilters.ts`) so translations aren't duplicated.
- **Current coverage:** see the "Multi-Language System" section of [`CLAUDE.md`](../CLAUDE.md) for the list of pages that are/aren't translated yet; that list is updated every time a new page finishes translation.
