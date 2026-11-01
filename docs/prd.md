# PRD — Malas (Manga Library Admin System)

**Version:** 2.6
**Date:** 2026-06-26, updated 2026-08-03
**Status:** Active

---

## 1. Background

Physical manga collectors struggle to track their collections: which volumes they own, their condition, and who is borrowing them. Managing this manually in a spreadsheet does not scale and cannot be accessed in real time.

Malas v2 is a full rebuild on a new stack (React + Inertia) for a more modern UI (inspired by MangaDex) that is easier to maintain in the long run.

**Changes from v1:** Filament removed and replaced with React 19 + Inertia.js v2 + shadcn/ui.

---

## 2. User Personas

### Admin / Collection Owner
> "I want to know exactly where each of my volumes is, and who is holding it right now."

- Role: `admin` or `super_admin`
- Collection of 200+ volumes, often lent to friends
- Goal: fast input, loan tracking, nothing gets lost

### User / Friend Borrower
> "I want to see the available collection and check the status of my loans."

- Role: `user`
- Occasionally borrows manga, not regularly
- Goal: browse the catalog, manage their own collection, record loans

---

## 3. Roles

| Role | Description |
|------|-------------|
| `super_admin` | Full access. Cannot be banned. Can manage roles. |
| `admin` | Full access except managing `super_admin` and role management. |
| `user` | Browse the catalog (read-only), manage their own collection and loans. |

---

## 4. Features

### F-01 — Authentication
- Login via Yado SSO (PKCE-based OAuth2); there is no local register/login form
- All accounts (including admins) are managed on the SSO side; Malas only stores `sso_id`, `name`, `username`, `email`, `avatar` from the SSO claims
- Profile is shown read-only at `/settings` (profile editing is done on the SSO side)
- Session management via the standard Laravel session after a successful SSO callback

### F-02 — Menu Management *(Admin)*

Admins control which menus are shown and their status:

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Display name in the sidebar |
| `route_name` | string | Laravel route name |
| `icon` | string | Lucide icon name |
| `sort_order` | int | Order in the sidebar |
| `is_visible` | bool | Shown or hidden in the user sidebar |
| `is_maintenance` | bool | Maintenance mode on/off |
| `maintenance_message` | text | Custom message (has a default) |
| `role_access` | json array | Roles that can access it (`["admin","user"]`) |

**Maintenance mode behavior:**
- A user accessing a route under maintenance is redirected to the maintenance page with the message
- `admin` and `super_admin` are not blocked by maintenance mode
- A "maintenance" badge still shows in the admin sidebar as an indicator

### F-03 — Series Catalog *(Admin CRUD / User read-only)*

| Field | Description |
|-------|-------------|
| `title_romaji` | required |
| `slug` | auto-generated from `title_romaji`, used for the URLs `/catalog/{slug}` (user) and `/admin/series/{slug}` (admin); never entered manually |
| `title_english`, `title_japanese` | nullable |
| `status` | `publishing` / `finished` / `on_hiatus` / `discontinued` / `not_yet_published` |
| `type` | `manga` / `manhwa` / `manhua` / `novel` / `one_shot` / `doujinshi` |
| `cover_path` | manual upload or URL from AniList; accessed through `StorageSettingsService` (Local/S3-compatible, configured via the admin UI) |
| `synopsis` | text, nullable |
| `score` | decimal 0–10, nullable |
| `total_volumes` | int, nullable |
| `anilist_id` | unique, nullable |
| `genres`, `authors`, `themes`, `demographics` | json, nullable; from AniList |
| `is_adult` | boolean; used to blur 18+ content (opt-in per installation, Content tab in Settings) |
| `published_from` / `published_to` | date range, nullable |

User access:
- Browse the list + filters (status, type, title search, in collection or not, genre as a searchable multi-select combobox, OR-match: a series passes if it has any of the selected genres)
- View details: synopsis, full genre/theme/demographic, volume list, extra media gallery, avatars (without names) + the number of other users who collect this series
- "Add to Collection" button on the detail page
- Quick search via Global Search (⌘K) from any page

### F-04 — Volume Catalog *(Admin CRUD / User read-only)*

| Field | Description |
|-------|-------------|
| `volume_number` | int, required |
| `cover_path` | nullable, overrides the series cover |
| `type` | `regular` / `digital` / `bind_up` |
| `digital_source` | nullable (`mangaplus`, `k_manga`, `viz`, `comicwalker`, etc.) |
| `isbn` | nullable |
| `published_at` | date, nullable |

### F-05 — User Collection

Each user has one collection per series.

| Field | Description |
|-------|-------------|
| `user_id` | FK |
| `series_id` | FK |
| `acquired_at` | date, nullable |
| `notes` | text, nullable |
| `personal_rating` | smallint, nullable, -10 to 10 (MyAnimeList style; negative = not recommended) |
| `personal_review` | text, nullable; the user's personal comment about this series |

Within a collection, users record the volumes they own via `collection_volumes`. Users enter volume numbers as CSV (e.g. `1,2,3,5`) and pick a format per batch. Volumes are not tied to the admin `volumes` table; users decide for themselves which numbers they have.

**Volume formats:** `physical` / `ebook` / `online` / `webtoon`

**Read tracking:** each `collection_volume` has a `read_at` (nullable). Users toggle read/unread with the eye icon per volume (read volumes are shown greyed out), or mark everything at once with a single button. The collection datatable shows read progress (`N/M read`) and "Last read: Vol. N" is computed automatically from the highest-numbered volume that has been read.

**Read progress stepper (+/-):** a quick alternative to toggling eye icons one by one, intended for linear reading (reading in order from volume 1 upward). `+` marks the lowest-numbered unread volume as read, `-` flips the highest-numbered read volume back to unread. It only moves one boundary per click and does not touch volumes marked manually out of order via the eye icon.

**Quick-edit volume count per format (+/-):** a quick alternative to the "Add Volume" dialog (which stays for non-sequential/gap cases), meant for the common case of "add/remove one sequential volume". `+` adds the next-numbered volume not yet owned at all (volume numbers are shared across formats within one collection), `-` deletes the highest-numbered volume of the selected format. Volumes currently on loan are protected: the `-` button is disabled with a tooltip if the highest volume of that format is on loan, instead of silently switching the target to another volume.

**Volume delete mode:** the volume toolbar has a "Delete" toggle that turns the eye icon on each volume into a checkbox (same position) for bulk-delete selection, so it does not conflict with the mark-as-read action.

**How to add a series:** from the `/my-collection` page via a search dialog + multi-select. More than one series can be added at once.

Access:
- User: can only view and edit their own collection
- Admin: can view all collections of all users (grouped per user), including ownership details per volume

### F-06 — Loans

Users record volumes lent out from their collection:

| Field | Description |
|-------|-------------|
| `collection_id` | FK to the owner's collection |
| `collection_volume_id` | FK to `collection_volumes`; the user's volume that was lent |
| `borrower_name` | string (does not have to be a registered user) |
| `loaned_at` | date, required |
| `due_at` | date, nullable |
| `returned_at` | date, nullable; if filled in, status = returned |
| `notes` | text, nullable |

### F-07 — AniList API Integration *(Admin)*

- Search manga/manhwa/manhua/novel on AniList via the GraphQL API
- Preview data before import (card overlay, not a separate popover/modal)
- Import automatically fills all series fields including genre/author/theme/demographic
- If the AniList ID already exists: show info + a view button, not a duplicate
- Re-sync metadata onto an existing series ("Sync AniList" Popover in Edit Series)
- Filter to hide 18+ content when searching, 18+ badge in results
- **Batch import**: genre filter (dropdown, AniList enum) and release year (range `startDate_greater`/`startDate_lesser`, since AniList's `seasonYear` does not apply to manga), a toggle to sort by popularity (`POPULARITY_DESC`); browsing by genre/year alone without typing a title is allowed
- Per-result multi-select checkbox (only for series not yet in the catalog) + "Select All" + import in one go via a single GraphQL request (`id_in`), not N separate requests per series, to conserve AniList's rate-limit quota (~90 req/minute)
- "Hide those already in the catalog" toggle: a client-side filter, combined with the existing "Already imported" badge

### F-08 — Announcements

- Admin creates: title, body (markdown), type (info/warning/danger/success), active flag, start-end dates
- User: sees them on the dashboard, can dismiss each announcement
- Expired announcements are hidden automatically

### F-09 — User Management *(Admin)*

- List, view profile, ban/unban, change role
- Admins cannot upgrade users to/from `super_admin`
- Password reset does not apply; passwords are managed on the SSO side, not in Malas

### F-10 — Dashboard

**Admin:** stat cards + charts (Recharts): Series per Status, Collection per Type, Loan Status
**User:** stat cards, Collection per Status chart, recommendation Carousel (F-11), latest tickets widget

### F-11 — Recommendations & Surprise Me *(User)*

- The user dashboard shows series recommendations based on genre overlap with the user's collection, computed in PHP (not a raw JSON DB query) so it is portable between SQLite (dev) and MySQL (prod)
- Falls back to a random pick from series not yet collected if genre scoring yields no candidates (new user, or the rest of the catalog has no genre data yet)
- Each recommendation appears in a Carousel: cover, title, author, genre/tags, short synopsis
- "Surprise Me" button: picks one random series (genre-weighted, falling back to pure random) with a reveal dialog

### F-12 — Global Search & Command Palette

- **User side:** search bar in the header (desktop) / search icon (mobile), or ⌘K/Ctrl+K from any page; searches titles in the Catalog + the user's own Collection, or navigates quickly to other pages (fuzzy match, e.g. typing "loans" immediately shows the related menu)
- **Admin side:** Command Palette (⌘K/Ctrl+K): quick navigation to all admin pages + search Series/Users/Tickets

### F-13 — Storage & Database Backup *(Admin, super_admin only)*

- Configure the storage driver (`local` / `s3`-compatible such as Cloudflare R2) directly from the admin UI (`/admin/settings`, Storage tab), not `.env`
- All file operations (series/volume covers, extra media) go through `StorageSettingsService`
- Automatic file migration (Local ↔ S3) when the driver is changed, run in the background via a queue job
- Download/import database SQL dumps from the UI (Database tab), excluding sensitive tables

### F-14 — Ticket System

- Users create request tickets (e.g. asking for a new title to be added to the catalog) from the Tickets page or pre-filled from the Catalog
- Admins respond from the admin ticket detail page
- Status: `open`, `in_progress`, `resolved`, `closed`

### F-15 — Undo for Reversible Actions

- Toast notifications (sonner) can show an "Undo" button for reversible actions, driven from the session flash (`undo_url` + `undo_payload`)
- Examples: mark read per volume, mark-all-read (undo only reverts the volumes that action just changed, not all of them)

### F-16 — Wishlist *(User)*

- Users can mark series they want to read but have not collected yet (`wishlist_items`, unique per user+series)
- Different from Collection: no volume/format tracking, purely an interest marker
- Access: `/wishlist` (index), add from the Catalog page, remove with Undo (`restore`)

### F-17 — Public Profile & Follow *(User, opt-in)*

- Users can opt in to show a public profile (`users.is_profile_public`, default false) via a toggle in Settings
- The public profile (`/u/{username-or-id}`) **can be accessed without login**: guests can see the user's collection (cover + title, not clickable through to catalog details since that requires login), but cannot follow or see internal menus
- Logged-in users can follow/unfollow other users from a public profile or the User Directory (`/directory`, login required)
- User Directory: a list of users with `is_profile_public = true`, search and view other people's profiles
- Profile route model binding: try matching `username` first, fall back to `id`

### F-18 — Genre Taste (AI Funfact) *(User)*

- The user dashboard shows a genre word cloud from the collection + a short AI-generated "funfact" based on the user's collection patterns
- The AI provider is configured by the admin at `/admin/settings` AI tab: **Puter.js** (default; client-side, runs in the user's browser, free, no server API key) or Gemini/OpenAI/Claude (server-side, requires an `api_key` stored encrypted in `ai_settings`)
- Auto-regenerates when the user's collection grows significantly; manual generation is limited by quota (`GenreFunfact::DEFAULT_MANUAL_QUOTA` = 5x/week), and admins can override the quota per user at `/admin/funfact-quota`
- Rate limits (HTTP 429) from server-side providers are handled specifically (`AiRateLimitException`): the funfact falls back to text and does not cut into the user's manual regeneration quota
- The activity log records the `ai` category for funfact generate/error actions

### F-19 — Light Novel Metadata Import (RanobeDB) *(Admin)*

- Search and import light novel metadata from the [RanobeDB](https://ranobedb.org) REST API (no auth), in parallel with AniList: the manga/manhwa/manhua side keeps using AniList, RanobeDB is for light novels only
- Staff is split natively into `authors` and `illustrators` (separate columns), more detailed than AniList, which merges all staff
- The `99999999` date sentinel from RanobeDB (meaning ongoing) is handled explicitly, not parsed as a literal date
- Re-sync metadata onto an existing series ("Sync RanobeDB" Popover in Edit Series, same pattern as "Sync AniList")
- Duplicate import (same `ranobedb_id`) updates the existing series instead of creating a new one
- Full details: [`docs/RANOBEDB_INTEGRATION.md`](RANOBEDB_INTEGRATION.md)

### F-20 — Multi-Language (id/en/ja)

- The whole UI supports Indonesian (default), English, and Japanese; the preference is stored per user (`users.locale`)
- Switch language from the "Language" card in Settings or the quick-switch button in the sidebar footer (no need to open Settings)
- Built-in Laravel validation messages and paginator follow the user's active language (`lang/{id,en,ja}/validation.php`, `pagination.php`)
- **Mandatory for all new features**: every new user-facing text must have its translations prepared in all three languages right away, not deferred. All `User/**` and `Admin/**` pages are already fully translated; see [`CLAUDE.md`](../CLAUDE.md) for the full coverage and the still-documented gaps (controller flash messages)
- Controller flash messages (`->with('success', '...')`) are not yet part of the central translation system; this is a separate backlog item, noted in CLAUDE.md

### F-21 — Sidebar Menu Reorder *(Admin)*

- Admins can drag-and-drop the menu order at `/admin/menus` (`SortableMenuList.tsx`, `@dnd-kit`), which updates `menus.sort_order` directly via `PATCH /admin/menus/reorder`
- A user sidebar preview is available at `/admin/menus/user` to see the resulting arrangement without logging in as a regular user

### F-22 — Login with Email (Magic Link)

- A login option on par with SSO, chosen from the "Sign in to Malas" modal (`LoginMethodDialog.tsx`) that appears once the Login button on the Landing page is clicked; it is **no longer** just a small hidden link for emergencies (it was originally built as an SSO-down fallback, and promoted to a daily option once the mechanism proved safe)
- Identity is verified through ownership of the email inbox already synced from SSO; **not** a local password (none is stored) and **not** admin approval
- Tokens (`sso_fallback_tokens`) are stored hashed, 15-minute TTL, single-use
- Rate limit of 5x/10 minutes per request endpoint (raised from 3x/15 minutes after being promoted to a daily option); the response is always the same generic message (anti email-enumeration, does not leak account status)
- Requires a configured email provider (Resend, F-23); if not configured, this feature silently sends nothing (no error to the user)
- **Deliberate trade-off**: profile (name/avatar/username) is only re-synced from Yado on SSO login. Users who always log in via email do not get automatic profile updates; this was discussed and approved, not a bug
- The standalone `/auth/fallback` page remains available as a direct link (also used by the `sso:emergency-login` CLI, see F-24)

### F-23 — Email Configuration (Resend) *(Admin, super_admin only)*

- The email provider (Resend) is configured from `/admin/settings` Email tab; `api_key` is encrypted, same pattern as Storage/AI, not `.env`
- Used by the Login with Email feature (F-22)

### F-24 — Emergency Login via CLI *(Operator with server SSH access)*

- `php artisan sso:emergency-login {identifier=super_admin}` reuses the same magic link token as F-22, but is issued from the terminal instead of being sent by email
- The identifier can be a role (`super_admin`/`admin`/`user`) or a specific email/username; if several users share the same role, the command offers an interactive choice
- Always asks for confirmation and shows who will be granted access before issuing the link
- Useful when the mail service has not been configured yet (F-23), or when instant access is needed without waiting for an email; the only requirement is SSH access to the server, equivalent to direct database access

### F-25 — Light/Dark/System Theme

- 3 explicit theme options (not just a 2-state toggle); the preference is stored per user (`users.theme`, default `system`)
- Switch theme from the "Theme" card in Settings or the `ThemeSwitcher` (Popover) in the sidebar footer/Landing page, following exactly the same pattern as language switching (F-20)
- The `system` option resolves automatically from the OS preference (`prefers-color-scheme`) and live-updates if the OS preference changes while the app is open
- Guest-safe: the theme is kept in localStorage before login, and synced to the DB once logged in

---

## 5. Access Matrix

| Feature | super_admin | admin | user |
|---------|:-----------:|:-----:|:----:|
| Dashboard | ✓ | ✓ | ✓ |
| Menu Management | ✓ | ✓ | — |
| User Management | ✓ | ✓ | — |
| Role Management | ✓ | — | — |
| Series: view | ✓ | ✓ | ✓ |
| Series: CRUD | ✓ | ✓ | — |
| Volume: view | ✓ | ✓ | ✓ |
| Volume: CRUD | ✓ | ✓ | — |
| Collection: all users | ✓ | ✓ | — |
| Collection: own (including read tracking, review & rating) | ✓ | ✓ | ✓ |
| Loans: all | ✓ | ✓ | — |
| Loans: own | ✓ | ✓ | ✓ |
| AniList Import | ✓ | ✓ | — |
| Announcements: CRUD | ✓ | ✓ | — |
| Announcements: view | ✓ | ✓ | ✓ |
| Tickets: respond | ✓ | ✓ | — |
| Tickets: create & view own | ✓ | ✓ | ✓ |
| Activity Log | ✓ | ✓ | — |
| Storage & Database Backup | ✓ | — | — |
| Global Search / Command Palette | ✓ | ✓ | ✓ |
| Wishlist | ✓ | ✓ | ✓ |
| Public Profile & Follow | ✓ | ✓ | ✓ |
| User Directory | ✓ | ✓ | ✓ |
| Genre Taste (AI Funfact): view & generate | ✓ | ✓ | ✓ |
| AI Funfact Quota: manage | ✓ | ✓ | — |
| AI Provider Configuration | ✓ | — | — |
| RanobeDB Import | ✓ | ✓ | — |
| Sidebar Menu Reorder | ✓ | ✓ | — |
| Change Language (id/en/ja) | ✓ | ✓ | ✓ |
| Login with Email (Magic Link) | ✓ | ✓ | ✓ |
| Email Configuration (Resend) | ✓ | — | — |
| Emergency Login via CLI | ✓ (needs SSH access) | ✓ (needs SSH access) | — |

---

## 6. Out of Scope

- Native mobile app
- Marketplace / buying and selling
- Payment integration
- Scraping beyond AniList/RanobeDB
- Activity feed on public profiles (Steam style): public profile + follow is already built (F-17), the activity feed is still deferred
- Genre taste badges/labels ("Genre Explorer" vs "Genre Loyalist") based on the collection's genre distribution: deferred, piggybacks on the same data as the Genre Taste feature (F-18)
